import { Injectable, Logger } from '@nestjs/common';
import { Candle } from '../dto/kline-pattern.dto';

/**
 * 市场阶段位置枚举
 *
 * 把"当天蜡烛处在一段阶段性K线（通道）的什么位置"分类为 5 档：
 * - top    顶部区：价格处于近期通道高位（≥80% 分位）
 * - bottom 底部区：价格处于近期通道低位（≤20% 分位）
 * - up     上涨中段：中位区间 + 中长期 regime 向上
 * - down   下跌中段：中位区间 + 中长期 regime 向下
 * - flat   横盘中段：中位区间 + regime 不明/震荡
 * - unknown 数据不足（<60 根K线）
 *
 * 用途：K线形态定义需要知道"是在底部、顶部、上涨还是下跌时出现的"，
 * 形态置信度会按所处位置降权/保留（降权保留策略，不删除、不翻转信号）。
 */
export type MarketPosition = 'top' | 'bottom' | 'up' | 'down' | 'flat' | 'unknown';

/** regime（中长期方向）枚举 */
export type MarketRegime = 'up' | 'down' | 'flat' | 'unknown';

/**
 * 阶段位置分析结果
 */
export interface PositionAnalysis {
  /** 市场阶段位置 */
  position: MarketPosition;
  /** 中长期 regime（通道中位区间时用于区分 up/down/flat） */
  regime: MarketRegime;
  /** 当前收盘价在近期通道中的分位 0~1（数据不足时为 null） */
  channelPosition: number | null;
  /** 参与通道计算的K线数量 */
  channelWindow: number;
  /** 中文描述（写入 metadata / 页面展示） */
  description: string;
}

/** 阶段位置中文标签 */
export const MARKET_POSITION_TEXT: Record<MarketPosition, string> = {
  top: '顶部区',
  bottom: '底部区',
  up: '上涨中段',
  down: '下跌中段',
  flat: '横盘中段',
  unknown: '未知',
};

const REGIME_TEXT: Record<MarketRegime, string> = {
  up: '中长期向上',
  down: '中长期向下',
  flat: '中长期震荡',
  unknown: '数据不足',
};

/**
 * 阶段位置分类器
 *
 * 输入为按时间倒序（最新在前）的 K 线数组（getHistoricalCandles 的输出格式）。
 * 算法要点：
 * 1. 通道：取最近 CHANNEL_WINDOW(120) 根K线，计算最高价/最低价，
 *    channelPosition = (close - 通道最低) / (通道最高 - 通道最低)。
 * 2. regime：长周期均线（200/120/60，按数据量降级）+ 短均线(20) 的相对位置：
 *    close > maLong 且 maShort > maLong → up；
 *    close < maLong 且 maShort < maLong → down；
 *    其余 → flat。
 * 3. 合成：
 *    channelPosition ≥ 0.8 → top；≤ 0.2 → bottom；
 *    中位区间(0.2, 0.8) 内按 regime 分为 up / down / flat。
 */
@Injectable()
export class MarketPositionClassifier {
  private readonly logger = new Logger(MarketPositionClassifier.name);

  /** 通道窗口（K线数量），约 6 个月交易日 */
  static readonly CHANNEL_WINDOW = 120;
  /** 顶部区阈值（通道分位） */
  static readonly TOP_THRESHOLD = 0.8;
  /** 底部区阈值（通道分位） */
  static readonly BOTTOM_THRESHOLD = 0.2;
  /** 最小K线数量，不足则判定 unknown */
  static readonly MIN_BARS = 60;

  /**
   * 分析当天蜡烛所处的市场阶段位置
   * @param candles 按时间倒序（最新在前）的K线数组
   */
  classify(candles: Candle[]): PositionAnalysis {
    const n = candles.length;
    if (n < MarketPositionClassifier.MIN_BARS) {
      return {
        position: 'unknown',
        regime: 'unknown',
        channelPosition: null,
        channelWindow: 0,
        description: `K线数据不足${MarketPositionClassifier.MIN_BARS}根，无法判断阶段位置`,
      };
    }

    // 转成时间正序
    const asc = [...candles].reverse();
    const close = asc[asc.length - 1].close;

    // 1. 通道分位
    const windowSize = Math.min(MarketPositionClassifier.CHANNEL_WINDOW, n);
    const windowCandles = asc.slice(n - windowSize);
    let channelHigh = -Infinity;
    let channelLow = Infinity;
    for (const c of windowCandles) {
      if (c.high > channelHigh) channelHigh = c.high;
      if (c.low < channelLow) channelLow = c.low;
    }
    const channelPosition =
      channelHigh > channelLow
        ? (close - channelLow) / (channelHigh - channelLow)
        : 0.5;

    // 2. regime（长周期均线 + 短均线）
    const regime = this.computeRegime(asc, close);

    // 3. 合成位置
    let position: MarketPosition;
    if (channelPosition >= MarketPositionClassifier.TOP_THRESHOLD) {
      position = 'top';
    } else if (channelPosition <= MarketPositionClassifier.BOTTOM_THRESHOLD) {
      position = 'bottom';
    } else {
      position = regime === 'up' ? 'up' : regime === 'down' ? 'down' : 'flat';
    }

    const description =
      position === 'top' || position === 'bottom'
        ? `价格处于最近${windowSize}日通道${position === 'top' ? '高位(≥80%)' : '低位(≤20%)'}（分位 ${(channelPosition * 100).toFixed(0)}%）`
        : `价格处于最近${windowSize}日通道中段（分位 ${(channelPosition * 100).toFixed(0)}%），${REGIME_TEXT[regime]}`;

    return {
      position,
      regime,
      channelPosition: Math.round(channelPosition * 10000) / 10000,
      channelWindow: windowSize,
      description,
    };
  }

  /**
   * 按所处阶段位置对形态置信度做降权/保留（不删除、不翻转信号）。
   *
   * 直觉：看涨信号（buy）出现在底部区/下跌中段时最可信（保留或接近保留），
   * 出现在顶部区时最不可信（大幅降权）；看跌信号（sell）反之。
   *
   * @param signal 形态信号 buy/sell/neutral
   * @param position 市场阶段位置
   * @returns 置信度乘数 (0,1]
   */
  confidenceFactor(signal: 'buy' | 'sell' | 'neutral', position: MarketPosition): number {
    if (signal === 'neutral' || position === 'unknown') {
      return 1;
    }
    // 位置 → 因子（buy）
    const BUY_FACTORS: Record<MarketPosition, number> = {
      bottom: 1.0, // 底部区的看涨信号：保留
      down: 0.9,  // 下跌中段的看涨反转：较可信
      up: 0.8,    // 上涨中段：延续性质，适度保留
      flat: 0.8,  // 横盘中段：中性环境，适度保留
      top: 0.6,   // 顶部区的看涨信号：明显降权
      unknown: 1.0,
    };
    // 位置 → 因子（sell），与 buy 镜像
    const SELL_FACTORS: Record<MarketPosition, number> = {
      top: 1.0,
      up: 0.9,
      down: 0.8,
      flat: 0.8,
      bottom: 0.6,
      unknown: 1.0,
    };
    return signal === 'buy' ? BUY_FACTORS[position] : SELL_FACTORS[position];
  }

  /**
   * 计算中长期 regime
   * 长周期均线按数据量降级：≥200根用200，≥120根用120，否则用60
   */
  private computeRegime(asc: Candle[], close: number): MarketRegime {
    const n = asc.length;
    const maLongWindow = n >= 200 ? 200 : n >= 120 ? 120 : 60;
    if (n < maLongWindow || n < 20) {
      return 'unknown';
    }
    const maLong = this.smaLast(asc, maLongWindow);
    const maShort = this.smaLast(asc, 20);
    if (maLong == null || maShort == null || maLong <= 0) {
      return 'unknown';
    }
    if (close > maLong && maShort > maLong) {
      return 'up';
    }
    if (close < maLong && maShort < maLong) {
      return 'down';
    }
    return 'flat';
  }

  /** 计算最后一根K线的 SMA（正序数组） */
  private smaLast(asc: Candle[], window: number): number | null {
    if (asc.length < window) {
      return null;
    }
    const slice = asc.slice(asc.length - window);
    let sum = 0;
    for (const c of slice) {
      sum += c.close;
    }
    return sum / window;
  }
}
