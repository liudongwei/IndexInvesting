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
 * K 线形态识别结果
 */
export interface PatternResult {
  patternType: string;      // 形态类型标识
  patternName: string;      // 形态名称
  confidence: number;       // 置信度 (0-1)
  signal: 'buy' | 'sell' | 'neutral'; // 信号类型
  description?: string;     // 形态描述
  metadata?: {              // 元数据（可选）
    supportLevel?: number;  // 支撑位
    resistanceLevel?: number; // 阻挡位
    [key: string]: any;     // 其他元数据字段
  };
}

/**
 * 趋势分析结果
 */
export interface TrendAnalysis {
  trendState: 'uptrend' | 'downtrend' | 'sideways' | 'unknown';
  description?: string;
  /** 趋势强度评分 -1(强下降) ~ +1(强上升) */
  score?: number;
  /** 置信度 0~1 */
  confidence?: number;
  /** 趋势因子详情 */
  components?: {
    efficiency: number;  // Kaufman效率系数
    slope: number;       // 回归斜率
    r2: number;          // R²线性度
    maSpread: number;    // 均线排列(ATR归一)
    structure: number;   // 摆动结构
  };
}

/**
 * 完整的K线形态分析结果
 */
export interface KLineAnalysisResult {
  tradeDate: Date;
  trendState: 'uptrend' | 'downtrend' | 'sideways' | 'unknown';
  /** 趋势强度评分 -1~+1 */
  trendScore?: number;
  /** 趋势置信度 0~1 */
  trendConfidence?: number;
  patterns: PatternResult[]; // 可能同时检测到多个形态
  primaryPattern?: PatternResult; // 主要形态（置信度最高的）
}
