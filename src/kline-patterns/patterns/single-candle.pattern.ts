import { Injectable } from '@nestjs/common';
import { Candle, PatternResult } from '../dto/kline-pattern.dto';

/**
 * 单根 K 线形态识别器
 * 包括：十字星、捉腰带线（看涨/看跌）、锤子线、上吊线、倒锤子线、射击之星、大阳线/大阴线
 */
@Injectable()
export class SingleCandlePatterns {
  
  /**
   * 检测所有单根 K 线形态
   * @param candles K 线数据数组（按时间倒序，[0]为最新）
   * @returns 检测到的形态列表
   */
  detect(candles: Candle[]): PatternResult[] {
    const patterns: PatternResult[] = [];
      
    if (!candles || candles.length < 1) {
      return patterns;
    }
  
    const current = candles[0];
  
    // 检测十字星
    const doji = this.detectDoji(current);
    if (doji) patterns.push(doji);
  
    // 检测捉腰带形态（优先于锤子线等）
    const longLeggedDoji = this.detectLongLeggedDoji(current);
    if (longLeggedDoji) {
      patterns.push(longLeggedDoji);
      return patterns; // 如果检测到捉腰带，不再检测其他类似形态
    }
  
    // 检测大阳线/大阴线
    const marubozu = this.detectMarubozu(current);
    if (marubozu) patterns.push(marubozu);
  
    // 检测锤子线/上吊线（根据趋势判断是哪种）
    const hammerLike = this.detectHammerLike(current);
    if (hammerLike) {
      patterns.push(hammerLike);
    }
  
    // 检测倒锤子线/射击之星（根据趋势判断是哪种）
    const invertedHammerLike = this.detectInvertedHammerLike(current);
    if (invertedHammerLike) {
      patterns.push(invertedHammerLike);
    }
  
    return patterns;
  }

  /**
   * 检测锤子线或上吊线形态（根据趋势决定名称）
   * - 下降趋势：锤子线（看涨）
   * - 上升趋势：上吊线（看跌）
   * - 横盘趋势：不显示
   */
  private detectHammerLike(candle: Candle): PatternResult | null {
    const bodySize = Math.abs(candle.close - candle.open);
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    const totalRange = candle.high - candle.low;

    // 规则 1：下影线长度至少是实体的 2 倍
    if (lowerShadow < bodySize * 2) {
      return null;
    }

    // 规则 2：上影线很短或没有（不超过实体的 50%）
    if (upperShadow > bodySize * 0.5) {
      return null;
    }

    // 规则 3：实体位于价格区间的上部（至少 60% 位置）
    const bodyTop = Math.max(candle.open, candle.close);
    const bodyPosition = (bodyTop - candle.low) / totalRange;
    if (bodyPosition < 0.6) {
      return null;
    }

    // 计算置信度
    const confidence = this.calculateHammerConfidence(candle, bodySize, lowerShadow, upperShadow);

    // 根据信号类型决定显示什么名称（锤子线或上吊线）
    // 这里我们统一返回看涨信号，由上层根据趋势决定最终名称
    return {
      patternType: 'hammer_like',
      patternName: '锤子线/上吊线',
      confidence,
      signal: 'buy',
      description: '下影线较长，表明下方有支撑',
      metadata: {
        needsTrendContext: true,
        bullishName: '锤子线',
        bearishName: '上吊线',
        bullishDescription: '下影线较长，表明下方有支撑，潜在看涨反转信号',
        bearishDescription: '形态同锤子线，但在上升趋势顶部出现，警示潜在下跌'
      }
    };
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
   * 检测倒锤子线或射击之星形态（根据趋势决定名称）
   * - 下降趋势：倒锤子线（看涨）
   * - 上升趋势：射击之星（看跌）
   * - 横盘趋势：不显示
   */
  private detectInvertedHammerLike(candle: Candle): PatternResult | null {
    const bodySize = Math.abs(candle.close - candle.open);
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
  
    // 规则 1：上影线长度至少是实体的 2 倍
    if (upperShadow < bodySize * 2) {
      return null;
    }
  
    // 规则 2：下影线很短（不超过实体的 50%）
    if (lowerShadow > bodySize * 0.5) {
      return null;
    }
  
    const confidence = this.calculateInvertedHammerConfidence(candle, bodySize, upperShadow);
  
    // 根据信号类型决定显示什么名称
    return {
      patternType: 'inverted_hammer_like',
      patternName: '倒锤子线/射击之星',
      confidence,
      signal: 'buy',
      description: '上影线较长，表明上方有试探',
      metadata: {
        needsTrendContext: true,
        bullishName: '倒锤子线',
        bearishName: '射击之星',
        bullishDescription: '上影线较长，表明上方有试探，潜在看涨反转信号',
        bearishDescription: '形态同倒锤子线，但在上升趋势顶部出现，警示潜在下跌'
      }
    };
  }

  /**
   * 捉腰带形态 (Long Legged Doji) - 反转信号
   * 包括：看涨捉腰带线和看跌捉腰带线
   * 
   * 看涨捉腰带线特征：
   * 1. 开盘价位于或接近最低价
   * 2. 收盘价位于或接近最高价
   * 3. 收阳线
   * 4. 实体很长，几乎没有上下影线
   * 
   * 看跌捉腰带线特征：
   * 1. 开盘价位于或接近最高价
   * 2. 收盘价位于或接近最低价
   * 3. 收阴线
   * 4. 实体很长，几乎没有上下影线
   * 
   * 注意：捉腰带蜡烛线越长，技术意义越重大
   */
  private detectLongLeggedDoji(candle: Candle): PatternResult | null {
    const bodySize = Math.abs(candle.close - candle.open);
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
    const totalRange = candle.high - candle.low;

    // 实体必须很大（至少占整个范围的80%）
    if (bodySize < totalRange * 0.8) {
      return null;
    }

    const isOpenAtLow = Math.abs(candle.open - candle.low) / totalRange < 0.05;
    const isCloseAtHigh = Math.abs(candle.close - candle.high) / totalRange < 0.05;
    const isOpenAtHigh = Math.abs(candle.open - candle.high) / totalRange < 0.05;
    const isCloseAtLow = Math.abs(candle.close - candle.low) / totalRange < 0.05;

    // 检测看涨捉腰带线：开盘≈最低，收盘≈最高，阳线
    if (candle.close > candle.open && isOpenAtLow && isCloseAtHigh) {
      const confidence = this.calculateLongLeggedDojiConfidence(candle, 'bullish');
      
      const supportLevel = candle.low; // 支撑位在最低价
      const resistanceLevel = candle.high; // 阻挡位在最高价

      return {
        patternType: 'bullish_long_legged_doji',
        patternName: '看涨捉腰带线',
        confidence,
        signal: 'buy',
        description: `开盘价接近最低价，收盘价接近最高价，长阳线，强烈看涨信号。支撑位：${supportLevel.toFixed(2)}，阻挡位：${resistanceLevel.toFixed(2)}`,
        metadata: {
          supportLevel,
          resistanceLevel
        }
      };
    }

    // 检测看跌捉腰带线：开盘≈最高，收盘≈最低，阴线
    if (candle.close < candle.open && isOpenAtHigh && isCloseAtLow) {
      const confidence = this.calculateLongLeggedDojiConfidence(candle, 'bearish');
      
      const resistanceLevel = candle.high; // 阻挡位在最高价
      const supportLevel = candle.low; // 支撑位在最低价

      return {
        patternType: 'bearish_long_legged_doji',
        patternName: '看跌捉腰带线',
        confidence,
        signal: 'sell',
        description: `开盘价接近最高价，收盘价接近最低价，长阴线，强烈看跌信号。阻挡位：${resistanceLevel.toFixed(2)}，支撑位：${supportLevel.toFixed(2)}`,
        metadata: {
          resistanceLevel,
          supportLevel
        }
      };
    }

    return null;
  }

  /**
   * 计算捉腰带形态的置信度
   * 捉腰带蜡烛线越长，置信度越高
   */
  private calculateLongLeggedDojiConfidence(
    candle: Candle,
    type: 'bullish' | 'bearish'
  ): number {
    let confidence = 0.8; // 基础置信度（比普通形态高）

    const bodySize = Math.abs(candle.close - candle.open);
    const totalRange = candle.high - candle.low;
    
    // 实体占比越大，置信度越高
    const bodyToTotalRatio = bodySize / totalRange;
    if (bodyToTotalRatio > 0.9) confidence += 0.15; // 极长的实体
    else if (bodyToTotalRatio > 0.85) confidence += 0.1;
    else if (bodyToTotalRatio > 0.8) confidence += 0.05;

    // 影线越短，置信度越高
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
    
    if (upperShadow < bodySize * 0.02 && lowerShadow < bodySize * 0.02) {
      confidence += 0.05; // 几乎光头光脚
    }

    return Math.min(1, confidence);
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
