import { Injectable } from '@nestjs/common';
import { Candle, PatternResult } from '../dto/kline-pattern.dto';

/**
 * 双根K线形态识别器
 * 包括：看涨吞没、看跌吞没、乌云盖顶、刺透形态
 */
@Injectable()
export class TwoCandlePatterns {
  
  /**
   * 检测所有双根 K 线形态
   * @param candles K 线数据数组（按时间倒序，[0] 为最新，[1] 为前一日）
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
    const bullishEngulfing = this.detectBullishEngulfing(previous, current);
    if (bullishEngulfing) patterns.push(bullishEngulfing);
  
    const bearishEngulfing = this.detectBearishEngulfing(previous, current);
    if (bearishEngulfing) patterns.push(bearishEngulfing);
  
    // 只有不满足吞没形态时，才检测乌云盖顶和刺透形态
    if (!bearishEngulfing) {
      const darkCloudCover = this.detectDarkCloudCover(previous, current);
      if (darkCloudCover) patterns.push(darkCloudCover);
    }
  
    if (!bullishEngulfing) {
      const piercingPattern = this.detectPiercingPattern(previous, current);
      if (piercingPattern) patterns.push(piercingPattern);
    }
  
    return patterns;
  }

  /**
   * 看涨吞没形态 (Bullish Engulfing) - 看涨信号
   * 特征：
   * 1. 前一日是阴线（下跌）
   * 2. 当日是阳线（上涨）
   * 3. 当日实体完全覆盖前一日实体
   * 
   * 支撑/阻挡位：形态的最低点构成支撑水平，最高点构成阻挡水平
   */
  private detectBullishEngulfing(previous: Candle, current: Candle): PatternResult | null {
    // 规则 1：前一日是阴线
    if (previous.close >= previous.open) {
      return null;
    }
  
    // 规则 2：当日是阳线
    if (current.close <= current.open) {
      return null;
    }
  
    // 规则 3：当日实体完全覆盖前一日实体
    const prevBodyTop = Math.max(previous.open, previous.close);
    const prevBodyBottom = Math.min(previous.open, previous.close);
    const currBodyTop = Math.max(current.open, current.close);
    const currBodyBottom = Math.min(current.open, current.close);
  
    if (currBodyBottom >= prevBodyBottom || currBodyTop <= prevBodyTop) {
      return null;
    }
  
    // 计算置信度
    const confidence = this.calculateEngulfingConfidence(previous, current, 'bullish');
  
    // 计算阻挡位：形态最高价
    const resistanceLevel = Math.max(current.high, previous.high);
    // 计算支撑位：形态最低价（通常为当日开盘价或最低价）
    const supportLevel = Math.min(current.low, current.open);
  
    return {
      patternType: 'bullish_engulfing',
      patternName: '看涨吞没',
      confidence,
      signal: 'buy',
      description: `阳线完全包裹阴线，多头力量强劲，看涨反转信号。支撑位：${supportLevel.toFixed(2)}，阻挡位：${resistanceLevel.toFixed(2)}`,
      metadata: {
        supportLevel,
        resistanceLevel
      }
    };
  }

  /**
   * 看跌吞没形态 (Bearish Engulfing) - 看跌信号
   * 特征：
   * 1. 前一日是阳线（上涨）
   * 2. 当日是阴线（下跌）
   * 3. 当日实体完全覆盖前一日实体
   * 
   * 支撑/阻挡位：形态的最高点构成阻挡水平，最低点构成支撑水平
   */
  private detectBearishEngulfing(previous: Candle, current: Candle): PatternResult | null {
    // 规则 1：前一日是阳线
    if (previous.close <= previous.open) {
      return null;
    }
  
    // 规则 2：当日是阴线
    if (current.close >= current.open) {
      return null;
    }
  
    // 规则 3：当日实体完全覆盖前一日实体
    const prevBodyTop = Math.max(previous.open, previous.close);
    const prevBodyBottom = Math.min(previous.open, previous.close);
    const currBodyTop = Math.max(current.open, current.close);
    const currBodyBottom = Math.min(current.open, current.close);
  
    if (currBodyBottom >= prevBodyBottom || currBodyTop <= prevBodyTop) {
      return null;
    }
  
    const confidence = this.calculateEngulfingConfidence(previous, current, 'bearish');
  
    // 计算阻挡位：形态最高点（通常为当日最高价或开盘价）
    const resistanceLevel = Math.max(current.high, current.open);
    // 计算支撑位：形态最低价
    const supportLevel = Math.min(current.low, previous.low);
  
    return {
      patternType: 'bearish_engulfing',
      patternName: '看跌吞没',
      confidence,
      signal: 'sell',
      description: `阴线完全包裹阳线，空头力量强劲，看跌反转信号。阻挡位：${resistanceLevel.toFixed(2)}，支撑位：${supportLevel.toFixed(2)}`,
      metadata: {
        resistanceLevel,
        supportLevel
      }
    };
  }

  /**
   * 乌云盖顶形态 (Dark Cloud Cover) - 看跌信号
   * 特征：
   * 1. 前一日是阳线
   * 2. 当日是阴线
   * 3. 当日开盘价高于前一日最高价（跳空高开）
   * 4. 当日收盘价切入前一日实体的 50% 以下
   * 5. 当日实体未完全覆盖前一日实体（否则为吞没形态）
   * 
   * 支撑/阻挡位：形态的最高点（第二日上影线顶端）构成阻挡水平
   */
  private detectDarkCloudCover(previous: Candle, current: Candle): PatternResult | null {
    // 规则 1：前一日是阳线
    if (previous.close <= previous.open) {
      return null;
    }
  
    // 规则 2：当日是阴线
    if (current.close >= current.open) {
      return null;
    }
  
    // 规则 3：当日开盘价高于前一日最高价（跳空）
    if (current.open <= previous.high) {
      return null;
    }
  
    // 规则 4：当日收盘价低于前一日实体中点
    const prevBodyMid = (previous.open + previous.close) / 2;
    if (current.close >= prevBodyMid) {
      return null;
    }
  
    // 规则 5：当日实体未完全覆盖前一日实体（确保不是吞没形态）
    const prevBodyTop = Math.max(previous.open, previous.close);
    const prevBodyBottom = Math.min(previous.open, previous.close);
    const currBodyTop = Math.max(current.open, current.close);
    const currBodyBottom = Math.min(current.open, current.close);
  
    // 如果完全覆盖，则是吞没形态，不是乌云盖顶
    if (currBodyBottom <= prevBodyBottom && currBodyTop >= prevBodyTop) {
      return null;
    }
  
    // 计算置信度
    const penetration = (previous.high - current.close) / (previous.high - previous.low);
    const confidence = Math.min(1, 0.65 + penetration * 0.3);
  
    // 计算阻挡位：形态最高点（当日最高价或前一日最高价的较大者）
    const resistanceLevel = Math.max(current.high, previous.high);
      
    // 计算支撑位：前一日阳线的开盘价（实体底部）
    const supportLevel = Math.min(previous.open, previous.close);
  
    return {
      patternType: 'dark_cloud_cover',
      patternName: '乌云盖顶',
      confidence,
      signal: 'sell',
      description: `跳空高开后收阴，深入前一日实体，看跌反转信号。阻挡位：${resistanceLevel.toFixed(2)}，支撑位：${supportLevel.toFixed(2)}`,
      metadata: {
        resistanceLevel,
        supportLevel
      }
    };
  }

  /**
   * 刺透形态 (Piercing Pattern) - 看涨信号
   * 特征：
   * 1. 前一日是阴线
   * 2. 当日是阳线
   * 3. 当日开盘价低于前一日最低价（跳空低开）
   * 4. 当日收盘价切入前一日实体的 50% 以上
   * 5. 当日实体未完全覆盖前一日实体（否则为吞没形态）
   * 
   * 支撑/阻挡位：形态的最低点构成支撑水平，前一日实体顶部构成阻挡水平
   */
  private detectPiercingPattern(previous: Candle, current: Candle): PatternResult | null {
    // 规则 1：前一日是阴线
    if (previous.close >= previous.open) {
      return null;
    }
  
    // 规则 2：当日是阳线
    if (current.close <= current.open) {
      return null;
    }
  
    // 规则 3：当日开盘价低于前一日最低价（跳空）
    if (current.open >= previous.low) {
      return null;
    }
  
    // 规则 4：当日收盘价高于前一日实体中点
    const prevBodyMid = (previous.open + previous.close) / 2;
    if (current.close <= prevBodyMid) {
      return null;
    }
  
    // 规则 5：当日实体未完全覆盖前一日实体（确保不是吞没形态）
    const prevBodyTop = Math.max(previous.open, previous.close);
    const prevBodyBottom = Math.min(previous.open, previous.close);
    const currBodyTop = Math.max(current.open, current.close);
    const currBodyBottom = Math.min(current.open, current.close);
  
    // 如果完全覆盖，则是吞没形态，不是刺透形态
    if (currBodyBottom <= prevBodyBottom && currBodyTop >= prevBodyTop) {
      return null;
    }
  
    // 计算置信度
    const penetration = (current.close - previous.low) / (previous.high - previous.low);
    const confidence = Math.min(1, 0.65 + penetration * 0.3);
  
    // 计算支撑位：形态最低点
    const supportLevel = Math.min(current.low, previous.low);
    // 计算阻挡位：前一日阴线的收盘价（实体顶部）
    const resistanceLevel = Math.max(previous.open, previous.close);
  
    return {
      patternType: 'piercing_pattern',
      patternName: '刺透形态',
      confidence,
      signal: 'buy',
      description: `跳空低开后收阳，深入前一日实体，看涨反转信号。支撑位：${supportLevel.toFixed(2)}，阻挡位：${resistanceLevel.toFixed(2)}`,
      metadata: {
        supportLevel,
        resistanceLevel
      }
    };
  }

  /**
   * 计算吞没形态的置信度
   */
  private calculateEngulfingConfidence(
    previous: Candle,
    current: Candle,
    type: 'bullish' | 'bearish'
  ): number {
    let confidence = 0.75; // 基础置信度

    const prevBodySize = Math.abs(previous.close - previous.open);
    const currBodySize = Math.abs(current.close - current.open);

    // 当前实体越大，置信度越高
    const bodyRatio = currBodySize / prevBodySize;
    if (bodyRatio > 1.5) confidence += 0.1;
    if (bodyRatio > 2) confidence += 0.05;

    // 成交量配合（如果有数据）
    // TODO: 当有成交量数据时可以加分

    return Math.min(1, confidence);
  }
}
