import type { TrendRankingResponse, TrendRankingByDateResponse, TrendRankingItem } from '../types/trend';
import type { IndexItem, IndexFormData, IndexSyncResult } from '../types/index';
import type { IndexHistoryItem, IndexHistoryResponse } from '../types/history';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

// 指数趋势历史数据项
export interface IndexTrendHistoryItem extends TrendRankingItem {
  tradeDate: string;
  index?: {
    id: string;
    code: string;
    name: string;
    officialCode?: string;
  };
}

// 指数趋势历史响应
export interface IndexTrendHistoryResponse {
  success: boolean;
  count: number;
  total: number;
  data: IndexTrendHistoryItem[];
}

// 指数详情
export interface IndexDetail {
  id: string;
  code: string;
  name: string;
  officialCode?: string;
  exchange?: string;
  isActive: boolean;
}

/**
 * 获取最新趋势排名
 */
export async function getLatestRanking(): Promise<TrendRankingResponse> {
  const response = await fetch(`${API_BASE_URL}/trend-analysis/ranking/latest`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

/**
 * 获取指定日期的趋势排名
 */
export async function getRankingByDate(date: string): Promise<TrendRankingByDateResponse> {
  const response = await fetch(`${API_BASE_URL}/trend-analysis/ranking/by-date?date=${date}`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

/**
 * 东财指数信息
 */
export interface EastmoneyIndex {
  id: string;
  code: string;
  name: string;
  officialCode?: string;
  eastmoneyCode: string;
  eastmoneyUrl: string;
  lastSyncDate?: string;
}

/**
 * 获取所有配置了东财数据源的指数
 */
export async function getEastmoneyIndices(): Promise<{ success: boolean; count: number; data: EastmoneyIndex[] }> {
  const response = await fetch(`${API_BASE_URL}/indices/eastmoney-indices`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

/**
 * 导入东财JSON数据
 */
export async function importEastmoneyJson(data: object, indexId?: string): Promise<{
  success: boolean;
  message: string;
  indexId?: string;
  indexName?: string;
  indexCode?: string;
  total: number;
  imported: number;
  skipped: number;
  dateRange?: { start: string; end: string };
}> {
  const response = await fetch(`${API_BASE_URL}/indices/import-eastmoney-json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, indexId }),
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

/**
 * 根据代码查询指数详情
 */
export async function getIndexByCode(code: string): Promise<IndexDetail | null> {
  const response = await fetch(`${API_BASE_URL}/indices/by-code/${encodeURIComponent(code)}`);
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  // 如果返回的是成功响应包装格式
  if (data && typeof data === 'object' && 'success' in data) {
    return data.success ? data : null;
  }
  // 直接返回指数对象
  return data;
}

/**
 * 根据官方代码查询指数详情
 */
export async function getIndexByOfficialCode(officialCode: string): Promise<IndexDetail | null> {
  const response = await fetch(`${API_BASE_URL}/indices/by-official-code/${encodeURIComponent(officialCode)}`);
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  // 如果返回的是成功响应包装格式
  if (data && typeof data === 'object' && 'success' in data) {
    return data.success ? data : null;
  }
  // 直接返回指数对象
  return data;
}

/**
 * 获取指定指数的趋势历史数据
 */
export async function getIndexTrendHistory(
  indexId: string,
  limit: number = 20,
  offset: number = 0,
): Promise<IndexTrendHistoryResponse> {
  const response = await fetch(
    `${API_BASE_URL}/trend-analysis/${encodeURIComponent(indexId)}?limit=${limit}&offset=${offset}`,
  );
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

/**
 * 获取所有指数列表
 */
export async function getIndices(): Promise<IndexItem[]> {
  const response = await fetch(`${API_BASE_URL}/indices`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  // 如果返回的是数组直接返回，如果是包装格式则取 data 字段
  return Array.isArray(data) ? data : data.data || [];
}

/**
 * 创建新指数
 */
export async function createIndex(formData: IndexFormData): Promise<IndexItem> {
  const response = await fetch(`${API_BASE_URL}/indices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formData),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `创建失败: ${response.status}`);
  }
  return response.json();
}

/**
 * 更新指数信息
 */
export async function updateIndex(id: string, formData: IndexFormData): Promise<IndexItem> {
  const response = await fetch(`${API_BASE_URL}/indices/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formData),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `更新失败: ${response.status}`);
  }
  return response.json();
}

/**
 * 删除指数
 */
export async function deleteIndex(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/indices/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `删除失败: ${response.status}`);
  }
}

/**
 * 同步指数数据
 */
export async function syncIndexData(id: string): Promise<IndexSyncResult> {
  const response = await fetch(`${API_BASE_URL}/indices/${id}/sync`, {
    method: 'POST',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `同步失败: ${response.status}`);
  }
  return response.json();
}

/**
 * 获取指数历史交易数据
 */
export async function getIndexHistory(
  indexId: string,
  limit: number = 100,
  startDate?: string,
  endDate?: string,
): Promise<IndexHistoryResponse> {
  let url = `${API_BASE_URL}/indices/${encodeURIComponent(indexId)}/history?limit=${limit}`;
  if (startDate) url += `&startDate=${startDate}`;
  if (endDate) url += `&endDate=${endDate}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}
