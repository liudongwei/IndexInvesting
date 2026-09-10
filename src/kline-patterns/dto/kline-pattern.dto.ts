/**
 * K线数据接口（OHLC）
 */
export interface Candle {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
}

/**
 * K线形态识别结果
 */
export interface PatternResult {
  patternType: string;      // 形态类型标识
  patternName: string;      // 形态名称
  confidence: number;       // 置信度 (0-1)
  signal: 'buy' | 'sell' | 'neutral'; // 信号类型
  description?: string;     // 形态描述
}

/**
 * 趋势分析结果
 */
export interface TrendAnalysis {
  trendState: 'uptrend' | 'downtrend' | 'sideways';
  description?: string;
}

/**
 * 完整的K线形态分析结果
 */
export interface KLineAnalysisResult {
  tradeDate: Date;
  trendState: 'uptrend' | 'downtrend' | 'sideways';
  patterns: PatternResult[]; // 可能同时检测到多个形态
  primaryPattern?: PatternResult; // 主要形态（置信度最高的）
}
