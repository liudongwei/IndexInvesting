// 移动平均线数据类型定义

export interface MovingAverageItem {
  id: string;
  indexId: string;
  tradeDate: string;
  closePrice: number | string;
  ma5: number | string | null;
  ma10: number | string | null;
  ma20: number | string | null;
  ma60: number | string | null;
  deviationRate: number | string | null;
  ma5SampleCount: number;
  ma10SampleCount: number;
  ma20SampleCount: number;
  ma60SampleCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface MovingAverageResponse {
  success: boolean;
  total: number;
  count: number;
  data: MovingAverageItem[];
}
