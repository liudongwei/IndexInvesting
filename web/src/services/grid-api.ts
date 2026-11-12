/**
 * 网格回测 API 封装
 * 路由前缀：VITE_API_BASE_URL（dev=http://localhost:3000/api，prod=/api）
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export interface GridBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface GridTrade {
  date: string;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  amount: number;
  commission: number;
  level: number;
}

export interface EquityPoint {
  date: string;
  equity: number;
  cash: number;
  positionValue: number;
  benchmark: number;
}

export interface GridMetrics {
  firstDate: string;
  lastDate: string;
  barCount: number;
  basePrice: number;
  lowerPrice: number;
  upperPrice: number;
  initialCapital: number;
  totalValue: number;
  totalReturn: number;
  annualizedReturn: number;
  benchmarkReturn: number;
  excessReturn: number;
  maxDrawdown: number;
  peakCapitalUsed: number;
  peakCapitalUtilization: number;
  realizedGridProfit: number;
  netRealizedProfit: number;
  unrealizedPnl: number;
  totalCommission: number;
  buyCount: number;
  sellCount: number;
  pairedCount: number;
  lotPairCount: number;
  winRate: number | null;
  avgPairProfit: number | null;
  avgHoldingDays: number | null;
  cashShortfallSkips: number;
  partialFillCount: number;
  sameDayBlockedSells: number;
  outOfRangeDays: number;
  outOfRangeRatio: number;
  turnover: number;
  volatility: number;
  finalCash: number;
  finalQty: number;
  finalPositionValue: number;
  finalPositionCost: number;
}

export interface GridAdaptivity {
  available: boolean;
  reason?: string;
  indexId?: string;
  sampleDays?: number;
  coverage?: number;
  trendDistribution?: Record<string, number>;
  trendRatio?: { uptrend: number; downtrend: number; sideways: number };
  marketPositionDistribution?: Record<string, number>;
  label?: string;
}

export interface GridRunPayload {
  instrumentCode?: string;
  indexCode?: string;
  startDate: string;
  endDate: string;
  basePrice?: number;
  upperPct: number;
  lowerPct: number;
  gridMode: 'arithmetic' | 'geometric';
  gridCount: number;
  quantityPerGrid: number;
  initialCapital: number;
  commissionRate?: number;
  minCommission?: number;
  slippageBps?: number;
  lotSize?: number;
  applyTPlus1?: boolean;
  adaptivityIndexCode?: string;
}

export interface GridRunResult {
  id: string;
  targetType: 'instrument' | 'index';
  targetLabel: string;
  instrumentCode: string | null;
  indexCode: string | null;
  params: Record<string, any>;
  metrics: GridMetrics;
  levels: number[];
  adaptivity: GridAdaptivity;
  warnings: string[];
  curve: EquityPoint[];
  trades: GridTrade[];
  bars: GridBar[] | null;
  dataSource?: string;
  elapsedMs?: number;
  barsWarning?: string | null;
  createdAt?: string;
}

export interface GridRunListItem {
  id: string;
  targetType: string;
  targetLabel: string;
  instrumentCode: string | null;
  indexCode: string | null;
  params: Record<string, any>;
  metrics: Partial<GridMetrics>;
  createdAt: string;
}

export interface SuggestResult {
  basePrice: number;
  upperPct: number;
  lowerPct: number;
  upperPrice: number;
  lowerPrice: number;
  gridMode: 'arithmetic' | 'geometric';
  gridCount: number;
  quantityPerGrid: number;
  initialCapital: number;
  lotSize: number;
  commissionRate: number;
  minCommission: number;
  slippageBps: number;
  applyTPlus1: boolean;
  annualizedVolatility: number;
  rangeHigh: number;
  rangeLow: number;
  coverage: { firstDate: string; lastDate: string; barCount: number };
  warnings: string[];
}

export interface ScanCell {
  gridCount: number;
  upperPct: number;
  lowerPct: number;
  totalReturn: number;
  annualizedReturn: number;
  excessReturn: number;
  maxDrawdown: number;
  peakCapitalUtilization: number;
  pairedCount: number;
  winRate: number | null;
  totalValue: number;
  totalCommission: number;
}

export interface ScanResult {
  gridCounts: number[];
  upperPcts: number[];
  symmetric: boolean;
  barCount: number;
  cells: ScanCell[];
  best: ScanCell | null;
  elapsedMs: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, init);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (Array.isArray(j?.message)) msg = j.message.join('；');
      else if (typeof j?.message === 'string') msg = j.message;
      else if (typeof j?.error === 'string') msg = j.error;
    } catch {
      /* 非 JSON 错误体 */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function runGridBacktest(payload: GridRunPayload): Promise<{ success: boolean; data: GridRunResult }> {
  return post('/admin/grid-backtest/runs', payload);
}

export function suggestGridParams(payload: {
  instrumentCode?: string;
  indexCode?: string;
  startDate: string;
  endDate: string;
  initialCapital?: number;
  gridCount?: number;
}): Promise<{ success: boolean; data: SuggestResult }> {
  return post('/admin/grid-backtest/suggest', payload);
}

export type GridScanPayload = Omit<GridRunPayload, 'upperPct' | 'lowerPct' | 'gridCount'> & {
  gridCounts: number[];
  upperPcts: number[];
};

export function scanGridBacktest(payload: GridScanPayload): Promise<{ success: boolean; data: ScanResult }> {
  return post('/admin/grid-backtest/scan', payload);
}

export function listGridRuns(): Promise<{ success: boolean; data: GridRunListItem[] }> {
  return request('/admin/grid-backtest/runs');
}

export function getGridRun(id: string): Promise<{ success: boolean; data: GridRunResult }> {
  return request(`/admin/grid-backtest/runs/${id}`);
}

export function deleteGridRun(id: string): Promise<{ success: boolean }> {
  return request(`/admin/grid-backtest/runs/${id}`, { method: 'DELETE' });
}
