import type { TrendRankingResponse, TrendRankingByDateResponse } from '../types/trend';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

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
