import { Injectable } from '@nestjs/common';
import { Candle, PatternResult } from '../dto/kline-pattern.dto';

/**
 * 孕线形态识别器
 * 包括：孕线、十字孕线
 */
@Injectable()
export class HaramiPatterns {
  
  /**
   * 检测所有孕线形态
   * @param candles K线数据数组（按时间倒序，[0]为最新，[1]为前一日）
   * @returns 检测到的形态列表
   */
  detect(candles: Candle[]): PatternResult[] {
    const patterns: PatternResult[] = [];
    
    if (!candles || candles.length < 2) {
      return patterns;
    }

    const current = candles[0];
    const previous = candles[1];

    // 检测各种形态
    const bullishHarami = this.detectBullishHarami(previous, current);
    if (bullishHarami) patterns.push(bullishHarami);

    const bearishHarami = this.detectBearishHarami(previous, current);
    if (bearishHarami) patterns.push(bearishHarami);

    const haramiDoji = this.detectHaramiDoji(previous, current);
    if (haramiDoji) patterns.push(haramiDoji);

    return patterns;
  }

  /**
   * 看涨孕线形态 (Bullish Harami) - 看涨信号
   * 特征：
   * 1. 前一日是长阴线（下跌趋势中）
   * 2. 当日是小阳线，且完全被前一日实体包裹
   * 3. 表示下跌动能减弱，可能反转
   */
  private detectBullishHarami(previous: Candle, current: Candle): PatternResult | null {
    // 规则1：前一日是阴线
    if (previous.close >= previous.open) {
      return null;
    }

    // 规则2：当日是阳线
    if (current.close <= current.open) {
      return null;
    }

    // 计算实体范围
    const prevBodyTop = Math.max(previous.open, previous.close);
    const prevBodyBottom = Math.min(previous.open, previous.close);
    const currBodyTop = Math.max(current.open, current.close);
    const currBodyBottom = Math.min(current.open, current.close);

    // 规则3：当日实体完全被前一日实体包裹
    if (currBodyBottom < prevBodyBottom || currBodyTop > prevBodyTop) {
      return null;
    }

    // 规则4：前一日实体足够大（相对于整体波动）
    const prevBodySize = prevBodyTop - prevBodyBottom;
    const prevRange = previous.high - previous.low;
    if (prevBodySize < prevRange * 0.5) {
      return null; // 前一日实体不够大
    }

    // 规则5：当日实体相对较小
    const currBodySize = currBodyTop - currBodyBottom;
    if (currBodySize > prevBodySize * 0.5) {
      return null; // 当日实体太大，不符合孕线特征
    }

    // 计算置信度
    const confidence = this.calculateHaramiConfidence(previous, current, 'bullish');

    return {
      patternType: 'bullish_harami',
      patternName: '看涨孕线',
      confidence,
      signal: 'buy',
      description: '阴线内出现小阳线，下跌动能减弱，看涨反转信号'
    };
  }

  /**
   * 看跌孕线形态 (Bearish Harami) - 看跌信号
   * 特征：
   * 1. 前一日是长阳线（上涨趋势中）
   * 2. 当日是小阴线，且完全被前一日实体包裹
   * 3. 表示上涨动能减弱，可能反转
   */
  private detectBearishHarami(previous: Candle, current: Candle): PatternResult | null {
    // 规则1：前一日是阳线
    if (previous.close <= previous.open) {
      return null;
    }

    // 规则2：当日是阴线
    if (current.close >= current.open) {
      return null;
    }

    // 计算实体范围
    const prevBodyTop = Math.max(previous.open, previous.close);
    const prevBodyBottom = Math.min(previous.open, previous.close);
    const currBodyTop = Math.max(current.open, current.close);
    const currBodyBottom = Math.min(current.open, current.close);

    // 规则3：当日实体完全被前一日实体包裹
    if (currBodyBottom < prevBodyBottom || currBodyTop > prevBodyTop) {
      return null;
    }

    // 规则4：前一日实体足够大（相对于整体波动）
    const prevBodySize = prevBodyTop - prevBodyBottom;
    const prevRange = previous.high - previous.low;
    if (prevBodySize < prevRange * 0.5) {
      return null; // 前一日实体不够大
    }

    // 规则5：当日实体相对较小
    const currBodySize = currBodyTop - currBodyBottom;
    if (currBodySize > prevBodySize * 0.5) {
      return null; // 当日实体太大，不符合孕线特征
    }

    // 计算置信度
    const confidence = this.calculateHaramiConfidence(previous, current, 'bearish');

    return {
      patternType: 'bearish_harami',
      patternName: '看跌孕线',
      confidence,
      signal: 'sell',
      description: '阳线内出现小阴线，上涨动能减弱，看跌反转信号'
    };
  }

  /**
   * 十字孕线形态 (Harami Doji) - 强反转信号
   * 特征：
   * 1. 前一日是大实体K线（可以是阳线或阴线）
   * 2. 当日是十字星（开盘价≈收盘价），且被前一日实体包裹
   * 3. 反转信号比普通孕线更强、更有效
   */
  private detectHaramiDoji(previous: Candle, current: Candle): PatternResult | null {
    // 规则1：前一日必须有大实体
    const prevBodyTop = Math.max(previous.open, previous.close);
    const prevBodyBottom = Math.min(previous.open, previous.close);
    const prevBodySize = prevBodyTop - prevBodyBottom;
    const prevRange = previous.high - previous.low;
    
    if (prevBodySize < prevRange * 0.5) {
      return null; // 前一日实体不够大
    }

    // 规则2：当日必须是十字星（开盘价≈收盘价）
    const currBodySize = Math.abs(current.close - current.open);
    const currRange = current.high - current.low;
    
    // 十字星定义：实体很小，相对于整体波动可以忽略
    if (currBodySize > currRange * 0.1) {
      return null; // 实体不够小，不是真正的十字星
    }

    // 规则3：当日实体完全被前一日实体包裹
    const currBodyTop = Math.max(current.open, current.close);
    const currBodyBottom = Math.min(current.open, current.close);
    
    if (currBodyBottom < prevBodyBottom || currBodyTop > prevBodyTop) {
      return null;
    }

    // 判断信号类型：根据前一日K线类型
    const isPreviousBullish = previous.close > previous.open;
    const signal = isPreviousBullish ? 'sell' : 'buy';
    const patternName = isPreviousBullish ? '看跌十字孕线' : '看涨十字孕线';
    const description = isPreviousBullish 
      ? '上涨趋势中出现十字孕线，强烈看跌反转信号' 
      : '下跌趋势中出现十字孕线，强烈看涨反转信号';

    // 十字孕线的置信度比普通孕线更高
    const confidence = this.calculateHaramiDojiConfidence(previous, current);

    return {
      patternType: 'harami_doji',
      patternName,
      confidence,
      signal,
      description
    };
  }

  /**
   * 计算普通孕线形态的置信度
   */
  private calculateHaramiConfidence(
    previous: Candle,
    current: Candle,
    type: 'bullish' | 'bearish'
  ): number {
    let confidence = 0.70; // 基础置信度略低于吞没形态

    const prevBodySize = Math.abs(previous.close - previous.open);
    const currBodySize = Math.abs(current.close - current.open);
    const prevRange = previous.high - previous.low;

    // 前一日实体越大，置信度越高
    const prevBodyRatio = prevBodySize / prevRange;
    if (prevBodyRatio > 0.6) confidence += 0.05;
    if (prevBodyRatio > 0.8) confidence += 0.05;

    // 当日实体越小，置信度越高
    const bodyRatio = currBodySize / prevBodySize;
    if (bodyRatio < 0.3) confidence += 0.1;
    if (bodyRatio < 0.2) confidence += 0.05;

    return Math.min(1, confidence);
  }

  /**
   * 计算十字孕线形态的置信度（比普通孕线更高）
   */
  private calculateHaramiDojiConfidence(
    previous: Candle,
    current: Candle
  ): number {
    let confidence = 0.80; // 十字孕线基础置信度更高

    const prevBodySize = Math.abs(previous.close - previous.open);
    const currBodySize = Math.abs(current.close - current.open);
    const prevRange = previous.high - previous.low;
    const currRange = current.high - current.low;

    // 前一日实体越大，置信度越高
    const prevBodyRatio = prevBodySize / prevRange;
    if (prevBodyRatio > 0.6) confidence += 0.05;
    if (prevBodyRatio > 0.8) confidence += 0.05;

    // 当日十字星越标准（实体越小），置信度越高
    const currBodyRatio = currBodySize / currRange;
    if (currBodyRatio < 0.05) confidence += 0.1; // 非常标准的十字星
    else if (currBodyRatio < 0.08) confidence += 0.05;

    return Math.min(1, confidence);
  }
}