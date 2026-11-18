import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

interface MetricMeta {
  metric: string;
  label: string;
  group: 'fx' | 'asia' | 'cb';
  unit: string;
  decimals: number;
  defaultSource: string;
}
interface MetricLatest {
  metric: string;
  date: string;
  value: number;
  prevDate: string | null;
  prevValue: number | null;
  daysStale: number;
  source: string | null;
  minDate: string | null;
  hasData: boolean;
}
interface Overview {
  unifiedStart: string | null;
  metrics: MetricLatest[];
}
interface SeriesPoint {
  date: string;
  value: number;
}

const PALETTE = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#64748b'];

const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: '1m', label: '1月', days: 31 },
  { key: '3m', label: '3月', days: 93 },
  { key: '6m', label: '6月', days: 186 },
  { key: '1y', label: '1年', days: 365 },
  { key: '3y', label: '3年', days: 1095 },
  { key: 'all', label: '全部', days: null },
];

function todayStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}
function shiftDate(days: number): string {
  const d = new Date();
  d.setTime(d.getTime() + days * 86400000);
  return d.toISOString().slice(0, 10);
}

function fmtValue(v: number | null | undefined, decimals: number, unit: string): string {
  if (v === null || v === undefined || isNaN(v)) return '--';
  return v.toFixed(decimals) + unit;
}

function fmtChange(latest: MetricLatest, meta: MetricMeta): string {
  if (latest.prevValue === null || !latest.hasData) return '--';
  const d = latest.value - latest.prevValue;
  if (meta.unit === '%') return (d * 100).toFixed(1) + ' bp';
  return ((d / latest.prevValue) * 100).toFixed(2) + '%';
}
function changeColor(latest: MetricLatest): string {
  if (latest.prevValue === null || !latest.hasData) return 'text-gray-400';
  const d = latest.value - latest.prevValue;
  return d > 0 ? 'text-green-600' : d < 0 ? 'text-red-600' : 'text-gray-500';
}

/** 折线小图（时间轴，自动 resize，卸载销毁） */
function MiniChart({
  points,
  decimals,
  unit,
  color,
  height = 132,
}: {
  points: SeriesPoint[];
  decimals: number;
  unit: string;
  color: string;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const data = useMemo(() => points.map((p) => [p.date, p.value]), [points]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !data.length) return;
    const chart = echarts.init(el);
    // 单点/极少量数据时 ECharts scale 会给出离谱轴范围 → 显式按数据计算 min/max（留 8% 边距）
    const vals = data.map((d) => d[1] as number).filter((v) => !isNaN(v));
    const dmin = Math.min(...vals);
    const dmax = Math.max(...vals);
    const span = dmax - dmin || Math.abs(dmax) * 0.04 || 1;
    const pad = span * 0.08;
    chart.setOption({
      grid: { left: 52, right: 10, top: 10, bottom: 22 },
      xAxis: {
        type: 'time',
        axisLabel: { fontSize: 10, hideOverlap: true },
        axisLine: { lineStyle: { color: '#e5e7eb' } },
      },
      yAxis: {
        type: 'value',
        min: dmin - pad,
        max: dmax + pad,
        axisLabel: { fontSize: 10, formatter: (v: number) => v.toFixed(decimals) + unit },
        splitLine: { lineStyle: { color: '#f3f4f6' } },
      },
      tooltip: {
        trigger: 'axis',
        valueFormatter: (v: any) => (typeof v === 'number' ? v.toFixed(decimals) + unit : String(v)),
        axisPointer: { type: 'line', lineStyle: { color: '#9ca3af' } },
      },
      series: [
        {
          type: 'line',
          data,
          showSymbol: data.length <= 3,
          symbolSize: 5,
          smooth: false,
          lineStyle: { width: 1.6, color },
          areaStyle: { color, opacity: 0.07 },
          color,
        },
      ],
    });
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.dispose();
    };
  }, [data, decimals, unit, color]);

  if (!data.length) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-xs text-gray-400 bg-gray-50 rounded">
        暂无数据
      </div>
    );
  }
  return <div ref={ref} style={{ height, width: '100%' }} />;
}

/** 归一化对比图：区间起点 = 0%，各指标 % 变化叠加 */
function CompareChart({
  metrics,
  seriesMap,
  height = 240,
}: {
  metrics: MetricMeta[];
  seriesMap: Record<string, SeriesPoint[]>;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const seriesData = useMemo(() => {
    return metrics.map((m, i) => {
      const pts = seriesMap[m.metric] || [];
      const base = pts.length ? pts[0].value : null;
      const data = base ? pts.map((p) => [p.date, ((p.value / base) - 1) * 100]) : [];
      return { name: m.label, color: PALETTE[i % PALETTE.length], data };
    });
  }, [metrics, seriesMap]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !seriesData.some((s) => s.data.length)) return;
    const chart = echarts.init(el);
    // 跨系列算统一轴范围（单点时 ECharts scale 会失真）
    const allVals = seriesData.flatMap((s) => s.data.map((d) => d[1] as number)).filter((v) => !isNaN(v));
    let min = 0;
    let max = 0;
    if (allVals.length) {
      min = Math.min(...allVals);
      max = Math.max(...allVals);
      const span = max - min || Math.abs(max) || 1;
      const pad = span * 0.08;
      min -= pad;
      max += pad;
    }
    chart.setOption({
      grid: { left: 52, right: 14, top: 30, bottom: 24 },
      legend: {
        top: 0,
        textStyle: { fontSize: 11 },
        itemWidth: 14,
      },
      xAxis: {
        type: 'time',
        axisLabel: { fontSize: 10, hideOverlap: true },
        axisLine: { lineStyle: { color: '#e5e7eb' } },
      },
      yAxis: {
        type: 'value',
        min,
        max,
        axisLabel: { fontSize: 10, formatter: '{value}%' },
        splitLine: { lineStyle: { color: '#f3f4f6' } },
      },
      tooltip: {
        trigger: 'axis',
        valueFormatter: (v: any) => (typeof v === 'number' ? v.toFixed(2) + '%' : String(v)),
      },
      series: seriesData.map((s) => ({
        name: s.name,
        type: 'line' as const,
        data: s.data,
        showSymbol: s.data.length <= 3,
        symbolSize: 4,
        smooth: false,
        lineStyle: { width: 1.6 },
        color: s.color,
      })),
    });
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.dispose();
    };
  }, [seriesData]);

  if (!seriesData.some((s) => s.data.length)) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-xs text-gray-400 bg-gray-50 rounded">
        暂无数据
      </div>
    );
  }
  return <div ref={ref} style={{ height, width: '100%' }} />;
}

function SectionTitle({ children, desc }: { children: React.ReactNode; desc?: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-2">
      <h2 className="text-base font-semibold text-gray-800">{children}</h2>
      {desc && <span className="text-xs text-gray-400">{desc}</span>}
    </div>
  );
}

export function MacroDashboard() {
  const [metas, setMetas] = useState<MetricMeta[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [seriesMap, setSeriesMap] = useState<Record<string, SeriesPoint[]>>({});
  const [rangeKey, setRangeKey] = useState('1y');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [mRes, oRes] = await Promise.all([
          fetch(`${API}/macro/metrics`),
          fetch(`${API}/macro/overview`),
        ]);
        if (!mRes.ok || !oRes.ok) throw new Error(`API ${mRes.status}/${oRes.status}`);
        const metrics: MetricMeta[] = await mRes.json();
        const ov: Overview = await oRes.json();
        if (cancelled) return;
        setMetas(metrics);
        setOverview(ov);

        // 从库内最早点（统一回填起点）到今天全量拉，前端按区间切片
        const from = ov.unifiedStart || shiftDate(-1095);
        const sRes = await fetch(`${API}/macro/series?metrics=${metrics.map((m) => m.metric).join(',')}&from=${from}&to=${todayStr()}`);
        if (!sRes.ok) throw new Error(`series API ${sRes.status}`);
        const sData: { series: Record<string, SeriesPoint[]> } = await sRes.json();
        if (!cancelled) setSeriesMap(sData.series || {});
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rangeDays = RANGES.find((r) => r.key === rangeKey)?.days ?? null;
  const fromCutoff = rangeDays === null ? '0000-01-01' : shiftDate(-rangeDays);

  const slicedMap = useMemo(() => {
    const out: Record<string, SeriesPoint[]> = {};
    for (const [k, pts] of Object.entries(seriesMap)) {
      out[k] = pts.filter((p) => p.date >= fromCutoff);
    }
    return out;
  }, [seriesMap, fromCutoff]);

  const latestByMetric = useMemo(() => {
    const m: Record<string, MetricLatest> = {};
    for (const x of overview?.metrics || []) m[x.metric] = x;
    return m;
  }, [overview]);

  const groups: { key: MetricMeta['group']; title: string; desc: string }[] = [
    { key: 'fx', title: '汇率 · 利率 · 黄金', desc: '美元体系与中美利率' },
    { key: 'asia', title: '亚洲市场', desc: '资金流向的两个参照市场' },
    { key: 'cb', title: '可转债', desc: '博时可转债ETF 511380' },
  ];

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">加载中…</div>;
  }
  if (error) {
    return (
      <div className="p-6 text-sm text-red-600">
        加载失败：{error}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* 头部 */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">宏观看板</h1>
          <p className="text-xs text-gray-500 mt-1">
            {overview?.unifiedStart
              ? `数据自 ${overview.unifiedStart} 起（各指标统一历史起点）`
              : '暂无数据'}
            {' · '}
            每日 22:10（北京时间）自动更新
          </p>
        </div>
        <div className="flex items-center gap-2">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRangeKey(r.key)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                rangeKey === r.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* 数据新鲜度提示：仅提示“无数据”或明显滞后（>3天，正常隔夜/周末不算） */}
      {(() => {
        const noData = (overview?.metrics || []).filter((m) => !m.hasData);
        const stuck = (overview?.metrics || []).filter((m) => m.hasData && m.daysStale > 3);
        if (!noData.length && !stuck.length) return null;
        const label = (m: MetricLatest) =>
          `${metas.find((x) => x.metric === m.metric)?.label || m.metric}${
            m.hasData ? `（截至 ${m.date}，滞后${m.daysStale}天）` : '（暂无数据）'
          }`;
        return (
          <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
            {stuck.length > 0 && (
              <div>
                以下指标数据明显滞后（服务端该源每日自动重试，恢复后自动补齐历史）：
                {stuck.map((m) => (
                  <span key={m.metric} className="mx-1.5 font-medium">
                    {label(m)}
                  </span>
                ))}
              </div>
            )}
            {noData.length > 0 && (
              <div className={stuck.length > 0 ? 'mt-1' : ''}>
                以下指标暂无数据（等待数据源恢复，每日 22:10 自动重试）：
                {noData.map((m) => (
                  <span key={m.metric} className="mx-1.5 font-medium">
                    {label(m)}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {groups.map((g) => {
        const groupMetas = metas.filter((m) => m.group === g.key);
        return (
          <section key={g.key} className="mb-8">
            <SectionTitle desc={g.desc}>{g.title}</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-3">
              {groupMetas.map((meta, i) => {
                const latest = latestByMetric[meta.metric];
                const color = PALETTE[i % PALETTE.length];
                return (
                  <div key={meta.metric} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-sm font-medium text-gray-800">{meta.label}</span>
                      <span className={`text-sm font-semibold ${changeColor(latest)}`}>
                        {fmtValue(latest?.value, meta.decimals, meta.unit)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1">
                      <span>
                        {latest?.hasData ? `截至 ${latest.date}` : '暂无数据'}
                        {latest?.daysStale ? ` · 滞后${latest.daysStale}天` : ''}
                      </span>
                      <span className={changeColor(latest)} title={latest?.prevDate ? `较 ${latest.prevDate}` : ''}>
                        {fmtChange(latest, meta)}
                      </span>
                    </div>
                    <MiniChart
                      points={slicedMap[meta.metric] || []}
                      decimals={meta.decimals}
                      unit={meta.unit}
                      color={color}
                    />
                  </div>
                );
              })}
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
              <div className="text-xs font-medium text-gray-600 mb-1">区间归一化对比（区间起点 = 0%）</div>
              <CompareChart metrics={groupMetas} seriesMap={slicedMap} />
            </div>
          </section>
        );
      })}

      {/* 页脚：来源说明 */}
      <div className="text-[11px] text-gray-400 border-t border-gray-100 pt-3 leading-relaxed">
        日度来源：新浪外汇/黄金/美元指数（usdcnh、usd_jpy、eurusd、gold_usd、dxy）、腾讯行情（nikkei225）、
        中债（cn_30y_yield）、美国财政部（us_10y_yield）、新浪K线（etf_511380）、
        东财（sensex 及部分历史K线；该源在服务器偶发不可达，恢复后每日自动补齐历史）。
        usd_jpy/eurusd 历史为欧洲央行参考汇率（frankfurter），东财恢复后以行情K线覆盖。
        统一历史起点由 scripts/backfill-macro.js 计算并保存。
      </div>
    </div>
  );
}
