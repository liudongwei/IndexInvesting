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
