// 指数历史交易数据类型定义

export interface IndexHistoryItem {
  id: string;
  indexId: string;
  tradeDate: string;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  closePrice: number;
  volume: number | null;
  turnover: number | null;
  changePercent: number | null;
  changeAmount: number | null;
  dataSource?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface IndexHistoryResponse {
  success: boolean;
  index: {
    id: string;
    code: string;
    name: string;
    officialCode?: string;
  };
  count: number;
  data: IndexHistoryItem[];
}

export interface IndexHistoryQuery {
  indexId: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}
