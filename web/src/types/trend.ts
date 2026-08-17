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
  isTodayData?: boolean; // 是否为当天数据（true-当天，false-补全的上个交易日数据）
  dataDate?: string; // 数据实际来源日期
  tradeDate?: string; // 统一为基准日期（最新日期）
  marketStatus?: 'closed' | 'updating' | 'open'; // 市场状态
  prevDeviationRate?: number | null; // 昨天的偏离率，用于判断正负转换
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
