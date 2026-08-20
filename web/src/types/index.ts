// 指数数据类型定义

export interface IndexItem {
  id: string;
  code: string;
  officialCode?: string;
  name: string;
  exchange?: string;
  description?: string;
  isActive: boolean;
  syncStartDate?: string | null;
  lastSyncDate?: string | null;
  historyCount: number;
  metadata?: Record<string, any> | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface IndexFormData {
  code: string;
  officialCode?: string;
  name: string;
  exchange?: string;
  description?: string;
  isActive?: boolean;
  syncStartDate?: string;
  metadata?: Record<string, any>;
}

export interface IndexSyncResult {
  success: boolean;
  message: string;
  count?: number;
}
