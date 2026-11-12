import { useState, useEffect, useRef, Component } from 'react';
import type { ReactNode } from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  LineStyle,
  createSeriesMarkers,
} from 'lightweight-charts';
import {
  runGridBacktest,
  suggestGridParams,
  scanGridBacktest,
  listGridRuns,
  getGridRun,
  deleteGridRun,
} from '../services/grid-api';
import type { GridRunResult, GridRunListItem, SuggestResult, ScanResult } from '../services/grid-api';

// ---------------------------------------------------------------- 工具函数

const pad2 = (n: number) => String(n).padStart(2, '0');
const toLocalStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const TODAY = toLocalStr(new Date());
const YEAR_AGO = toLocalStr(new Date(Date.now() - 365 * 86400000));

const fmtPct = (x: number | null | undefined, d = 2) =>
  x == null ? '—' : `${(x * 100).toFixed(d)}%`;
const fmtMoney = (x: number | null | undefined) =>
  x == null ? '—' : x.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const fmtInt = (x: number | null | undefined) => (x == null ? '—' : x.toLocaleString('zh-CN'));

interface Opt {
  code: string;
  label: string;
}

interface CompareRun {
  label: string;
  curve: { date: string; equity: number }[];
}

type TabKey = 'kline' | 'equity' | 'trades' | 'adapt' | 'scan';

// ---------------------------------------------------------------- 小组件

function Card({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'pos' | 'neg' }) {
  const toneCls = tone === 'pos' ? 'text-emerald-600' : tone === 'neg' ? 'text-red-600' : 'text-gray-900';
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-3 py-2.5">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-semibold leading-6 mt-0.5 ${toneCls}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block mb-2.5">
      <div className="text-xs text-gray-500 mb-1">
        {label}
        {hint && <span className="text-gray-400 ml-1">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

const inputCls =
  'w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

/** 局部错误边界：任何渲染/图表 effect 崩溃都降级为提示条，绝不白屏 */
interface BoundaryState {
  error: Error | null;
}
class GridErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };
  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-4 m-4 bg-red-50 border border-red-200 rounded-lg max-w-2xl">
          <div className="text-red-700 text-sm font-medium">页面渲染出错：{this.state.error.message}</div>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-2 px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------- 主组件

function GridBacktestInner() {
  const [targetType, setTargetType] = useState<'instrument' | 'index'>('instrument');
  const [instruments, setInstruments] = useState<Opt[]>([]);
  const [indices, setIndices] = useState<Opt[]>([]);
  const [instrumentCode, setInstrumentCode] = useState('');
  const [indexCode, setIndexCode] = useState('');
  const [adaptIdx, setAdaptIdx] = useState('');

  const [startDate, setStartDate] = useState(YEAR_AGO);
  const [endDate, setEndDate] = useState(TODAY);
  const [basePrice, setBasePrice] = useState('');
  const [upperPct, setUpperPct] = useState('15');
  const [lowerPct, setLowerPct] = useState('15');
  const [gridMode, setGridMode] = useState<'arithmetic' | 'geometric'>('arithmetic');
  const [gridCount, setGridCount] = useState('10');
  const [qtyPerGrid, setQtyPerGrid] = useState('1000');
  const [initialCapital, setInitialCapital] = useState('50000');
  const [commissionWan, setCommissionWan] = useState('0.6');
  const [minCommission, setMinCommission] = useState('0.2');
  const [slippageBps, setSlippageBps] = useState('0');
  const [lotSize, setLotSize] = useState('100');
  const [applyT1, setApplyT1] = useState(true);

  const [result, setResult] = useState<GridRunResult | null>(null);
  const [runs, setRuns] = useState<GridRunListItem[]>([]);
  const [compare, setCompare] = useState<CompareRun | null>(null);
  const [tab, setTab] = useState<TabKey>('kline');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [suggestInfo, setSuggestInfo] = useState<SuggestResult | null>(null);

  const [scanCountsStr, setScanCountsStr] = useState('5,10,15,20,25');
  const [scanPctsStr, setScanPctsStr] = useState('5,10,15,20,25,30');
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [scanBusy, setScanBusy] = useState(false);

  const klineRef = useRef<HTMLDivElement>(null);
  const equityRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------- 数据加载

  const refreshRuns = async () => {
    try {
      const res = await listGridRuns();
      setRuns(res.data || []);
    } catch {
      /* 列表加载失败不阻塞主流程 */
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
        const [ir, xr] = await Promise.all([
          fetch(`${baseUrl}/admin/trading-instruments?page=1&limit=200`),
          fetch(`${baseUrl}/indices`),
        ]);
        const ij = await ir.json();
        const xj = await xr.json();
        const instArr = Array.isArray(ij) ? ij : ij.data || [];
        const idxArr = Array.isArray(xj) ? xj : xj.data || xj.indices || [];
        const instList: Opt[] = instArr.map((x: any) => ({ code: x.code, label: `${x.name}(${x.code})` }));
        const idxList: Opt[] = idxArr.map((x: any) => ({ code: x.code, label: `${x.name}(${x.code})` }));
        setInstruments(instList);
        setIndices(idxList);
        if (instList.length) setInstrumentCode((c) => c || instList[0].code);
        if (idxList.length) setIndexCode((c) => c || idxList[0].code);
      } catch {
        setErr('加载标的/指数列表失败，请刷新重试');
      }
      refreshRuns();
    })();
  }, []);

  // ---------------------------------------------------------- 图表：K线 + 网格

  useEffect(() => {
    if (tab !== 'kline' || !result || !result.bars || !klineRef.current) return;
    const el = klineRef.current;
    el.innerHTML = '';
    const chart = createChart(el, {
      height: 420,
      autoSize: true,
      layout: { background: { color: '#ffffff' }, textColor: '#475569' },
      grid: { vertLines: { color: '#f1f5f9' }, horzLines: { color: '#f1f5f9' } },
      rightPriceScale: { borderColor: '#e2e8f0' },
      timeScale: { borderColor: '#e2e8f0' },
    });
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
    candle.setData(
      result.bars.map((b) => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close })),
    );

    // 网格线（最多画 ~100 条，上下界高亮）；旧记录详情可能缺 levels，必须兜底
    const levels = result.levels ?? [];
    const lastIdx = levels.length - 1;
    const step = Math.max(1, Math.ceil(levels.length / 100));
    levels.forEach((p, i) => {
      if (i % step !== 0 && i !== lastIdx) return;
      const boundary = i === 0 || i === lastIdx;
      candle.createPriceLine({
        price: p,
        color: boundary ? 'rgba(249,115,22,0.9)' : 'rgba(59,130,246,0.35)',
        lineWidth: 1,
        lineStyle: boundary ? LineStyle.Solid : LineStyle.Dashed,
        axisLabelVisible: boundary,
        title: i === 0 ? '下界' : i === lastIdx ? '上界' : '',
      });
    });

    // 买卖点标记（密集时仅显示最近 2000 笔）
    const cap = 2000;
    const shown = result.trades.length > cap ? result.trades.slice(-cap) : result.trades;
    createSeriesMarkers(
      candle,
      shown.map((t) => ({
        time: t.date,
        position: (t.side === 'buy' ? 'belowBar' : 'aboveBar') as 'belowBar' | 'aboveBar',
        color: t.side === 'buy' ? '#16a34a' : '#dc2626',
        shape: (t.side === 'buy' ? 'arrowUp' : 'arrowDown') as 'arrowUp' | 'arrowDown',
      })),
    );
    chart.timeScale().fitContent();
    return () => {
      chart.remove();
      el.innerHTML = '';
    };
  }, [tab, result]);

  // ---------------------------------------------------------- 图表：权益曲线

  useEffect(() => {
    if (tab !== 'equity' || (!result && !compare) || !equityRef.current) return;
    const el = equityRef.current;
    el.innerHTML = '';
    const chart = createChart(el, {
      height: 420,
      autoSize: true,
      layout: { background: { color: '#ffffff' }, textColor: '#475569' },
      grid: { vertLines: { color: '#f1f5f9' }, horzLines: { color: '#f1f5f9' } },
      rightPriceScale: { borderColor: '#e2e8f0' },
      timeScale: { borderColor: '#e2e8f0' },
    });
    if (result) {
      const eq = chart.addSeries(LineSeries, { color: '#2563eb', lineWidth: 2, title: '网格策略' });
      eq.setData(result.curve.map((p) => ({ time: p.date, value: p.equity })));
      const bm = chart.addSeries(LineSeries, {
        color: '#f59e0b',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        title: '买入持有',
      });
      bm.setData(result.curve.map((p) => ({ time: p.date, value: p.benchmark })));
    }
    if (compare) {
      const cmp = chart.addSeries(LineSeries, { color: '#a855f7', lineWidth: 2, title: compare.label });
      cmp.setData(compare.curve.map((p) => ({ time: p.date, value: p.equity })));
    }
    chart.timeScale().fitContent();
    return () => {
      chart.remove();
      el.innerHTML = '';
    };
  }, [tab, result, compare]);

  // ---------------------------------------------------------- 参数与动作

  const targetPayloadBase = () => {
    if (targetType === 'instrument') {
      if (!instrumentCode) throw new Error('请先选择交易标的');
      return { instrumentCode };
    }
    if (!indexCode) throw new Error('请先选择指数');
    return { indexCode };
  };

  const buildRunPayload = () => ({
    ...targetPayloadBase(),
    startDate,
    endDate,
    basePrice: basePrice ? Number(basePrice) : undefined,
    upperPct: Number(upperPct) / 100,
    lowerPct: Number(lowerPct) / 100,
    gridMode,
    gridCount: Number(gridCount),
    quantityPerGrid: Number(qtyPerGrid),
    initialCapital: Number(initialCapital),
    commissionRate: Number(commissionWan) / 10000,
    minCommission: Number(minCommission),
    slippageBps: Number(slippageBps),
    lotSize: Number(lotSize),
    applyTPlus1: applyT1,
    adaptivityIndexCode: adaptIdx || undefined,
  });

  const validateNumbers = () => {
    const nums = [upperPct, lowerPct, gridCount, qtyPerGrid, initialCapital, commissionWan, minCommission, lotSize];
    if (nums.some((x) => !Number.isFinite(Number(x)) || Number(x) <= 0)) {
      throw new Error('请检查数值参数（均需为正数）');
    }
    if (Number(basePrice) < 0) throw new Error('基准价不能为负');
    if (startDate > endDate) throw new Error('开始日期不能晚于结束日期');
  };

  const handleRun = async () => {
    setErr('');
    setNotice('');
    try {
      validateNumbers();
      const payload = buildRunPayload();
      setBusy(true);
      const res = await runGridBacktest(payload);
      setResult(res.data);
      setSuggestInfo(null);
      setTab('kline');
      refreshRuns();
    } catch (e: any) {
      setErr(e?.message || '回测失败');
    } finally {
      setBusy(false);
    }
  };

  const handleSuggest = async () => {
    setErr('');
    setNotice('');
    try {
      if (startDate > endDate) throw new Error('开始日期不能晚于结束日期');
      setBusy(true);
      const res = await suggestGridParams({
        ...targetPayloadBase(),
        startDate,
        endDate,
        initialCapital: Number(initialCapital) || undefined,
        gridCount: Number(gridCount) || undefined,
      });
      const s = res.data;
      setSuggestInfo(s);
      setUpperPct(String(s.upperPct * 100));
      setLowerPct(String(s.lowerPct * 100));
      setBasePrice(String(s.basePrice));
      setGridMode(s.gridMode);
      setGridCount(String(s.gridCount));
      setQtyPerGrid(String(s.quantityPerGrid));
      setLotSize(String(s.lotSize));
      setCommissionWan(String(s.commissionRate * 10000));
      setMinCommission(String(s.minCommission));
      setSlippageBps(String(s.slippageBps));
      setApplyT1(s.applyTPlus1);
      setNotice(
        `自动建议完成：基准 ${s.basePrice}，区间 ${fmtPct(s.upperPct, 0)} / -${fmtPct(s.lowerPct, 0)}，` +
          `年化波动 ${fmtPct(s.annualizedVolatility, 1)}，数据 ${s.coverage.firstDate} ~ ${s.coverage.lastDate}（${s.coverage.barCount} 根）`,
      );
    } catch (e: any) {
      setErr(e?.message || '参数建议失败');
    } finally {
      setBusy(false);
    }
  };

  const handleScan = async () => {
    setErr('');
    setNotice('');
    try {
      validateNumbers();
      const base = targetPayloadBase();
      let counts = scanCountsStr
        .split(/[,，\s]+/)
        .filter(Boolean)
        .map((x) => Math.round(Number(x)))
        .filter((x) => Number.isFinite(x) && x >= 1 && x <= 200);
      let pcts = scanPctsStr
        .split(/[,，\s]+/)
        .filter(Boolean)
        .map((x) => Number(x) / 100)
        .filter((x) => Number.isFinite(x) && x >= 0.001 && x <= 10);
      counts = [...new Set(counts)].slice(0, 10);
      pcts = [...new Set(pcts)].slice(0, 10);
      if (!counts.length || !pcts.length) throw new Error('请填写有效的扫描列表（每组最多10个）');
      setScanBusy(true);
      const res = await scanGridBacktest({
        ...base,
        startDate,
        endDate,
        basePrice: basePrice ? Number(basePrice) : undefined,
        gridMode,
        quantityPerGrid: Number(qtyPerGrid),
        initialCapital: Number(initialCapital),
        commissionRate: Number(commissionWan) / 10000,
        minCommission: Number(minCommission),
        slippageBps: Number(slippageBps),
        lotSize: Number(lotSize),
        applyTPlus1: applyT1,
        adaptivityIndexCode: adaptIdx || undefined,
        gridCounts: counts,
        upperPcts: pcts,
      });
      setScan(res.data);
      setNotice(`扫描完成：${counts.length}×${pcts.length}=${res.data.cells.length} 组参数，耗时 ${res.data.elapsedMs}ms`);
    } catch (e: any) {
      setErr(e?.message || '扫描失败');
    } finally {
      setScanBusy(false);
    }
  };

  const applyParamsFromRun = (data: GridRunResult) => {
    const p = data.params;
    setUpperPct(String(Math.round(Number(p.upperPct) * 10000) / 100));
    setLowerPct(String(Math.round(Number(p.lowerPct) * 10000) / 100));
    if (p.basePrice != null) setBasePrice(String(p.basePrice));
    setGridMode(p.gridMode);
    setGridCount(String(p.gridCount));
    setQtyPerGrid(String(p.quantityPerGrid));
    setInitialCapital(String(p.initialCapital));
    setCommissionWan(String(Number(p.commissionRate) * 10000));
    setMinCommission(String(p.minCommission));
    setSlippageBps(String(p.slippageBps));
    setLotSize(String(p.lotSize));
    setApplyT1(!!p.applyTPlus1);
    if (data.targetType === 'instrument' && data.instrumentCode) {
      setTargetType('instrument');
      setInstrumentCode(data.instrumentCode);
    }
    if (data.targetType === 'index' && data.indexCode) {
      setTargetType('index');
      setIndexCode(data.indexCode);
    }
    if (p.requestedStart) setStartDate(p.requestedStart);
    if (p.requestedEnd) setEndDate(p.requestedEnd);
  };

  const handleLoad = async (id: string) => {
    setErr('');
    try {
      setBusy(true);
      const res = await getGridRun(id);
      setResult(res.data);
      applyParamsFromRun(res.data);
      setTab('kline');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: any) {
      setErr(e?.message || '加载记录失败');
    } finally {
      setBusy(false);
    }
  };

  const handleCompare = async (id: string) => {
    setErr('');
    try {
      const res = await getGridRun(id);
      const d = res.data;
      setCompare({
        label: `${d.targetLabel} 对比`,
        curve: d.curve.map((p) => ({ date: p.date, equity: p.equity })),
      });
      setNotice(`已载入对比曲线：${d.targetLabel}（${d.metrics.firstDate} ~ ${d.metrics.lastDate}），已在“权益曲线”页签叠加显示`);
      setTab('equity');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: any) {
      setErr(e?.message || '加载对比记录失败');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定删除这条回测记录？')) return;
    try {
      await deleteGridRun(id);
      refreshRuns();
      if (result?.id === id) setResult(null);
      setNotice('记录已删除');
    } catch (e: any) {
      setErr(e?.message || '删除失败');
    }
  };

  // ---------------------------------------------------------- 渲染

  const m = result?.metrics;
  const posRatio = m && m.totalValue > 0 ? m.finalPositionValue / m.totalValue : 0;
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'kline', label: 'K线 + 网格' },
    { key: 'equity', label: '权益曲线' },
    { key: 'trades', label: '成交明细' },
    { key: 'adapt', label: '适配性分析' },
    { key: 'scan', label: '参数扫描' },
  ];

  return (
    <div className="p-4 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-bold text-gray-900">📐 网格交易回测</h1>
        <div className="text-xs text-gray-400">
          成交模型：日K触及网格线即按线价成交 · 当日先买后卖（保守）
        </div>
      </div>

      {err && (
        <div className="mb-3 px-4 py-2.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{err}</div>
      )}
      {notice && (
        <div className="mb-3 px-4 py-2.5 bg-blue-50 border border-blue-200 text-blue-700 text-sm rounded-lg">{notice}</div>
      )}

      <div className="flex gap-4 items-start">
        {/* ---------------- 参数面板 ---------------- */}
        <div className="w-[320px] shrink-0 bg-white rounded-xl border border-gray-200 p-4 sticky top-4">
          <div className="text-sm font-semibold text-gray-700 mb-3">回测参数</div>

          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setTargetType('instrument')}
              className={`flex-1 px-3 py-1.5 text-sm rounded-lg border ${
                targetType === 'instrument' ? 'bg-blue-50 border-blue-400 text-blue-700' : 'border-gray-300 text-gray-600'
              }`}
            >
              交易标的
            </button>
            <button
              onClick={() => setTargetType('index')}
              className={`flex-1 px-3 py-1.5 text-sm rounded-lg border ${
                targetType === 'index' ? 'bg-blue-50 border-blue-400 text-blue-700' : 'border-gray-300 text-gray-600'
              }`}
            >
              指数
            </button>
          </div>

          {targetType === 'instrument' ? (
            <Field label="标的">
              <select value={instrumentCode} onChange={(e) => setInstrumentCode(e.target.value)} className={inputCls}>
                {instruments.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.label}
                  </option>
                ))}
                {!instruments.length && <option value="">（无标的）</option>}
              </select>
            </Field>
          ) : (
            <Field label="指数">
              <select value={indexCode} onChange={(e) => setIndexCode(e.target.value)} className={inputCls}>
                {indices.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.label}
                  </option>
                ))}
                {!indices.length && <option value="">（无指数）</option>}
              </select>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Field label="开始日期">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="结束日期">
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
            </Field>
          </div>

          <Field label="基准价" hint="留空=首日收盘价">
            <input
              type="number"
              step="0.0001"
              value={basePrice}
              placeholder="自动"
              onChange={(e) => setBasePrice(e.target.value)}
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="上界 %" hint="如 15">
              <input type="number" step="0.1" value={upperPct} onChange={(e) => setUpperPct(e.target.value)} className={inputCls} />
            </Field>
            <Field label="下界 %" hint="如 15">
              <input type="number" step="0.1" value={lowerPct} onChange={(e) => setLowerPct(e.target.value)} className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="网格模式">
              <select
                value={gridMode}
                onChange={(e) => setGridMode(e.target.value as 'arithmetic' | 'geometric')}
                className={inputCls}
              >
                <option value="arithmetic">等差（固定间距）</option>
                <option value="geometric">等比（百分比间距）</option>
              </select>
            </Field>
            <Field label="网格数">
              <input type="number" min={1} max={200} value={gridCount} onChange={(e) => setGridCount(e.target.value)} className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="每格份额">
              <input type="number" min={1} step="100" value={qtyPerGrid} onChange={(e) => setQtyPerGrid(e.target.value)} className={inputCls} />
            </Field>
            <Field label="初始资金">
              <input type="number" min={1} step="1000" value={initialCapital} onChange={(e) => setInitialCapital(e.target.value)} className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="佣金(万分之)">
              <input type="number" step="0.01" min={0} value={commissionWan} onChange={(e) => setCommissionWan(e.target.value)} className={inputCls} />
            </Field>
            <Field label="最低佣金(元)">
              <input type="number" step="0.01" min={0} value={minCommission} onChange={(e) => setMinCommission(e.target.value)} className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="滑点(bp)">
              <input type="number" step="0.1" min={0} value={slippageBps} onChange={(e) => setSlippageBps(e.target.value)} className={inputCls} />
            </Field>
            <Field label="每手股数">
              <input type="number" min={1} value={lotSize} onChange={(e) => setLotSize(e.target.value)} className={inputCls} />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600 mb-3 cursor-pointer">
            <input type="checkbox" checked={applyT1} onChange={(e) => setApplyT1(e.target.checked)} className="rounded" />
            T+1（当日买入不可当日卖出）
          </label>

          <Field label="适配性参照指数" hint="可选">
            <select value={adaptIdx} onChange={(e) => setAdaptIdx(e.target.value)} className={inputCls}>
              <option value="">自动 / 不分析</option>
              {indices.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex gap-2 mt-1">
            <button
              onClick={handleSuggest}
              disabled={busy}
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              ✨ 自动建议
            </button>
            <button
              onClick={handleRun}
              disabled={busy}
              className="flex-1 px-3 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? '运行中…' : '▶ 运行回测'}
            </button>
          </div>

          {suggestInfo && (
            <div className="mt-3 text-xs text-gray-500 bg-gray-50 rounded-lg p-2.5 space-y-1">
              <div>
                建议区间：{suggestInfo.lowerPrice} ~ {suggestInfo.upperPrice}（基准 {suggestInfo.basePrice}）
              </div>
              <div>
                {suggestInfo.gridMode === 'geometric' ? '等比网格' : '等差网格'} · {suggestInfo.gridCount} 格 · 每格{' '}
                {fmtInt(suggestInfo.quantityPerGrid)} 份 · 满格约占用{' '}
                {fmtMoney(suggestInfo.gridCount * suggestInfo.quantityPerGrid * suggestInfo.basePrice)} 元
              </div>
              {suggestInfo.warnings.map((w, i) => (
                <div key={i} className="text-amber-600">
                  ⚠ {w}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ---------------- 右侧结果区 ---------------- */}
        <div className="flex-1 min-w-0 space-y-4">
          {result && (
            <>
              {(result.warnings?.length > 0 || result.barsWarning) && (
                <div className="px-4 py-2.5 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg space-y-1">
                  {result.warnings?.map((w, i) => (
                    <div key={i}>⚠ {w}</div>
                  ))}
                  {result.barsWarning && <div>⚠ {result.barsWarning}</div>}
                </div>
              )}

              {/* 指标卡 */}
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-3">
                  <Card
                    label="总收益率"
                    value={fmtPct(m?.totalReturn)}
                    sub={`总市值 ${fmtMoney(m?.totalValue)}`}
                    tone={m && m.totalReturn >= 0 ? 'pos' : 'neg'}
                  />
                  <Card label="年化收益率" value={fmtPct(m?.annualizedReturn)} tone={m && m.annualizedReturn >= 0 ? 'pos' : 'neg'} />
                  <Card label="买入持有基准" value={fmtPct(m?.benchmarkReturn)} sub="同期躺平收益" />
                  <Card
                    label="超额收益"
                    value={fmtPct(m?.excessReturn)}
                    sub={m && m.excessReturn >= 0 ? '网格跑赢持有' : '不如持有'}
                    tone={m && m.excessReturn >= 0 ? 'pos' : 'neg'}
                  />
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <Card
                    label="已实现网格利润"
                    value={fmtMoney(m?.realizedGridProfit)}
                    sub={`净利 ${fmtMoney(m?.netRealizedProfit)}`}
                    tone={m && m.realizedGridProfit >= 0 ? 'pos' : 'neg'}
                  />
                  <Card
                    label="期末浮盈"
                    value={fmtMoney(m?.unrealizedPnl)}
                    sub={`持仓成本 ${fmtMoney(m?.finalPositionCost)}`}
                    tone={m && m.unrealizedPnl >= 0 ? 'pos' : 'neg'}
                  />
                  <Card
                    label="成功配对"
                    value={`${fmtInt(m?.pairedCount)} 次`}
                    sub={`胜率 ${fmtPct(m?.winRate, 1)} · 共 ${fmtInt(m?.lotPairCount)} 笔平仓`}
                  />
                  <Card
                    label="平均单格利润"
                    value={fmtMoney(m?.avgPairProfit)}
                    sub={`平均持格 ${m?.avgHoldingDays ?? '—'} 天`}
                    tone={m && (m.avgPairProfit ?? 0) >= 0 ? 'pos' : 'neg'}
                  />
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <Card label="最大回撤" value={fmtPct(m?.maxDrawdown)} tone="neg" />
                  <Card
                    label="峰值资金占用"
                    value={fmtMoney(m?.peakCapitalUsed)}
                    sub={`占用率 ${fmtPct(m?.peakCapitalUtilization, 1)}`}
                  />
                  <Card label="破网天数" value={`${fmtInt(m?.outOfRangeDays)} 天`} sub={`占比 ${fmtPct(m?.outOfRangeRatio, 1)}`} />
                  <Card
                    label="资金不足跳过"
                    value={fmtInt(m?.cashShortfallSkips)}
                    sub={`部分成交 ${fmtInt(m?.partialFillCount)} · 同日拦截 ${fmtInt(m?.sameDayBlockedSells)}`}
                  />
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <Card label="总手续费" value={fmtMoney(m?.totalCommission)} sub="买卖合计" />
                  <Card label="换手率" value={fmtPct(m?.turnover, 1)} sub="成交额 / 初始资金" />
                  <Card label="年化波动率" value={fmtPct(m?.volatility, 1)} />
                  <Card
                    label="成交笔数"
                    value={`${fmtInt(m?.buyCount)} / ${fmtInt(m?.sellCount)}`}
                    sub="买 / 卖 · 期末仓位见权益页"
                  />
                </div>
                <div className="text-xs text-gray-400">
                  区间 {m?.firstDate} ~ {m?.lastDate}（{m?.barCount} 根日K） · 网格 {result.params.gridCount} 格{' '}
                  {result.params.gridMode === 'geometric' ? '等比' : '等差'} · 区间 {result.params.lowerPrice ?? ''}{' '}
                  {m ? `${m.lowerPrice} ~ ${m.upperPrice}` : ''} · 期末持仓 {fmtInt(m?.finalQty)} 份（仓位{' '}
                  {fmtPct(posRatio, 1)}） · 数据源 {result.dataSource || '—'}{result.elapsedMs != null && ` · 计算耗时 ${result.elapsedMs}ms`}
                </div>
              </div>
            </>
          )}

          {/* 页签 */}
          <div className="flex gap-1 border-b border-gray-200">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === t.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* K线页签 */}
          {tab === 'kline' && (
            <div className="bg-white rounded-xl border border-gray-200 p-3">
              {result?.bars ? (
                <>
                  <div ref={klineRef} className="w-full" />
                  <div className="flex gap-4 text-xs text-gray-400 mt-2 px-1">
                    <span>🟧 上下界</span>
                    <span>🟦 网格线</span>
                    <span className="text-emerald-600">▲ 买入</span>
                    <span className="text-red-600">▼ 卖出</span>
                    {result.trades.length > 2000 && <span>（标记仅显示最近 2000 笔，明细见“成交明细”）</span>}
                  </div>
                </>
              ) : (
                <div className="h-60 flex items-center justify-center text-gray-400 text-sm">
                  {result ? 'K线数据不可用（缓存已清理），请重新运行回测' : '请先运行回测'}
                </div>
              )}
            </div>
          )}

          {/* 权益曲线页签 */}
          {tab === 'equity' && (
            <div className="bg-white rounded-xl border border-gray-200 p-3">
              {result || compare ? (
                <>
                  <div ref={equityRef} className="w-full" />
                  <div className="flex items-center gap-4 text-xs text-gray-400 mt-2 px-1">
                    <span className="text-blue-600">━ 网格策略</span>
                    <span className="text-amber-500">━ 买入持有</span>
                    {compare && <span className="text-purple-600">━ {compare.label}</span>}
                    {compare && (
                      <button onClick={() => setCompare(null)} className="text-gray-400 underline">
                        清除对比
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="h-60 flex items-center justify-center text-gray-400 text-sm">请先运行回测</div>
              )}
            </div>
          )}

          {/* 成交明细页签 */}
          {tab === 'trades' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {result ? (
                result.trades.length ? (
                  <div className="overflow-auto max-h-[520px]">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr className="text-left text-xs text-gray-500">
                          <th className="px-3 py-2">日期</th>
                          <th className="px-3 py-2">方向</th>
                          <th className="px-3 py-2 text-right">价格</th>
                          <th className="px-3 py-2 text-right">数量</th>
                          <th className="px-3 py-2 text-right">金额</th>
                          <th className="px-3 py-2 text-right">佣金</th>
                          <th className="px-3 py-2 text-right">格</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.trades.map((t, i) => (
                          <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="px-3 py-1.5 text-gray-600">{t.date}</td>
                            <td className="px-3 py-1.5">
                              <span className={t.side === 'buy' ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>
                                {t.side === 'buy' ? '买入' : '卖出'}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{t.price}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{fmtInt(t.quantity)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(t.amount)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{t.commission}</td>
                            <td className="px-3 py-1.5 text-right text-gray-400">{t.level + 1}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="h-40 flex items-center justify-center text-gray-400 text-sm">该区间无成交</div>
                )
              ) : (
                <div className="h-40 flex items-center justify-center text-gray-400 text-sm">请先运行回测</div>
              )}
            </div>
          )}

          {/* 适配性分析页签 */}
          {tab === 'adapt' && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              {result ? (
                result.adaptivity?.available ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-500 shrink-0">结论：</span>
                      <span className="text-base font-semibold text-gray-900">{result.adaptivity.label}</span>
                      <span className="text-xs text-gray-400">
                        样本 {result.adaptivity.sampleDays} 天 · 覆盖率 {fmtPct(result.adaptivity.coverage, 0)}
                      </span>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1.5">回测区间趋势状态分布（复用 K线趋势分类器）</div>
                      <div className="flex h-8 rounded-lg overflow-hidden border border-gray-200">
                        {(() => {
                          const r = result.adaptivity.trendRatio!;
                          const segs = [
                            { k: '横盘', v: r.sideways, cls: 'bg-slate-400' },
                            { k: '上升', v: r.uptrend, cls: 'bg-emerald-500' },
                            { k: '下降', v: r.downtrend, cls: 'bg-red-400' },
                          ];
                          return segs.map((s) =>
                            s.v > 0 ? (
                              <div
                                key={s.k}
                                className={`${s.cls} flex items-center justify-center text-white text-xs`}
                                style={{ width: `${s.v * 100}%` }}
                                title={`${s.k} ${(s.v * 100).toFixed(1)}%`}
                              >
                                {s.v >= 0.12 ? `${s.k} ${(s.v * 100).toFixed(0)}%` : ''}
                              </div>
                            ) : null,
                          );
                        })()}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1.5">阶段位置分布（市场位置分类）</div>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(result.adaptivity.marketPositionDistribution || {}).map(([k, v]) => {
                          const names: Record<string, string> = {
                            top: '顶部区',
                            bottom: '底部区',
                            up: '上涨中段',
                            down: '下跌中段',
                            flat: '横盘中段',
                            unknown: '未知',
                          };
                          return (
                            <span key={k} className="px-2.5 py-1 bg-gray-100 rounded-full text-xs text-gray-600">
                              {names[k] || k}：{v} 天
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400">
                      说明：趋势分布来自该指数的 K线趋势分类器（kline_patterns），横盘占比越高越符合网格"赚震荡"的假设；
                      占比低说明区间内趋势主导，单边行情可能导致一侧持续建仓或踏空。
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">{result.adaptivity?.reason || '无适配性数据'}</div>
                )
              ) : (
                <div className="h-40 flex items-center justify-center text-gray-400 text-sm">请先运行回测</div>
              )}
            </div>
          )}

          {/* 参数扫描页签 */}
          {tab === 'scan' && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <div className="text-xs text-gray-500 mb-1">网格数列表（最多10个）</div>
                  <input
                    value={scanCountsStr}
                    onChange={(e) => setScanCountsStr(e.target.value)}
                    className={`${inputCls} w-56`}
                    placeholder="5,10,15,20"
                  />
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">上界%列表（下界对称，最多10个）</div>
                  <input
                    value={scanPctsStr}
                    onChange={(e) => setScanPctsStr(e.target.value)}
                    className={`${inputCls} w-56`}
                    placeholder="5,10,15,20"
                  />
                </div>
                <button
                  onClick={handleScan}
                  disabled={scanBusy}
                  className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {scanBusy ? '扫描中…' : '▦ 运行扫描'}
                </button>
                <span className="text-xs text-gray-400">用当前参数面板的标的/区间/资金/每格份额</span>
              </div>

              {scan && (
                <>
                  <div className="text-sm text-gray-600">
                    共 {scan.cells.length} 组 · {scan.barCount} 根日K · 耗时 {scan.elapsedMs}ms ·
                    {scan.best && (
                      <span className="ml-2 text-emerald-600 font-medium">
                        最优：{scan.best.gridCount} 格 ±{(scan.best.upperPct * 100).toFixed(0)}% →{' '}
                        {fmtPct(scan.best.totalReturn)}（超额 {fmtPct(scan.best.excessReturn)}）
                      </span>
                    )}
                  </div>
                  <div className="overflow-auto">
                    <table className="text-sm border-collapse">
                      <thead>
                        <tr>
                          <th className="px-3 py-2 text-xs text-gray-500 text-left bg-gray-50 rounded-l-lg">网格数 \ 上界%</th>
                          {scan.upperPcts.map((p) => (
                            <th key={p} className="px-3 py-2 text-xs text-gray-500 text-center bg-gray-50">
                              ±{(p * 100).toFixed(0)}%
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {scan.gridCounts.map((g) => (
                          <tr key={g}>
                            <td className="px-3 py-1.5 text-xs text-gray-600 bg-gray-50">{g} 格</td>
                            {scan.upperPcts.map((p) => {
                              const cell = scan.cells.find((c) => c.gridCount === g && Math.abs(c.upperPct - p) < 1e-9);
                              if (!cell) return <td key={p} className="px-3 py-1.5" />;
                              const maxAbs = Math.max(...scan.cells.map((c) => Math.abs(c.totalReturn)), 0.01);
                              const alpha = Math.min(0.85, 0.12 + (Math.abs(cell.totalReturn) / maxAbs) * 0.7);
                              const bg =
                                cell.totalReturn >= 0 ? `rgba(16,185,129,${alpha})` : `rgba(239,68,68,${alpha})`;
                              const isBest =
                                scan.best &&
                                scan.best.gridCount === cell.gridCount &&
                                Math.abs(scan.best.upperPct - cell.upperPct) < 1e-9;
                              return (
                                <td key={p} className="p-0.5">
                                  <button
                                    onClick={() => {
                                      setGridCount(String(cell.gridCount));
                                      setUpperPct(String(Math.round(cell.upperPct * 10000) / 100));
                                      setLowerPct(String(Math.round(cell.lowerPct * 10000) / 100));
                                      setNotice(
                                        `已填入参数：${cell.gridCount} 格 ±${(cell.upperPct * 100).toFixed(1)}%，点击“运行回测”查看完整结果`,
                                      );
                                    }}
                                    title={`收益 ${fmtPct(cell.totalReturn)} · 回撤 ${fmtPct(
                                      cell.maxDrawdown,
                                    )} · 超额 ${fmtPct(cell.excessReturn)} · 配对 ${cell.pairedCount}（点击填入参数）`}
                                    className={`w-full px-3 py-2 rounded text-xs font-medium ${
                                      alpha > 0.45 ? 'text-white' : 'text-gray-800'
                                    } ${isBest ? 'ring-2 ring-blue-600' : ''}`}
                                    style={{ background: bg }}
                                  >
                                    {fmtPct(cell.totalReturn, 1)}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="text-xs text-gray-400">单元格 = 总收益率；绿=正红=负，蓝框=最优。点击单元格把参数填入左侧面板。</div>
                </>
              )}
              {!scan && <div className="h-32 flex items-center justify-center text-gray-400 text-sm">设置列表后点击“运行扫描”</div>}
            </div>
          )}
        </div>
      </div>

      {/* ---------------- 历史记录 ---------------- */}
      <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-700">历史回测记录</div>
          <button onClick={refreshRuns} className="text-xs text-gray-400 hover:text-gray-600">
            刷新
          </button>
        </div>
        {runs.length ? (
          <div className="overflow-auto max-h-[420px]">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-left text-xs text-gray-500">
                  <th className="px-3 py-2">时间</th>
                  <th className="px-3 py-2">目标</th>
                  <th className="px-3 py-2">区间</th>
                  <th className="px-3 py-2">参数</th>
                  <th className="px-3 py-2 text-right">总收益</th>
                  <th className="px-3 py-2 text-right">超额</th>
                  <th className="px-3 py-2 text-right">回撤</th>
                  <th className="px-3 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleString('zh-CN', { hour12: false })}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="text-gray-800">{r.targetLabel}</span>
                      <span className="ml-1.5 text-xs text-gray-400">{r.targetType === 'index' ? '指数' : '标的'}</span>
                    </td>
                    <td className="px-3 py-1.5 text-xs text-gray-500 whitespace-nowrap">
                      {r.params?.startDate} ~ {r.params?.endDate}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-gray-500 whitespace-nowrap">
                      {r.params?.gridCount}格 · ±{Math.round(Number(r.params?.upperPct) * 100)}% · 每格{' '}
                      {fmtInt(r.params?.quantityPerGrid)} · {fmtMoney(r.params?.initialCapital)}元
                    </td>
                    <td
                      className={`px-3 py-1.5 text-right font-medium ${
                        (r.metrics?.totalReturn ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {fmtPct(r.metrics?.totalReturn)}
                    </td>
                    <td className="px-3 py-1.5 text-right text-gray-600">{fmtPct(r.metrics?.excessReturn)}</td>
                    <td className="px-3 py-1.5 text-right text-red-500">{fmtPct(r.metrics?.maxDrawdown)}</td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                      <button onClick={() => handleLoad(r.id)} className="text-blue-600 hover:underline text-xs mr-2">
                        加载
                      </button>
                      <button onClick={() => handleCompare(r.id)} className="text-purple-600 hover:underline text-xs mr-2">
                        对比
                      </button>
                      <button onClick={() => handleDelete(r.id)} className="text-red-500 hover:underline text-xs">
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="h-24 flex items-center justify-center text-gray-400 text-sm">暂无记录，运行第一次回测吧</div>
        )}
      </div>
    </div>
  );
}

export function GridBacktest() {
  return (
    <GridErrorBoundary>
      <GridBacktestInner />
    </GridErrorBoundary>
  );
}
