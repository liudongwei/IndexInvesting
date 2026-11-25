/**
 * 技术指标页(/indicators,公开) —— 规格 §7:
 * 主图 K线+MA+BOLL(可开关,对数坐标可切) / 副图 成交量+量比、MACD、ADX、OBV / 信号列表 / 免责声明。
 * 实现红线:局部 ErrorBoundary、可选字段 ?? [] 兜底、底部交互成功后 scrollTo(0)、图表随容器宽度重算。
 */
import { Component, ErrorInfo, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  PriceScaleMode,
  IChartApi,
  ISeriesApi,
  Time,
} from 'lightweight-charts';

// 项目约定:VITE_API_BASE_URL 生产=/api(已含全局前缀),开发=http://localhost:3000/api —— 路径一律不再拼 /api
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

const RANGE_OPTIONS = [
  { value: '3m', label: '3月' },
  { value: '6m', label: '6月' },
  { value: '1y', label: '1年' },
  { value: 'all', label: '全部' },
];

interface Instrument { id: string; name: string; code?: string }
interface CandlePoint { date: string; o: number | null; h: number | null; l: number | null; c: number | null; v: number | null }
interface IndicatorsResponse {
  indexId: string;
  name: string;
  range: string;
  asOfDate: string | null;
  candles: CandlePoint[];
  overlays: { ma: Record<string, (number | null)[]>; boll: Record<string, (number | null)[]> };
  subcharts: { volume: Record<string, (number | null)[]>; macd: Record<string, (number | null)[]>; adx: Record<string, (number | null)[]>; obv: Record<string, (number | null)[]> };
  optional: Record<string, (number | null)[]>;
  state: { key: string; label: string; basis: string[]; date: string } | null;
  signals: { date: string; type: string; direction: string; basis: string }[];
  disclaimer: string;
  message?: string;
}

const SIGNAL_TYPE_LABEL: Record<string, string> = {
  macdGoldenCross: 'MACD金叉',
  macdDeathCross: 'MACD死叉',
  macdTopDivergence: 'MACD顶背离',
  macdBottomDivergence: 'MACD底背离',
  obvTopDivergence: 'OBV顶背离',
  obvBottomDivergence: 'OBV底背离',
  bollBandSqueeze: '带宽收缩',
  volumeSurge: '放量',
  volumeShrink: '缩量',
};

const STATE_COLOR: Record<string, string> = {
  trendHealthy: 'bg-green-100 text-green-800',
  topWarning: 'bg-orange-100 text-orange-800',
  trendStart: 'bg-blue-100 text-blue-800',
  rangebound: 'bg-gray-100 text-gray-700',
  bottomZone: 'bg-emerald-100 text-emerald-800',
  bearWeak: 'bg-red-100 text-red-800',
  bullPullback: 'bg-sky-100 text-sky-800',
  bearRebound: 'bg-amber-100 text-amber-800',
  breakdownConfirmed: 'bg-rose-100 text-rose-800',
  wait: 'bg-slate-100 text-slate-700',
};

/** 局部 ErrorBoundary:渲染/effect 崩溃降级为提示条+重试,不白屏(项目红线) */
class IndicatorsErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[indicators] 页面异常:', error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="p-6 m-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          <div className="font-medium mb-2">技术指标页渲染出错: {this.state.error.message}</div>
          <button className="px-3 py-1.5 bg-red-600 text-white rounded text-sm" onClick={() => this.setState({ error: null })}>重试</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function Main() {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [range, setRange] = useState('1y');
  const [logScale, setLogScale] = useState(false);
  const [data, setData] = useState<IndicatorsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBoll, setShowBoll] = useState(false);
  const [showMa120, setShowMa120] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<Record<string, ISeriesApi<any>>>({});

  // 标的下拉:公开 GET /api/indices(技术指标仅指数;规格 §7 写的 portfolio/instruments 是 ETF 白名单,与"仅指数"矛盾,已用 indices 替代并在检查点披露)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/indices`);
        const j = await res.json();
        const list: Instrument[] = (Array.isArray(j) ? j : j.data ?? []).filter((i: any) => i.isActive !== false);
        setInstruments(list);
      } catch {
        setError('加载指数列表失败');
      }
    })();
  }, []);

  const loadData = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/indicators/${selectedId}?range=${range}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || `接口返回 ${res.status}`);
      }
      const j: IndicatorsResponse = await res.json();
      setData(j);
      // 区间切换后滚动回顶部(页面底部交互成功后 scrollTo(0) 红线)
      window.scrollTo(0, 0);
    } catch (e: any) {
      setError(e?.message || '加载失败');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedId, range]);

  useEffect(() => { loadData(); }, [loadData]);

  // 区间>1年默认对数,短区间默认线性(手动切换保留)
  const applyRangeDefaultScale = (r: string) => {
    setRange(r);
    setLogScale(r === 'all');
  };

  // ---- 图表构建(lightweight-charts v5 多 pane) ----
  const seriesData = useMemo(() => {
    if (!data) return null;
    const at = (arr: (number | null)[] | undefined, i: number) => arr?.[i] ?? null;
    return {
      candles: data.candles.filter((c) => c.c !== null).map((c) => ({ time: c.date as Time, open: c.o!, high: c.h!, low: c.l!, close: c.c! })),
      ma: Object.fromEntries(Object.entries(data.overlays.ma ?? {}).map(([k, arr]) => [
        k,
        data.candles.map((c, i) => ({ time: c.date as Time, value: at(arr, i) })).filter((p: any) => p.value !== null),
      ])),
      boll: Object.fromEntries(Object.entries(data.overlays.boll ?? {}).map(([k, arr]) => [
        k,
        data.candles.map((c, i) => ({ time: c.date as Time, value: at(arr, i) })).filter((p: any) => p.value !== null),
      ])),
      volume: data.candles.map((c, i) => ({ time: c.date as Time, value: at(data.subcharts.volume?.v, i), vr: at(data.subcharts.volume?.volumeRatio, i), up: i > 0 && (c.c ?? 0) >= (data.candles[i - 1].c ?? 0) })).filter((p: any) => p.value !== null),
      vma: Object.fromEntries(['vma5', 'vma10'].map((k) => [
        k,
        data.candles.map((c, i) => ({ time: c.date as Time, value: at(data.subcharts.volume?.[k], i) })).filter((p: any) => p.value !== null),
      ])),
      macdDif: data.candles.map((c, i) => ({ time: c.date as Time, value: at(data.subcharts.macd?.dif, i) })).filter((p: any) => p.value !== null),
      macdDea: data.candles.map((c, i) => ({ time: c.date as Time, value: at(data.subcharts.macd?.dea, i) })).filter((p: any) => p.value !== null),
      macdHist: data.candles.map((c, i) => ({ time: c.date as Time, value: at(data.subcharts.macd?.hist, i) })).filter((p: any) => p.value !== null),
      adx: data.candles.map((c, i) => ({ time: c.date as Time, value: at(data.subcharts.adx?.adx, i) })).filter((p: any) => p.value !== null),
      pdi: data.candles.map((c, i) => ({ time: c.date as Time, value: at(data.subcharts.adx?.pdi, i) })).filter((p: any) => p.value !== null),
      mdi: data.candles.map((c, i) => ({ time: c.date as Time, value: at(data.subcharts.adx?.mdi, i) })).filter((p: any) => p.value !== null),
      obv: data.candles.map((c, i) => ({ time: c.date as Time, value: at(data.subcharts.obv?.obv, i) })).filter((p: any) => p.value !== null),
      obvEma: data.candles.map((c, i) => ({ time: c.date as Time, value: at(data.subcharts.obv?.obvEma20, i) })).filter((p: any) => p.value !== null),
    };
  }, [data]);

  useEffect(() => {
    const el = chartRef.current;
    if (!el || !seriesData) return;
    el.innerHTML = '';

    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { color: '#ffffff' }, textColor: '#475569', panes: { separatorColor: '#e2e8f0' } },
      grid: { vertLines: { color: '#f1f5f9' }, horzLines: { color: '#f1f5f9' } },
      rightPriceScale: { borderColor: '#e2e8f0' },
      timeScale: { borderColor: '#e2e8f0' },
      height: 700,
    });
    chartApiRef.current = chart;
    seriesRef.current = {};

    // Pane 0:主图
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350',
    }, 0);
    candle.setData(seriesData.candles);
    seriesRef.current.candle = candle;

    const maColors: Record<string, string> = { ma20: '#2563eb', ma60: '#f59e0b', ma120: '#9333ea', ma250: '#64748b' };
    for (const [k, arr] of Object.entries(seriesData.ma)) {
      if (k !== 'ma20' && k !== 'ma60' && !(k === 'ma120' && showMa120) && !(k === 'ma250' && showMa120)) continue;
      const s = chart.addSeries(LineSeries, { color: maColors[k] ?? '#666', lineWidth: 1, title: k.toUpperCase() }, 0);
      s.setData(arr);
      seriesRef.current[k] = s;
    }
    if (showBoll) {
      const bollColors: Record<string, string> = { mid: '#0891b2', upper: '#d1d5db', lower: '#d1d5db' };
      for (const [k, arr] of Object.entries(seriesData.boll)) {
        const s = chart.addSeries(LineSeries, { color: bollColors[k] ?? '#ccc', lineWidth: 1, title: k, lineStyle: k === 'mid' ? 0 : 2 }, 0);
        s.setData(arr);
        seriesRef.current['boll_' + k] = s;
      }
    }

    // Pane 1:成交量 + VMA(量比≥1.5 标色)
    const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, title: '成交量' }, 1);
    vol.setData(seriesData.volume.map((p: any) => ({
      time: p.time,
      value: p.value,
      color: p.vr !== null && p.vr >= 1.5 ? 'rgba(249,115,22,0.85)' : p.up ? 'rgba(38,166,154,0.5)' : 'rgba(239,83,80,0.5)',
    })));
    seriesRef.current.vol = vol;
    const vmaColors: Record<string, string> = { vma5: '#2563eb', vma10: '#f59e0b' };
    for (const [k, arr] of Object.entries(seriesData.vma)) {
      const s = chart.addSeries(LineSeries, { color: vmaColors[k], lineWidth: 1, title: k.toUpperCase() }, 1);
      s.setData(arr);
      seriesRef.current[k] = s;
    }

    // Pane 2:MACD(DIF/DEA + 柱体)
    const hist = chart.addSeries(HistogramSeries, { title: 'MACD柱' }, 2);
    hist.setData(seriesData.macdHist.map((p: any) => ({ time: p.time, value: p.value, color: p.value >= 0 ? 'rgba(38,166,154,0.7)' : 'rgba(239,83,80,0.7)' })));
    seriesRef.current.macdHist = hist;
    const dif = chart.addSeries(LineSeries, { color: '#2563eb', lineWidth: 1, title: 'DIF' }, 2);
    dif.setData(seriesData.macdDif);
    const dea = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1, title: 'DEA' }, 2);
    dea.setData(seriesData.macdDea);
    seriesRef.current.dif = dif;
    seriesRef.current.dea = dea;

    // Pane 3:ADX(20/25 参考线)
    const adx = chart.addSeries(LineSeries, { color: '#7c3aed', lineWidth: 2, title: 'ADX' }, 3);
    adx.setData(seriesData.adx);
    adx.createPriceLine({ price: 20, color: 'rgba(100,116,139,0.6)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '20' });
    adx.createPriceLine({ price: 25, color: 'rgba(249,115,22,0.6)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '25' });
    seriesRef.current.adx = adx;
    const pdi = chart.addSeries(LineSeries, { color: '#16a34a', lineWidth: 1, title: '+DI' }, 3);
    pdi.setData(seriesData.pdi);
    const mdi = chart.addSeries(LineSeries, { color: '#dc2626', lineWidth: 1, title: '-DI' }, 3);
    mdi.setData(seriesData.mdi);
    seriesRef.current.pdi = pdi;
    seriesRef.current.mdi = mdi;

    // Pane 4:OBV 双线(副图一律线性坐标)
    const obv = chart.addSeries(LineSeries, { color: '#0891b2', lineWidth: 1, title: 'OBV' }, 4);
    obv.setData(seriesData.obv);
    const obvEma = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1, title: 'EMA20', lineStyle: 2 }, 4);
    obvEma.setData(seriesData.obvEma);
    seriesRef.current.obv = obv;
    seriesRef.current.obvEma = obvEma;

    // 主图加高,副图均分(副图一律线性坐标)
    const panes = chart.panes();
    if (panes.length === 5) {
      panes[0].setStretchFactor(3.2);
      for (let i = 1; i < 5; i++) panes[i].setStretchFactor(1);
    }

    // 对数坐标只作用于主图(pane 0),副图保持线性
    try {
      chart.priceScale('right', 0).applyOptions({ mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal });
    } catch { /* 旧版本兼容,失败则保持线性 */ }

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartApiRef.current = null;
      seriesRef.current = {};
    };
  }, [seriesData, showBoll, showMa120, logScale]);

  const latestOptional = useMemo(() => {
    if (!data) return null;
    const last = (arr?: (number | null)[]) => {
      const a = arr ?? [];
      for (let i = a.length - 1; i >= 0; i--) if (a[i] !== null && a[i] !== undefined) return a[i] as number;
      return null;
    };
    return {
      rsi: last(data.optional?.rsi),
      cmf: last(data.optional?.cmf),
      bias20: last(data.optional?.bias20),
      bias60: last(data.optional?.bias60),
      atr14: last((data as any).optional?.atr14),
      hv20: last((data as any).optional?.hv20),
    };
  }, [data]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-4">
        {/* 顶部控制条 */}
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <select
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            <option value="">选择指数…</option>
            {instruments.map((i) => (
              <option key={i.id} value={i.id}>{i.name}{i.code ? ` (${i.code})` : ''}</option>
            ))}
          </select>
          <div className="flex rounded-md overflow-hidden border border-gray-300 text-sm">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r.value}
                className={`px-3 py-1.5 ${range === r.value ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
                onClick={() => applyRangeDefaultScale(r.value)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            <input type="checkbox" checked={logScale} onChange={(e) => setLogScale(e.target.checked)} />
            对数坐标
          </label>
          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            <input type="checkbox" checked={showBoll} onChange={(e) => setShowBoll(e.target.checked)} />
            BOLL
          </label>
          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            <input type="checkbox" checked={showMa120} onChange={(e) => setShowMa120(e.target.checked)} />
            MA120/250
          </label>
          {data?.asOfDate && <span className="text-xs text-gray-400">数据截至 {data.asOfDate}</span>}
          {loading && <span className="text-xs text-blue-500">加载中…</span>}
        </div>

        {error && (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
            {error}
            <button className="ml-3 underline" onClick={() => loadData()}>重试</button>
          </div>
        )}

        {/* 状态徽章 + 依据 */}
        {data?.state && (
          <div className="mb-3 p-3 bg-white border border-gray-200 rounded-lg">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2.5 py-1 rounded-full text-sm font-medium ${STATE_COLOR[data.state.key] ?? 'bg-gray-100'}`}>
                {data.state.label}
              </span>
              <span className="text-xs text-gray-400">{data.state.date}</span>
            </div>
            <ul className="mt-2 text-sm text-gray-600 space-y-0.5">
              {(data.state.basis ?? []).map((b, i) => <li key={i}>· {b}</li>)}
            </ul>
          </div>
        )}
        {data && !data.state && data.message && (
          <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded text-amber-800 text-sm">{data.message}</div>
        )}

        {/* 图表 */}
        <div className="bg-white border border-gray-200 rounded-lg p-2">
          <div ref={chartRef} className="w-full" style={{ height: 700 }} />
        </div>

        {/* 更多指标(第二梯队,首期只出数据不上图) */}
        <div className="mt-3 bg-white border border-gray-200 rounded-lg">
          <button
            className="w-full px-4 py-2 text-left text-sm font-medium text-gray-700 flex justify-between"
            onClick={() => { setShowMore(!showMore); window.scrollTo(0, 0); }}
          >
            <span>更多指标(RSI / CMF / BIAS / ATR / HV)</span>
            <span>{showMore ? '▲' : '▼'}</span>
          </button>
          {showMore && latestOptional && (
            <div className="px-4 pb-3 grid grid-cols-2 md:grid-cols-6 gap-2 text-sm">
              {[
                ['RSI(14)', latestOptional.rsi],
                ['CMF(20)', latestOptional.cmf],
                ['BIAS20', latestOptional.bias20],
                ['BIAS60', latestOptional.bias60],
                ['ATR(14)', latestOptional.atr14],
                ['HV(20)年化', latestOptional.hv20 === null ? null : `${(latestOptional.hv20 * 100).toFixed(1)}%`],
              ].map(([label, v]) => (
                <div key={label as string} className="p-2 bg-gray-50 rounded">
                  <div className="text-xs text-gray-400">{label as string}</div>
                  <div className="text-gray-800">{v === null || v === undefined ? '—' : String(v)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 信号列表(近 30 条) */}
        <div className="mt-3 bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2 text-sm font-medium text-gray-700 border-b border-gray-100">近期信号(近 30 条)</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="px-4 py-1.5">日期</th>
                <th className="px-4 py-1.5">类型</th>
                <th className="px-4 py-1.5">方向</th>
                <th className="px-4 py-1.5">依据</th>
              </tr>
            </thead>
            <tbody>
              {(data?.signals ?? []).map((s, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="px-4 py-1.5 whitespace-nowrap text-gray-500">{s.date}</td>
                  <td className="px-4 py-1.5 whitespace-nowrap">{SIGNAL_TYPE_LABEL[s.type] ?? s.type}</td>
                  <td className="px-4 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${s.direction === 'bullish' ? 'bg-green-100 text-green-700' : s.direction === 'bearish' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                      {s.direction === 'bullish' ? '看多' : s.direction === 'bearish' ? '看空' : '中性'}
                    </span>
                  </td>
                  <td className="px-4 py-1.5 text-gray-600">{s.basis}</td>
                </tr>
              ))}
              {(data?.signals ?? []).length === 0 && (
                <tr><td className="px-4 py-3 text-gray-400" colSpan={4}>暂无信号</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-xs text-gray-400">
          ⓘ {data?.disclaimer ?? '仅供参考,不构成投资建议'}
        </div>
      </div>
    </div>
  );
}

export default function TechnicalIndicators() {
  return (
    <IndicatorsErrorBoundary>
      <Main />
    </IndicatorsErrorBoundary>
  );
}
