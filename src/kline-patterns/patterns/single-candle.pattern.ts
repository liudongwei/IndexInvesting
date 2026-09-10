import { Injectable } from '@nestjs/common';
import { Candle, PatternResult } from '../dto/kline-pattern.dto';

/**
 * 单根K线形态识别器
 * 包括：锤子线、上吊线、倒锤子线、射击之星、十字星、大阳线/大阴线
 */
@Injectable()
export class SingleCandlePatterns {
  
  /**
   * 检测所有单根K线形态
   * @param candles K线数据数组（按时间倒序，[0]为最新）
   * @returns 检测到的形态列表
   */
  detect(candles: Candle[]): PatternResult[] {
    const patterns: PatternResult[] = [];
    
    if (!candles || candles.length < 1) {
      return patterns;
    }

    const current = candles[0];

    // 检测各种形态
    const hammer = this.detectHammer(current);
    if (hammer) patterns.push(hammer);

    const hangingMan = this.detectHangingMan(current);
    if (hangingMan) patterns.push(hangingMan);

    const invertedHammer = this.detectInvertedHammer(current);
    if (invertedHammer) patterns.push(invertedHammer);

    const shootingStar = this.detectShootingStar(current);
    if (shootingStar) patterns.push(shootingStar);

    const doji = this.detectDoji(current);
    if (doji) patterns.push(doji);

    const marubozu = this.detectMarubozu(current);
    if (marubozu) patterns.push(marubozu);

    return patterns;
  }

  /**
   * 锤子线 (Hammer) - 看涨形态
   * 特征：下影线长度 >= 实体长度的2倍，上影线很短或没有
   * 出现在下降趋势底部时信号更强
   */
  private detectHammer(candle: Candle): PatternResult | null {
    const bodySize = Math.abs(candle.close - candle.open);
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    const totalRange = candle.high - candle.low;

    // 规则1：下影线长度至少是实体的2倍
    if (lowerShadow < bodySize * 2) {
      return null;
    }

    // 规则2：上影线很短或没有（不超过实体的10%）
    if (upperShadow > bodySize * 0.5) {
      return null;
    }

    // 规则3：实体位于价格区间的上部（至少60%位置）
    const bodyTop = Math.max(candle.open, candle.close);
    const bodyPosition = (bodyTop - candle.low) / totalRange;
    if (bodyPosition < 0.6) {
      return null;
    }

    // 计算置信度
    const confidence = this.calculateHammerConfidence(candle, bodySize, lowerShadow, upperShadow);

    return {
      patternType: 'hammer',
      patternName: '锤子线',
      confidence,
      signal: 'buy',
      description: '下影线较长，表明下方有支撑，潜在看涨反转信号'
    };
  }

  /**
   * 上吊线 (Hanging Man) - 看跌形态
   * 特征：与锤子线形态相同，但出现在上升趋势顶部
   */
  private detectHangingMan(candle: Candle): PatternResult | null {
    const bodySize = Math.abs(candle.close - candle.open);
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    const totalRange = candle.high - candle.low;

    // 形态条件与锤子线相同
    if (lowerShadow < bodySize * 2) return null;
    if (upperShadow > bodySize * 0.5) return null;
    
    const bodyTop = Math.max(candle.open, candle.close);
    const bodyPosition = (bodyTop - candle.low) / totalRange;
    if (bodyPosition < 0.6) return null;

    const confidence = this.calculateHammerConfidence(candle, bodySize, lowerShadow, upperShadow) * 0.9;

    return {
      patternType: 'hanging_man',
      patternName: '上吊线',
      confidence,
      signal: 'sell',
      description: '形态同锤子线，但在上升趋势顶部出现，警示潜在下跌'
    };
  }

  /**
   * 倒锤子线 (Inverted Hammer) - 看涨形态
   * 特征：上影线较长（至少2倍实体），下影线很短或没有
   * 出现在下降趋势底部时信号更强
   */
  private detectInvertedHammer(candle: Candle): PatternResult | null {
    const bodySize = Math.abs(candle.close - candle.open);
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;

    // 规则1：上影线长度至少是实体的2倍
    if (upperShadow < bodySize * 2) {
      return null;
    }

    // 规则2：下影线很短（不超过实体的50%）
    if (lowerShadow > bodySize * 0.5) {
      return null;
    }

    const confidence = this.calculateInvertedHammerConfidence(candle, bodySize, upperShadow);

    return {
      patternType: 'inverted_hammer',
      patternName: '倒锤子线',
      confidence,
      signal: 'buy',
      description: '上影线较长，表明上方有试探，潜在看涨反转信号'
    };
  }

  /**
   * 射击之星 (Shooting Star) - 看跌形态
   * 特征：与倒锤子线形态相同，但出现在上升趋势顶部
   */
  private detectShootingStar(candle: Candle): PatternResult | null {
    const bodySize = Math.abs(candle.close - candle.open);
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;

    if (upperShadow < bodySize * 2) return null;
    if (lowerShadow > bodySize * 0.5) return null;

    const confidence = this.calculateInvertedHammerConfidence(candle, bodySize, upperShadow) * 0.9;

    return {
      patternType: 'shooting_star',
      patternName: '射击之星',
      confidence,
      signal: 'sell',
      description: '形态同倒锤子线，但在上升趋势顶部出现，警示潜在下跌'
    };
  }

  /**
   * 十字星 (Doji) - 反转信号
   * 特征：开盘价和收盘价非常接近，实体很小
   */
  private detectDoji(candle: Candle): PatternResult | null {
    const bodySize = Math.abs(candle.close - candle.open);
    const totalRange = candle.high - candle.low;

    // 规则：实体大小不超过总范围的10%
    if (totalRange === 0 || bodySize > totalRange * 0.1) {
      return null;
    }

    // 计算置信度（基于上下影线的对称性）
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
    const shadowRatio = Math.min(upperShadow, lowerShadow) / Math.max(upperShadow, lowerShadow, 0.01);
    
    const confidence = Math.min(1, shadowRatio * 0.8 + 0.2);

    return {
      patternType: 'doji',
      patternName: '十字星',
      confidence,
      signal: 'neutral',
      description: '多空力量均衡，市场犹豫不决，潜在反转信号'
    };
  }

  /**
   * 大阳线/大阴线 (Marubozu) - 强势信号
   * 特征：几乎没有上下影线，实体很长
   */
  private detectMarubozu(candle: Candle): PatternResult | null {
    const bodySize = Math.abs(candle.close - candle.open);
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
    const totalRange = candle.high - candle.low;

    // 规则：上下影线都很短（都不超过实体的5%）
    if (upperShadow > bodySize * 0.05 || lowerShadow > bodySize * 0.05) {
      return null;
    }

    // 实体占比要大（至少占整个范围的80%）
    if (bodySize < totalRange * 0.8) {
      return null;
    }

    const isBullish = candle.close > candle.open;
    const confidence = bodySize / totalRange;

    return {
      patternType: isBullish ? 'bullish_marubozu' : 'bearish_marubozu',
      patternName: isBullish ? '大阳线' : '大阴线',
      confidence,
      signal: isBullish ? 'buy' : 'sell',
      description: isBullish ? '强势上涨，多头完全掌控' : '强势下跌，空头完全掌控'
    };
  }

  /**
   * 计算锤子线的置信度
   */
  private calculateHammerConfidence(
    candle: Candle,
    bodySize: number,
    lowerShadow: number,
    upperShadow: number
  ): number {
    let confidence = 0.7; // 基础置信度

    // 下影线越长，置信度越高
    const shadowToBodyRatio = lowerShadow / bodySize;
    if (shadowToBodyRatio > 3) confidence += 0.1;
    if (shadowToBodyRatio > 4) confidence += 0.1;

    // 上影线越短，置信度越高
    if (upperShadow < bodySize * 0.1) confidence += 0.05;

    // 实体越大，置信度越高
    const totalRange = candle.high - candle.low;
    const bodyToTotalRatio = bodySize / totalRange;
    if (bodyToTotalRatio > 0.3) confidence += 0.05;

    return Math.min(1, confidence);
  }

  /**
   * 计算倒锤子线的置信度
   */
  private calculateInvertedHammerConfidence(
    candle: Candle,
    bodySize: number,
    upperShadow: number
  ): number {
    let confidence = 0.65; // 基础置信度略低于锤子线

    // 上影线越长，置信度越高
    const shadowToBodyRatio = upperShadow / bodySize;
    if (shadowToBodyRatio > 3) confidence += 0.1;
    if (shadowToBodyRatio > 4) confidence += 0.1;

    return Math.min(1, confidence);
  }
}
