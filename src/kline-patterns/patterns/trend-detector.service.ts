import { Injectable, Logger } from '@nestjs/common';
import { Candle, TrendAnalysis } from '../dto/kline-pattern.dto';

/**
 * 优化的K线趋势判定算法（上升 / 下降 / 横盘）
 * 
 * 相比传统均线金叉死叉的改进：
 * 1. 输出连续 score(-1~+1) 而非硬三分类，下游按业务阈值切分
 * 2. 主因子换成「窗口线性回归斜率 × R²」，R² 天然刻画"横盘 = 无线性结构"
 * 3. 所有距离类指标用 ATR 归一化，跨品种/跨价位可比
 * 4. 引入 Kaufman 效率系数 ER 与摆动点结构(HH/HL、LL/LH)做交叉验证
 * 5. 迟滞状态机抑制边界抖动 + 样本不足返回 unknown 而非 chop
 * 6. 结构因子纳入打分系统，平滑影响分数而非硬截断
 */

export type TrendState = 'uptrend' | 'downtrend' | 'sideways' | 'unknown';

export interface TrendResult {
  state: TrendState;
  /** 趋势强度 -1(强下降) ~ +1(强上升) */
  score: number;
  /** 置信度 0~1，由各因子一致性决定 */
  confidence: number;
  /** 多周期趋势状态（新增） */
  multiTimeframe?: {
    short: TrendState;      // 短期 (10-15 周期)
    medium: TrendState;     // 中期 (30 周期)
    long: TrendState;       // 长期 (60 周期)
    shortScore: number;     // 短期分数
    mediumScore: number;    // 中期分数
    longScore: number;      // 长期分数
  };
  /** 趋势萌芽状态（新增） */
  emergingTrend?: 'bounce' | 'pullback' | null;  // bounce=超跌反弹，pullback=回调
  components: {
    efficiency: number;  // ER 效率系数
    slope: number;       // 归一化回归斜率 (每根 K 线的相对变化)
    r2: number;          // 线性度
    maSpread: number;    // MA10-MA20 间距 (ATR 归一)
    structure: number;   // 摆动点结构 +1/-1/0
  };
}

export interface TrendOptions {
  /** 回归窗口，默认 30；形态识别场景建议 20~60，短线可缩至 15 */
  window?: number;
  /** 进入 up/down 的分数阈值 */
  enterThreshold?: number;
  /** 退出阈值，必须 < enterThreshold，形成迟滞带 */
  exitThreshold?: number;
  /** 摆动点左右确认 K 数 */
  swingK?: number;
  /** 结构确认回看窗口 */
  structureWindow?: number;
  /** 是否启用多周期趋势分析 */
  enableMultiTimeframe?: boolean;
  /** 是否启用趋势萌芽检测 */
  enableEmergingTrend?: boolean;
}

const DEFAULTS: Required<TrendOptions> = {
  window: 30,
  enterThreshold: 0.25,  // 降低进入阈值，使趋势更容易被识别
  exitThreshold: 0.20,   // 保持迟滞带
  swingK: 5,
  structureWindow: 60,
  enableMultiTimeframe: true,      // 默认启用多周期分析
  enableEmergingTrend: true,       // 默认启用趋势萌芽检测
};

@Injectable()
export class TrendDetectorService {
  private readonly logger = new Logger(TrendDetectorService.name);

  /**
   * 分析趋势状态（兼容旧接口）
   * @param candles K线数据数组（按时间倒序，[0]为最新）
   * @returns 趋势分析结果
   */
  analyzeTrend(candles: Candle[]): TrendAnalysis {
    this.logger.debug(`开始分析趋势: K线数量=${candles?.length || 0}`);
    
    if (!candles || candles.length < 10) {
      this.logger.debug(`K线数据不足(<10), 返回sideways状态`);
      return { trendState: 'sideways', description: '数据不足，无法判断趋势' };
    }

    // 转换为正序数组（从旧到新）
    const sortedCandles = [...candles].reverse();
    this.logger.debug(`K线数据已按时间正序排列`);
    
    // 使用最新一根K线的趋势评分
    const result = this.scoreTrendAt(sortedCandles, sortedCandles.length - 1);
    this.logger.debug(`趋势评分结果: state=${result.state}, score=${result.score.toFixed(4)}, confidence=${result.confidence.toFixed(4)}`);
    
    // 根据score和state转换为旧格式
    let trendState: 'uptrend' | 'downtrend' | 'sideways' | 'unknown';
    let description: string;

    if (result.state === 'unknown') {
      trendState = 'unknown';
      description = '数据不足，无法判断趋势';
      this.logger.debug(`最终趋势判定: unknown (${description})`);
    } else {
      // 对单点判断应用阈值逻辑
      const o = DEFAULTS;
      const s = result.score;
      
      if (s > o.enterThreshold) {
        trendState = 'uptrend';
        description = `上升趋势：趋势强度 ${result.score.toFixed(2)}，置信度 ${(result.confidence * 100).toFixed(0)}%`;
        this.logger.debug(`最终趋势判定: uptrend (${description})`);
      } else if (s < -o.enterThreshold) {
        trendState = 'downtrend';
        description = `下降趋势：趋势强度 ${result.score.toFixed(2)}，置信度 ${(result.confidence * 100).toFixed(0)}%`;
        this.logger.debug(`最终趋势判定: downtrend (${description})`);
      } else {
        trendState = 'sideways';
        description = `横盘趋势：趋势强度 ${result.score.toFixed(2)}，各因子方向不一致`;
        this.logger.debug(`最终趋势判定: sideways (${description})`);
      }
    }

    return { 
      trendState, 
      description,
      score: result.score,
      confidence: result.confidence,
      components: result.components,
    };
  }

  /**
   * 获取趋势强度评分（0-1）- 兼容旧接口
   */
  getTrendStrength(candles: Candle[]): number {
    if (!candles || candles.length < 10) {
      return 0;
    }

    const sortedCandles = [...candles].reverse();
    const result = this.scoreTrendAt(sortedCandles, sortedCandles.length - 1);
    
    // 将score的绝对值映射到0-1
    return Math.abs(result.score);
  }

  /**
   * 单根K线的趋势打分（核心算法）
   * @param klines K线数据（正序，从旧到新）
   * @param endIndex 当前评估的K线索引
   * @param opts 配置选项
   */
  scoreTrendAt(klines: Candle[], endIndex: number, opts: TrendOptions = {}): TrendResult {
    const o = { ...DEFAULTS, ...opts };
    const minBars = Math.max(o.window, o.structureWindow) + 5;
    
    this.logger.debug(`开始趋势分析:  endIndex=${endIndex}, 总K线数=${klines.length}, 最小需要=${minBars}`);
    
    if (endIndex < minBars) {
      this.logger.debug(`数据不足: endIndex(${endIndex}) < minBars(${minBars}), 返回unknown状态`);
      return { 
        state: 'unknown', 
        score: 0, 
        confidence: 0,
        components: { efficiency: 0, slope: 0, r2: 0, maSpread: 0, structure: 0 } 
      };
    }

    const win = klines.slice(endIndex - o.window + 1, endIndex + 1);
    const closes = win.map((k) => k.close);
    this.logger.debug(`使用窗口数据: ${win.length}根K线, 价格范围: ${Math.min(...closes).toFixed(2)}-${Math.max(...closes).toFixed(2)}`);

    // 1. 线性回归斜率 × R²
    const { slope, r2 } = this.regression(closes);
    // 斜率 × 线性度：趋势明显且走得"直"才给高分，震荡市 r2 低会被压制
    const sSlope = this.tanh(slope * 100 * r2);
    this.logger.debug(`因子1-回归分析: 斜率=${slope.toFixed(6)}, R²=${r2.toFixed(4)}, 标准化后=${sSlope.toFixed(4)}`);

    // 2. Kaufman 效率系数
    const er = this.efficiencyRatio(klines.map((k) => k.close), 20) ?? 0;
    const sEr = this.clamp(er, -1, 1);
    this.logger.debug(`因子2-Kaufman效率系数: 原始值=${er.toFixed(4)}, 标准化后=${sEr.toFixed(4)}`);

    // 3. 均线排列（ATR归一化）
    const all = klines.slice(0, endIndex + 1);
    const a = this.atr(all)[endIndex] ?? 0;
    const ma10 = this.sma(all.map((k) => k.close), 10)[endIndex] ?? 0;
    const ma20 = this.sma(all.map((k) => k.close), 20)[endIndex] ?? 0;
    const sMa = a > 0 ? this.tanh((ma10 - ma20) / (a * 3)) : 0;
    this.logger.debug(`因子3-均线排列: ATR=${a.toFixed(4)}, MA10=${ma10.toFixed(2)}, MA20=${ma20.toFixed(2)}, 差值=${(ma10-ma20).toFixed(4)}, 标准化后=${sMa.toFixed(4)}`);

    // 4. 摆动点结构
    const structureData = klines.slice(
      Math.max(0, endIndex - o.structureWindow + 1), 
      endIndex + 1
    );
    const structure = this.swingStructure(structureData, o.swingK);
    const sStructure = this.clamp(structure, -1, 1);
    this.logger.debug(`因子4-摆动点结构: 原始值=${structure}, 标准化后=${sStructure.toFixed(4)}`);

    // 综合打分：四个因子加权（结构因子占 15%，参与打分而非硬过滤）
    const score = 0.35 * sEr + 0.30 * sSlope + 0.20 * sMa + 0.15 * sStructure;
    this.logger.debug(`综合评分计算：0.35*${sEr.toFixed(4)} + 0.30*${sSlope.toFixed(4)} + 0.20*${sMa.toFixed(4)} + 0.15*${sStructure.toFixed(4)} = ${score.toFixed(4)}`);
    
    // 多周期趋势分析（新增）
    let multiTimeframe: TrendResult['multiTimeframe'] | undefined;
    if (o.enableMultiTimeframe) {
      multiTimeframe = this.analyzeMultiTimeframe(klines, endIndex, o);
      this.logger.debug(`多周期分析：短期=${multiTimeframe?.short}, 中期=${multiTimeframe?.medium}, 长期=${multiTimeframe?.long}`);
    }
    
    // 趋势萌芽检测（新增）
    let emergingTrend: TrendResult['emergingTrend'] | undefined;
    if (o.enableEmergingTrend) {
      emergingTrend = this.detectEmergingTrend(klines, endIndex, score, o);
      if (emergingTrend) {
        this.logger.debug(`趋势萌芽检测：${emergingTrend === 'bounce' ? '超跌反弹' : '回调'}`);
      }
    }

    // 置信度：四个因子方向越一致越高
    const signs = [Math.sign(sEr), Math.sign(sSlope), Math.sign(sMa), Math.sign(sStructure)];
    const agreement = Math.abs(signs.reduce((a, b) => a + b, 0)) / 4;
    const confidence = this.clamp(agreement * 0.75 + Math.abs(score) * 0.25, 0, 1);
    this.logger.debug(`置信度计算: 因子方向=[${signs.join(',')}], 一致性=${agreement.toFixed(4)}, 最终置信度=${confidence.toFixed(4)}`);
    
    // 根据得分确定初步趋势状态
    let determinedState: 'uptrend' | 'downtrend' | 'sideways';
    if (score > o.enterThreshold) {
      determinedState = 'uptrend';
    } else if (score < -o.enterThreshold) {
      determinedState = 'downtrend';
    } else {
      determinedState = 'sideways';
    }
    this.logger.debug(`趋势判定: score=${score.toFixed(4)} vs threshold=${o.enterThreshold}, 判定结果=${determinedState}`);

    return {
      state: determinedState, // 返回确定的状态
      score,
      confidence,
      multiTimeframe,
      emergingTrend: emergingTrend ?? null,
      components: { 
        efficiency: sEr, 
        slope, 
        r2, 
        maSpread: sMa, 
        structure: sStructure 
      },
    };
  }

  /**
   * 序列分类：迟滞状态机
   * @param klines K线数据（正序）
   * @param opts 配置选项
   */
  classifySeries(klines: Candle[], opts: TrendOptions = {}): TrendResult[] {
    this.logger.debug(`开始序列分类: K线数量=${klines.length}`);
    const o = { ...DEFAULTS, ...opts };
    const out: TrendResult[] = [];
    let prev: TrendState = 'sideways';

    for (let i = 0; i < klines.length; i++) {
      const r = this.scoreTrendAt(klines, i, o);
      if (r.state === 'unknown') { 
        this.logger.debug(`索引${i}: 数据不足，保持unknown状态`);
        out.push(r); 
        continue; 
      }

      const s = r.score;
      let cur: TrendState;
      
      // 迟滞状态机逻辑
      if (prev !== 'uptrend' && s > o.enterThreshold) {
        cur = 'uptrend';
        this.logger.debug(`索引${i}: 从${prev}转为uptrend (score=${s.toFixed(4)} > ${o.enterThreshold})`);
      } else if (prev !== 'downtrend' && s < -o.enterThreshold) {
        cur = 'downtrend';
        this.logger.debug(`索引${i}: 从${prev}转为downtrend (score=${s.toFixed(4)} < ${-o.enterThreshold})`);
      } else if (prev === 'uptrend') {
        cur = s > o.exitThreshold ? 'uptrend' : (s < -o.enterThreshold ? 'downtrend' : 'sideways');
        this.logger.debug(`索引${i}: 前态uptrend, score=${s.toFixed(4)}, 当前=${cur}`);
      } else if (prev === 'downtrend') {
        cur = s < -o.exitThreshold ? 'downtrend' : (s > o.enterThreshold ? 'uptrend' : 'sideways');
        this.logger.debug(`索引${i}: 前态downtrend, score=${s.toFixed(4)}, 当前=${cur}`);
      } else {
        cur = 'sideways';
        this.logger.debug(`索引${i}: 前态sideways, score=${s.toFixed(4)}, 保持sideways`);
      }

      r.state = cur; 
      prev = cur; 
      out.push(r);
    }
    this.logger.debug(`序列分类完成: 最终状态=${prev}, 结果数量=${out.length}`);
    return out;
  }

  // ========== 新增优化方法 ==========

  /**
   * 多周期趋势分层分析
   * 分别计算短期 (10)、中期 (30)、长期 (60) 的趋势状态
   */
  private analyzeMultiTimeframe(
    klines: Candle[],
    endIndex: number,
    opts: Required<TrendOptions>
  ): NonNullable<TrendResult['multiTimeframe']> {
    const timeframes = [
      { name: 'short', window: 10 },
      { name: 'medium', window: 30 },
      { name: 'long', window: 60 }
    ] as const;

    const result = {
      short: 'unknown' as TrendState,
      medium: 'unknown' as TrendState,
      long: 'unknown' as TrendState,
      shortScore: 0,
      mediumScore: 0,
      longScore: 0
    };

    for (const tf of timeframes) {
      const minBars = tf.window + 5;
      if (endIndex < minBars) continue;

      const win = klines.slice(endIndex - tf.window + 1, endIndex + 1);
      const closes = win.map(k => k.close);
      const { slope, r2 } = this.regression(closes);
      const sSlope = this.tanh(slope * 100 * r2);

      const all = klines.slice(0, endIndex + 1);
      const er = this.efficiencyRatio(all.map(k => k.close), Math.min(20, tf.window)) ?? 0;
      const sEr = this.clamp(er, -1, 1);

      const a = this.atr(all)[endIndex] ?? 0;
      const maShort = this.sma(all.map(k => k.close), Math.min(10, tf.window))[endIndex] ?? 0;
      const maLong = this.sma(all.map(k => k.close), Math.min(20, tf.window * 2 / 3))[endIndex] ?? 0;
      const sMa = a > 0 ? this.tanh((maShort - maLong) / (a * 3)) : 0;

      const structureData = klines.slice(Math.max(0, endIndex - opts.structureWindow + 1), endIndex + 1);
      const structure = this.swingStructure(structureData, opts.swingK);
      const sStructure = this.clamp(structure, -1, 1);

      const score = 0.35 * sEr + 0.30 * sSlope + 0.20 * sMa + 0.15 * sStructure;
      
      if (tf.name === 'short') {
        result.shortScore = score;
        result.short = score > opts.enterThreshold ? 'uptrend' : score < -opts.enterThreshold ? 'downtrend' : 'sideways';
      } else if (tf.name === 'medium') {
        result.mediumScore = score;
        result.medium = score > opts.enterThreshold ? 'uptrend' : score < -opts.enterThreshold ? 'downtrend' : 'sideways';
      } else {
        result.longScore = score;
        result.long = score > opts.enterThreshold ? 'uptrend' : score < -opts.enterThreshold ? 'downtrend' : 'sideways';
      }
    }

    return result;
  }

  /**
   * 趋势萌芽/反弹检测
   * 当短期分数连续上升、但中期还没到趋势阈值时标记为反弹/回调
   */
  private detectEmergingTrend(
    klines: Candle[],
    endIndex: number,
    currentScore: number,
    opts: Required<TrendOptions>
  ): 'bounce' | 'pullback' | null {
    // 检查最近 5 根 K 线的分数变化
    if (endIndex < 5) return null;

    const scores: number[] = [];
    for (let i = endIndex - 5; i <= endIndex; i++) {
      const r = this.scoreTrendAt(klines, i, { ...opts, enableMultiTimeframe: false, enableEmergingTrend: false });
      scores.push(r.score);
    }

    // 计算分数变化率
    const scoreChange = scores[scores.length - 1] - scores[0];
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

    // 超跌反弹：前期下降趋势，近期分数快速上升，但当前仍处横盘区间
    if (currentScore >= -0.1 && currentScore <= 0.15 && scoreChange > 0.3 && avgScore < -0.1) {
      return 'bounce';
    }

    // 回调：前期上升趋势，近期分数快速下降，但当前仍处横盘区间
    if (currentScore >= -0.15 && currentScore <= 0.1 && scoreChange < -0.3 && avgScore > 0.1) {
      return 'pullback';
    }

    return null;
  }

  // ========== 基础算子 ==========

  /**
   * 简单移动平均线
   */
  private sma(x: number[], n: number): (number | null)[] {
    const out: (number | null)[] = new Array(x.length).fill(null);
    let sum = 0;
    for (let i = 0; i < x.length; i++) {
      sum += x[i];
      if (i >= n) sum -= x[i - n];
      if (i >= n - 1) out[i] = sum / n;
    }
    return out;
  }

  /**
   * 平均真实波动范围 ATR
   * 修复：第一个有效值应该在索引 n 位置（而非 n-1）
   */
  private atr(k: Candle[], n = 14): (number | null)[] {
    const out: (number | null)[] = new Array(k.length).fill(null);
    
    if (k.length < n + 1) return out;

    let prev = k[0].close;
    let seed = 0;
    
    // 计算前n个TR的平均值作为初始ATR
    for (let i = 1; i <= n && i < k.length; i++) {
      const tr = Math.max(
        k[i].high - k[i].low,
        Math.abs(k[i].high - prev),
        Math.abs(k[i].low - prev),
      );
      seed += tr; 
      prev = k[i].close;
    }
    
    // 修复：初始ATR赋值给索引 n（而非 n-1）
    out[n] = seed / n;
    
    // 递归计算后续ATR
    for (let i = n + 1; i < k.length; i++) {
      const tr = Math.max(
        k[i].high - k[i].low,
        Math.abs(k[i].high - k[i - 1].close),
        Math.abs(k[i].low - k[i - 1].close),
      );
      out[i] = ((out[i - 1] as number) * (n - 1) + tr) / n;
    }
    
    return out;
  }

  /**
   * Kaufman 效率系数：方向位移 / 路径总长度，∈[-1,1]
   */
  private efficiencyRatio(closes: number[], n = 20): number | null {
    if (closes.length < n + 1) return null;
    const c = closes.slice(-(n + 1));
    let path = 0;
    for (let i = 1; i < c.length; i++) {
      path += Math.abs(c[i] - c[i - 1]);
    }
    if (path === 0) return 0;
    return (c[c.length - 1] - c[0]) / path;
  }

  /**
   * 最小二乘回归，返回归一化斜率与 R²
   */
  private regression(y: number[]): { slope: number; r2: number } {
    const n = y.length;
    const meanX = (n - 1) / 2;
    const meanY = y.reduce((a, b) => a + b, 0) / n;
    let num = 0, denX = 0, ssTot = 0;
    
    for (let i = 0; i < n; i++) {
      num += (i - meanX) * (y[i] - meanY);
      denX += (i - meanX) ** 2;
      ssTot += (y[i] - meanY) ** 2;
    }
    
    const slope = denX === 0 ? 0 : num / denX;
    const ssRes = y.reduce((acc, v, i) => acc + (v - (meanY + slope * (i - meanX))) ** 2, 0);
    const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
    
    return { slope: slope / meanY, r2: Math.max(0, Math.min(1, r2)) };
  }

  /**
   * 摆动点结构：+1 出现 HH/HL，-1 出现 LL/LH，0 不满足
   * 修复：改用最高价识别高点、最低价识别低点
   */
  private swingStructure(klines: Candle[], k: number): number {
    const n = klines.length;
    const highs: number[] = [];
    const lows: number[] = [];
    
    // 使用最高价识别局部高点，最低价识别局部低点
    for (let i = k; i < n - k; i++) {
      let isHigh = true, isLow = true;
      for (let j = i - k; j <= i + k; j++) {
        if (j === i) continue;
        // 修复：高点用最高价比较，低点用最低价比较
        if (klines[j].high >= klines[i].high) isHigh = false;
        if (klines[j].low <= klines[i].low) isLow = false;
      }
      if (isHigh) highs.push(klines[i].high);
      if (isLow) lows.push(klines[i].low);
    }
    
    // 至少需要2个高点或低点才能判断结构
    const hh = highs.length >= 2 && highs[highs.length - 1] > highs[highs.length - 2];
    const hl = lows.length >= 2 && lows[lows.length - 1] > lows[lows.length - 2];
    const ll = lows.length >= 2 && lows[lows.length - 1] < lows[lows.length - 2];
    const lh = highs.length >= 2 && highs[highs.length - 1] < highs[highs.length - 2];
    
    if ((hh || hl) && !(ll || lh)) return 1;   // 上升结构
    if ((ll || lh) && !(hh || hl)) return -1;  // 下降结构
    return 0;  // 结构不明
  }

  // ========== 工具函数 ==========

  private clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  private tanh = Math.tanh;
}
