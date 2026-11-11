// K线形态数据类型定义

export type MarketPosition = 'top' | 'bottom' | 'up' | 'down' | 'flat' | 'unknown';

export interface KLinePattern {
  id: string;
  indexId: string;
  tradeDate: string;
  trendState: 'uptrend' | 'downtrend' | 'sideways';
  marketPosition?: MarketPosition;
  patternType: string;
  patternName: string;
  confidence: number;
  signal: 'buy' | 'sell' | 'neutral';
  candleData: any;
  metadata: Record<string, any> | null;
  isRealtime: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KLinePatternResponse {
  success: boolean;
  data: KLinePattern[];
  total: number;
  count: number;
}

export interface QueryPatternParams {
  indexId?: string;
  startDate?: string;
  endDate?: string;
  isRealtime?: boolean;
  trendState?: 'uptrend' | 'downtrend' | 'sideways';
  patternName?: string;
  signal?: 'buy' | 'sell' | 'neutral';
  marketPosition?: MarketPosition | string;
  page?: number;
  pageSize?: number;
}