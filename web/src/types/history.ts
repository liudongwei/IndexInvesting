// 指数历史交易数据类型定义

export interface IndexHistoryItem {
  id: string;
  indexId: string;
  tradeDate: string;
  // 后端 decimal 类型可能返回字符串，需要兼容处理
  openPrice: number | string;
  highPrice: number | string;
  lowPrice: number | string;
  closePrice: number | string;
  volume: number | string | null;
  turnover: number | string | null;
  changePercent: number | string | null;
  changeAmount: number | string | null;
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
  total: number;
  data: IndexHistoryItem[];
}

export interface IndexHistoryQuery {
  indexId: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}
