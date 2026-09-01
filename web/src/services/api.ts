import type { TrendRankingResponse, TrendRankingByDateResponse, TrendRankingItem, TrendAnalysisResponse } from '../types/trend';
import type { IndexItem, IndexFormData, IndexSyncResult } from '../types/index';
import type { IndexHistoryResponse } from '../types/history';
import type { CronConfig } from '../types/cron';
import type { MovingAverageResponse } from '../types/moving-average';
import { INDEX_TYPE, type IndexType } from '../types/index-type';

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
 * @param type 指数类型: 'indices' | 'sectors'，不传则默认返回 indices
 */
export async function getLatestRanking(type?: IndexType): Promise<TrendRankingResponse> {
  const indexType = type || INDEX_TYPE.INDICES;
  const url = `${API_BASE_URL}/trend-analysis/ranking/latest?type=${indexType}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

/**
 * 获取指定日期的趋势排名
 * @param date 日期
 * @param type 指数类型: 'indices' | 'sectors'，不传则默认返回 indices
 */
export async function getRankingByDate(date: string, type?: IndexType): Promise<TrendRankingByDateResponse> {
  const indexType = type || INDEX_TYPE.INDICES;
  const url = `${API_BASE_URL}/trend-analysis/ranking/by-date?date=${date}&type=${indexType}`;
  const response = await fetch(url);
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
 * @param indexId 指数ID
 * @param limit 限制条数（向后兼容，不传则使用分页）
 * @param startDate 开始日期
 * @param endDate 结束日期
 * @param page 页码（从1开始，启用后端分页）
 * @param pageSize 每页条数（启用后端分页）
 */
export async function getIndexHistory(
  indexId: string,
  limit: number = 100,
  startDate?: string,
  endDate?: string,
  page?: number,
  pageSize?: number,
): Promise<IndexHistoryResponse> {
  let url = `${API_BASE_URL}/indices/${encodeURIComponent(indexId)}/history?limit=${limit}`;
  if (startDate) url += `&startDate=${startDate}`;
  if (endDate) url += `&endDate=${endDate}`;
  if (page !== undefined) url += `&page=${page}`;
  if (pageSize !== undefined) url += `&pageSize=${pageSize}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

/**
 * 删除单条历史数据
 */
export async function deleteHistoryItem(
  indexId: string,
  historyId: string,
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(
    `${API_BASE_URL}/indices/${encodeURIComponent(indexId)}/history/${encodeURIComponent(historyId)}`,
    {
      method: 'DELETE',
    },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `删除失败: ${response.status}`);
  }
  return response.json();
}

/**
 * 按日期范围删除历史数据
 */
export async function deleteHistoryByDateRange(
  indexId: string,
  startDate: string,
  endDate: string,
): Promise<{ success: boolean; message: string; deletedCount: number }> {
  const url = `${API_BASE_URL}/indices/${encodeURIComponent(indexId)}/history?startDate=${startDate}&endDate=${endDate}`;
  const response = await fetch(url, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `删除失败: ${response.status}`);
  }
  return response.json();
}

/**
 * 获取所有 Cron 配置
 */
export async function getCronConfigs(): Promise<CronConfig[]> {
  const response = await fetch(`${API_BASE_URL}/admin/cron-configs`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

/**
 * 更新 Cron 配置
 */
export async function updateCronConfig(
  taskName: string,
  data: Partial<CronConfig>,
): Promise<CronConfig> {
  const response = await fetch(`${API_BASE_URL}/admin/cron-configs/${taskName}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `更新失败: ${response.status}`);
  }
  return response.json();
}

/**
 * 切换 Cron 任务启用状态
 */
export async function toggleCronConfig(taskName: string): Promise<CronConfig> {
  const response = await fetch(`${API_BASE_URL}/admin/cron-configs/${taskName}/toggle`, {
    method: 'PATCH',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `切换失败: ${response.status}`);
  }
  return response.json();
}

/**
 * 立即执行一次 Cron 任务
 */
export async function runCronTaskOnce(
  taskName: string,
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE_URL}/admin/cron-configs/${taskName}/run`, {
    method: 'POST',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `执行失败: ${response.status}`);
  }
  return response.json();
}

/**
 * 获取 Cron 任务运行状态
 */
export async function getCronJobStatus(
  taskName: string,
): Promise<{ running: boolean; nextRun?: Date }> {
  const response = await fetch(`${API_BASE_URL}/admin/cron-configs/${taskName}/status`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

/**
 * 获取指数的MA数据
 */
export async function getMovingAverages(
  indexId: string,
  limit: number = 100,
  page?: number,
  pageSize?: number,
): Promise<MovingAverageResponse> {
  let url = `${API_BASE_URL}/moving-averages/${encodeURIComponent(indexId)}?limit=${limit}`;
  if (page !== undefined) url += `&page=${page}`;
  if (pageSize !== undefined) url += `&pageSize=${pageSize}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

/**
 * 删除单条MA数据
 */
export async function deleteMovingAverage(id: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE_URL}/moving-averages/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `删除失败: ${response.status}`);
  }
  return response.json();
}

/**
 * 获取指数的趋势分析数据
 */
export async function getTrendAnalysis(
  indexId: string,
  limit: number = 20,
  offset: number = 0,
  page?: number,
  pageSize?: number,
): Promise<TrendAnalysisResponse> {
  let url = `${API_BASE_URL}/trend-analysis/${encodeURIComponent(indexId)}?limit=${limit}&offset=${offset}`;
  if (page !== undefined) url += `&page=${page}`;
  if (pageSize !== undefined) url += `&pageSize=${pageSize}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

/**
 * 删除单条趋势分析数据
 */
export async function deleteTrendAnalysis(id: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE_URL}/trend-analysis/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `删除失败: ${response.status}`);
  }
  return response.json();
}

/**
 * 批量重新同步所有指数数据
 */
export async function bulkResync(data: {
  startDate: string;
  endDate: string;
  type?: string;
  onlyActive?: string;
}): Promise<{ success: boolean; message: string; data?: any }> {
  const response = await fetch(`${API_BASE_URL}/indices/resync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `批量同步失败: ${response.status}`);
  }
  return response.json();
}

/**
 * 更新东财 Cookie
 */
export async function updateEastmoneyCookie(cookie: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE_URL}/indices/eastmoney/cookie`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookie }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Cookie更新失败: ${response.status}`);
  }
  return response.json();
}

/**
 * 批量计算所有指数的MA数据
 */
export async function calculateAllMA(type?: string): Promise<{
  success: boolean;
  total: number;
  successCount: number;
  failedCount: number;
}> {
  const url = type ? `${API_BASE_URL}/moving-averages/calculate-all?type=${type}` : `${API_BASE_URL}/moving-averages/calculate-all`;
  const response = await fetch(url, {
    method: 'POST',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `MA计算失败: ${response.status}`);
  }
  return response.json();
}

/**
 * 批量重新计算所有指数的最近N个交易日MA数据
 */
export async function recalculateRecentAllMA(days: number, type?: string): Promise<{
  success: boolean;
  total: number;
  successCount: number;
  failedCount: number;
}> {
  const url = type 
    ? `${API_BASE_URL}/moving-averages/recalculate-recent-all?days=${days}&type=${type}`
    : `${API_BASE_URL}/moving-averages/recalculate-recent-all?days=${days}`;
  const response = await fetch(url, {
    method: 'POST',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `MA重算失败: ${response.status}`);
  }
  return response.json();
}

/**
 * 执行增量趋势分析
 */
export async function analyzeIncremental(type?: string): Promise<{
  success: boolean;
  count: number;
}> {
  const url = type ? `${API_BASE_URL}/trend-analysis/analyze-incremental?type=${type}` : `${API_BASE_URL}/trend-analysis/analyze-incremental`;
  const response = await fetch(url, {
    method: 'POST',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `趋势分析失败: ${response.status}`);
  }
  return response.json();
}

/**
 * 按日期范围重新计算趋势分析
 */
export async function recalculateTrend(data: {
  startDate: string;
  endDate: string;
  type?: string;
}): Promise<{ success: boolean; count: number; message?: string }> {
  const response = await fetch(`${API_BASE_URL}/trend-analysis/recalculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `趋势重算失败: ${response.status}`);
  }
  return response.json();
}

/**
 * 多条件查询趋势分析数据（支持分页）
 * @param indexId 可选，指数ID
 * @param tradeDate 可选，交易日（精确匹配某一天）
 * @param page 页码
 * @param pageSize 每页条数
 * @param sortByDeviation 可选，是否按偏离率从高到低排序
 */
export async function queryTrendAnalysis(params?: {
  indexId?: string;
  tradeDate?: string;
  page?: number;
  pageSize?: number;
  sortByDeviation?: boolean;
}): Promise<{
  success: boolean;
  count: number;
  total: number;
  data: any[];
}> {
  let url = `${API_BASE_URL}/trend-analysis?`;
  if (params) {
    if (params.indexId) url += `indexId=${params.indexId}&`;
    if (params.tradeDate) url += `tradeDate=${params.tradeDate}&`;
    if (params.page !== undefined) url += `page=${params.page}&`;
    if (params.pageSize !== undefined) url += `pageSize=${params.pageSize}&`;
    if (params.sortByDeviation !== undefined) url += `sortByDeviation=${params.sortByDeviation}&`;
  }
  
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `查询失败: ${response.status}`);
  }
  return response.json();
}
