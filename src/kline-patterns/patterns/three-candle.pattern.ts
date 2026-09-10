import { Injectable } from '@nestjs/common';
import { Candle, PatternResult } from '../dto/kline-pattern.dto';

/**
 * 三根K线形态识别器
 * 包括：早晨之星、黄昏之星、三只乌鸦、三个白兵
 */
@Injectable()
export class ThreeCandlePatterns {
  
  /**
   * 检测所有三根K线形态
   * @param candles K线数据数组（按时间倒序，[0]为最新，[1]为前一日，[2]为前两日）
   * @returns 检测到的形态列表
   */
  detect(candles: Candle[]): PatternResult[] {
    const patterns: PatternResult[] = [];
    
    if (!candles || candles.length < 3) {
      return patterns;
    }

    const current = candles[0];
    const previous = candles[1];
    const twoDaysAgo = candles[2];

    // 检测各种形态
    const morningStar = this.detectMorningStar(twoDaysAgo, previous, current);
    if (morningStar) patterns.push(morningStar);

    const eveningStar = this.detectEveningStar(twoDaysAgo, previous, current);
    if (eveningStar) patterns.push(eveningStar);

    const threeBlackCrows = this.detectThreeBlackCrows(twoDaysAgo, previous, current);
    if (threeBlackCrows) patterns.push(threeBlackCrows);

    const threeWhiteSoldiers = this.detectThreeWhiteSoldiers(twoDaysAgo, previous, current);
    if (threeWhiteSoldiers) patterns.push(threeWhiteSoldiers);

    return patterns;
  }

  /**
   * 早晨之星 (Morning Star) - 看涨信号
   * 特征：
   * 1. 第一日是长阴线（下跌趋势延续）
   * 2. 第二日是小实体K线（十字星或小阳线/阴线，表示犹豫）
   * 3. 第三日是长阳线（上涨反转）
   */
  private detectMorningStar(first: Candle, second: Candle, third: Candle): PatternResult | null {
    const firstBodySize = Math.abs(first.close - first.open);
    const secondBodySize = Math.abs(second.close - second.open);
    const thirdBodySize = Math.abs(third.close - third.open);

    // 规则1：第一日是阴线
    if (first.close >= first.open) {
      return null;
    }

    // 规则2：第二日是小实体（不超过第一日的50%）
    if (secondBodySize > firstBodySize * 0.5) {
      return null;
    }

    // 规则3：第三日是阳线
    if (third.close <= third.open) {
      return null;
    }

    // 规则4：第三日收盘价高于第一日实体中点
    const firstBodyMid = (first.open + first.close) / 2;
    if (third.close <= firstBodyMid) {
      return null;
    }

    // 规则5：第二日实体位于第一日和第三日实体之间（_gap_）
    const firstBodyBottom = Math.min(first.open, first.close);
    const thirdBodyTop = Math.max(third.open, third.close);
    const secondBodyTop = Math.max(second.open, second.close);
    const secondBodyBottom = Math.min(second.open, second.close);

    // 第二日应该在下方有gap（可选条件，增强置信度）
    const hasGap = secondBodyTop < firstBodyBottom;

    // 计算置信度
    let confidence = 0.7;
    if (hasGap) confidence += 0.1;
    if (thirdBodySize > firstBodySize) confidence += 0.1;

    return {
      patternType: 'morning_star',
      patternName: '早晨之星',
      confidence: Math.min(1, confidence),
      signal: 'buy',
      description: '阴线-小实体-阳线的组合，底部反转信号'
    };
  }

  /**
   * 黄昏之星 (Evening Star) - 看跌信号
   * 特征：
   * 1. 第一日是长阳线（上涨趋势延续）
   * 2. 第二日是小实体K线（十字星或小阳线/阴线，表示犹豫）
   * 3. 第三日是长阴线（下跌反转）
   */
  private detectEveningStar(first: Candle, second: Candle, third: Candle): PatternResult | null {
    const firstBodySize = Math.abs(first.close - first.open);
    const secondBodySize = Math.abs(second.close - second.open);
    const thirdBodySize = Math.abs(third.close - third.open);

    // 规则1：第一日是阳线
    if (first.close <= first.open) {
      return null;
    }

    // 规则2：第二日是小实体（不超过第一日的50%）
    if (secondBodySize > firstBodySize * 0.5) {
      return null;
    }

    // 规则3：第三日是阴线
    if (third.close >= third.open) {
      return null;
    }

    // 规则4：第三日收盘价低于第一日实体中点
    const firstBodyMid = (first.open + first.close) / 2;
    if (third.close >= firstBodyMid) {
      return null;
    }

    // 计算置信度
    let confidence = 0.7;
    const firstBodyTop = Math.max(first.open, first.close);
    const secondBodyBottom = Math.min(second.open, second.close);
    if (secondBodyBottom > firstBodyTop) confidence += 0.1; // 上方gap
    if (thirdBodySize > firstBodySize) confidence += 0.1;

    return {
      patternType: 'evening_star',
      patternName: '黄昏之星',
      confidence: Math.min(1, confidence),
      signal: 'sell',
      description: '阳线-小实体-阴线的组合，顶部反转信号'
    };
  }

  /**
   * 三只乌鸦 (Three Black Crows) - 看跌信号
   * 特征：
   * 1. 连续三日都是阴线
   * 2. 每日收盘价都低于前一日
   * 3. 每日开盘价都在前一日实体内部或附近
   */
  private detectThreeBlackCrows(first: Candle, second: Candle, third: Candle): PatternResult | null {
    // 规则1：三日都是阴线
    if (first.close >= first.open) return null;
    if (second.close >= second.open) return null;
    if (third.close >= third.open) return null;

    // 规则2：收盘价依次降低
    if (second.close >= first.close) return null;
    if (third.close >= second.close) return null;

    // 规则3：每日的开盘价在前一日实体范围内
    const firstBodyTop = Math.max(first.open, first.close);
    const firstBodyBottom = Math.min(first.open, first.close);
    const secondBodyTop = Math.max(second.open, second.close);
    const secondBodyBottom = Math.min(second.open, second.close);

    // 第二日开盘在第一日实体内
    if (second.open <= firstBodyBottom || second.open >= firstBodyTop) return null;
    // 第三日开盘在第二日实体内
    if (third.open <= secondBodyBottom || third.open >= secondBodyTop) return null;

    // 计算置信度
    const avgBodySize = (Math.abs(first.close - first.open) + 
                         Math.abs(second.close - second.open) + 
                         Math.abs(third.close - third.open)) / 3;
    const confidence = Math.min(1, 0.6 + (avgBodySize / (first.high - first.low)) * 0.4);

    return {
      patternType: 'three_black_crows',
      patternName: '三只乌鸦',
      confidence,
      signal: 'sell',
      description: '连续三日阴线下跌，空头力量强劲'
    };
  }

  /**
   * 三个白兵 (Three White Soldiers) - 看涨信号
   * 特征：
   * 1. 连续三日都是阳线
   * 2. 每日收盘价都高于前一日
   * 3. 每日开盘价都在前一日实体内部或附近
   */
  private detectThreeWhiteSoldiers(first: Candle, second: Candle, third: Candle): PatternResult | null {
    // 规则1：三日都是阳线
    if (first.close <= first.open) return null;
    if (second.close <= second.open) return null;
    if (third.close <= third.open) return null;

    // 规则2：收盘价依次升高
    if (second.close <= first.close) return null;
    if (third.close <= second.close) return null;

    // 规则3：每日的开盘价在前一日实体范围内
    const firstBodyTop = Math.max(first.open, first.close);
    const firstBodyBottom = Math.min(first.open, first.close);
    const secondBodyTop = Math.max(second.open, second.close);
    const secondBodyBottom = Math.min(second.open, second.close);

    // 第二日开盘在第一日实体内
    if (second.open <= firstBodyBottom || second.open >= firstBodyTop) return null;
    // 第三日开盘在第二日实体内
    if (third.open <= secondBodyBottom || third.open >= secondBodyTop) return null;

    // 计算置信度
    const avgBodySize = (Math.abs(first.close - first.open) + 
                         Math.abs(second.close - second.open) + 
                         Math.abs(third.close - third.open)) / 3;
    const confidence = Math.min(1, 0.6 + (avgBodySize / (first.high - first.low)) * 0.4);

    return {
      patternType: 'three_white_soldiers',
      patternName: '三个白兵',
      confidence,
      signal: 'buy',
      description: '连续三日阳线上涨，多头力量强劲'
    };
  }
}
