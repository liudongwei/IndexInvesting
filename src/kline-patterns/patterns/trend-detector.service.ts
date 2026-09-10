import { Injectable } from '@nestjs/common';
import { Candle, TrendAnalysis } from '../dto/kline-pattern.dto';

/**
 * 趋势判断服务
 * 基于移动平均线和价格行为判断市场趋势状态
 */
@Injectable()
export class TrendDetectorService {
  /**
   * 分析趋势状态
   * @param candles K线数据数组（按时间倒序，[0]为最新）
   * @returns 趋势分析结果
   */
  analyzeTrend(candles: Candle[]): TrendAnalysis {
    if (!candles || candles.length < 10) {
      return { trendState: 'sideways', description: '数据不足，无法判断趋势' };
    }

    // 计算短期、中期、长期均线
    const ma5 = this.calculateMA(candles, 5);
    const ma10 = this.calculateMA(candles, 10);
    const ma20 = this.calculateMA(candles, 20);

    const currentPrice = candles[0].close;
    const priceRange = this.calculatePriceRange(candles, 20);

    // 判断上升趋势
    if (this.isUptrend(ma5, ma10, ma20, currentPrice)) {
      return {
        trendState: 'uptrend',
        description: `上升趋势：MA5(${ma5.toFixed(2)}) > MA10(${ma10.toFixed(2)}) > MA20(${ma20.toFixed(2)})`
      };
    }

    // 判断下降趋势
    if (this.isDowntrend(ma5, ma10, ma20, currentPrice)) {
      return {
        trendState: 'downtrend',
        description: `下降趋势：MA5(${ma5.toFixed(2)}) < MA10(${ma10.toFixed(2)}) < MA20(${ma20.toFixed(2)})`
      };
    }

    // 判断横盘趋势
    return {
      trendState: 'sideways',
      description: `横盘趋势：均线纠缠，价格在区间内波动`
    };
  }

  /**
   * 计算指定周期的移动平均线
   */
  private calculateMA(candles: Candle[], period: number): number {
    if (candles.length < period) {
      return candles.reduce((sum, c) => sum + c.close, 0) / candles.length;
    }

    const sum = candles.slice(0, period).reduce((sum, c) => sum + c.close, 0);
    return sum / period;
  }

  /**
   * 计算价格波动范围（最高价-最低价）/ 平均价格
   */
  private calculatePriceRange(candles: Candle[], period: number): number {
    const recentCandles = candles.slice(0, Math.min(period, candles.length));
    const highest = Math.max(...recentCandles.map(c => c.high));
    const lowest = Math.min(...recentCandles.map(c => c.low));
    const avgPrice = recentCandles.reduce((sum, c) => sum + c.close, 0) / recentCandles.length;
    
    return (highest - lowest) / avgPrice;
  }

  /**
   * 判断是否为上升趋势
   * 条件：MA5 > MA10 > MA20，且当前价格在MA5上方
   */
  private isUptrend(ma5: number, ma10: number, ma20: number, currentPrice: number): boolean {
    const maOrderCorrect = ma5 > ma10 && ma10 > ma20;
    const priceAboveMA5 = currentPrice > ma5;
    const maSpread = (ma5 - ma20) / ma20; // 均线间距比例
    
    // 要求均线排列正确，价格在均线上方，且均线有一定间距（避免过于接近）
    return maOrderCorrect && priceAboveMA5 && maSpread > 0.005;
  }

  /**
   * 判断是否为下降趋势
   * 条件：MA5 < MA10 < MA20，且当前价格在MA5下方
   */
  private isDowntrend(ma5: number, ma10: number, ma20: number, currentPrice: number): boolean {
    const maOrderCorrect = ma5 < ma10 && ma10 < ma20;
    const priceBelowMA5 = currentPrice < ma5;
    const maSpread = (ma20 - ma5) / ma20; // 均线间距比例
    
    return maOrderCorrect && priceBelowMA5 && maSpread > 0.005;
  }

  /**
   * 获取趋势强度评分（0-1）
   * 用于评估趋势的可靠性
   */
  getTrendStrength(candles: Candle[]): number {
    if (!candles || candles.length < 10) {
      return 0;
    }

    const ma5 = this.calculateMA(candles, 5);
    const ma10 = this.calculateMA(candles, 10);
    const ma20 = this.calculateMA(candles, 20);
    const currentPrice = candles[0].close;

    // 计算均线间距
    const maSpread = Math.abs(ma5 - ma20) / ma20;
    
    // 计算价格与均线的偏离度
    const priceDeviation = Math.abs(currentPrice - ma5) / ma5;

    // 计算近期涨跌幅
    const recentChange = Math.abs(candles[0].close - candles[4].close) / candles[4].close;

    // 综合评分（归一化到0-1）
    const strength = Math.min(1, (maSpread * 10 + priceDeviation * 5 + recentChange * 3));
    
    return strength;
  }
}
