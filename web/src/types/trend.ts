// 趋势排名数据项
export interface TrendRankingItem {
  rank: number;
  code: string;
  name: string;
  changePercent: number;
  closePrice: number;
  ma20: number;
  deviationRate: number;
  volumeRatio: number | null;
  statusChangeDate: string;
  intervalChangePercent: number;
  rankChange: number;
}

// API响应格式
export interface TrendRankingResponse {
  success: boolean;
  tradeDate: string;
  totalCount: number;
  data: TrendRankingItem[];
}

// 日期查询响应
export interface TrendRankingByDateResponse {
  success: boolean;
  tradeDate: string;
  totalCount: number;
  data: TrendRankingItem[];
  message?: string;
}
