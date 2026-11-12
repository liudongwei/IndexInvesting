/**
 * 网格回测引擎（纯计算，无 IO）
 *
 * 成交模型（行业标准"触及即按线价成交"，日K OHLC 近似日内实时触发）：
 * - 买单线 L：当日最低价 ≤ L 且该格已"布防"且无持仓 → 按 L×(1+滑点) 买入（限价单触及成交）
 *   布防规则：基准价下方（含）的买线开局即挂单；基准价上方的买线需等价格从上方穿越后才生效
 *   （现实网格不会在市价上方挂买单，否则首日会按溢价建仓）
 * - 卖单线 S：当日最高价 ≥ S 且该格有前日持仓 → 按 S×(1-滑点) 卖出（卖单自买入成交后即已挂出）
 * - 当日先处理全部买单、再处理卖单（保守：买入只用自有现金）
 * - T+1（或默认保守策略）：当日买入的份额当日不可卖出
 * - 跳空穿越多条网格线 → 每条线各自独立成交（等价于逐格全部成交）
 * - 现金不足 → 能买几手买几手，一手都买不起则跳过并计数
 */

export type GridMode = 'arithmetic' | 'geometric';

export interface EngineBar {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface EngineParams {
  basePrice: number;
  upperPct: number; // 上界相对 base 的上偏比例，如 0.15
  lowerPct: number; // 下界相对 base 的下偏比例，如 0.15
  gridMode: GridMode;
  gridCount: number;
  quantityPerGrid: number; // 每格买入份额（整手）
  initialCapital: number;
  commissionRate: number;
  minCommission: number;
  slippageBps: number;
  lotSize: number;
  applyTPlus1: boolean; // true=当日买入不可当日卖出（T+1 / 保守默认）
}

export interface GridTrade {
  date: string;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  amount: number;
  commission: number;
  level: number; // 格索引（买线 = levels[i]，卖线 = levels[i+1]）
}

export interface EquityPoint {
  date: string;
  equity: number;
  cash: number;
  positionValue: number;
  benchmark: number; // 买入持有基准（首日收盘价全额投入）
}

export interface EngineMetrics {
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
  realizedGridProfit: number; // 已实现网格毛利润（价差合计）
  netRealizedProfit: number; // 已实现净利（价差 - 平仓买卖佣金）
  unrealizedPnl: number; // 期末浮盈（市值 - 成本）
  totalCommission: number;
  buyCount: number;
  sellCount: number;
  pairedCount: number; // 卖出事件数
  lotPairCount: number; // 平仓切片数（胜率统计口径）
  winRate: number | null;
  avgPairProfit: number | null;
  avgHoldingDays: number | null;
  cashShortfallSkips: number;
  partialFillCount: number;
  sameDayBlockedSells: number;
  outOfRangeDays: number;
  outOfRangeRatio: number;
  turnover: number;
  volatility: number; // 年化波动率
  finalCash: number;
  finalQty: number;
  finalPositionValue: number;
  finalPositionCost: number;
}

export interface EngineResult {
  levels: number[];
  trades: GridTrade[];
  curve: EquityPoint[];
  metrics: EngineMetrics;
}

interface Lot {
  qty: number;
  price: number;
  commission: number;
  date: string;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const r4 = (x: number) => Math.round(x * 10000) / 10000;

function commissionOf(amount: number, rate: number, min: number): number {
  return Math.max(amount * rate, min);
}

/** 构造升序网格线：levels[0]=下界 … levels[N]=上界；买线 levels[i]，卖线 levels[i+1] */
export function buildLevels(p: EngineParams): number[] {
  const upper = p.basePrice * (1 + p.upperPct);
  const lower = p.basePrice * (1 - p.lowerPct);
  const n = p.gridCount;
  const levels: number[] = [];
  if (p.gridMode === 'arithmetic') {
    const step = (upper - lower) / n;
    for (let i = 0; i <= n; i++) levels.push(lower + step * i);
  } else {
    const ratio = Math.pow(upper / lower, 1 / n);
    for (let i = 0; i <= n; i++) levels.push(lower * Math.pow(ratio, i));
  }
  return levels;
}

export function runGridEngine(bars: EngineBar[], rawParams: EngineParams): EngineResult {
  const p = { ...rawParams };
  // 整手化
  if (p.quantityPerGrid >= p.lotSize) {
    p.quantityPerGrid = Math.floor(p.quantityPerGrid / p.lotSize) * p.lotSize;
  } else {
    p.quantityPerGrid = p.lotSize;
  }

  const levels = buildLevels(p);
  const n = p.gridCount;
  const slots: Lot[][] = Array.from({ length: n }, () => []);
  // 买线布防：≤ 基准价的买线开局挂单；> 基准价的买线等价格从上方穿越后才生效
  const armed = levels.map((L) => L <= p.basePrice);
  let prevClose: number = p.basePrice;
  let cash = p.initialCapital;

  const trades: GridTrade[] = [];
  const curve: EquityPoint[] = [];

  let buyCount = 0;
  let sellCount = 0;
  let partialFillCount = 0;
  let cashShortfallSkips = 0;
  let sameDayBlockedSells = 0;
  let realizedGross = 0;
  let totalCommission = 0;
  let closedBuyCommission = 0;
  let sellCommissionTotal = 0;
  let totalTradedAmount = 0;
  let lotTotal = 0;
  let lotWin = 0;
  let lotProfitSum = 0;
  let holdingDaysSum = 0;

  let peakEquity = -Infinity;
  let maxDrawdown = 0;
  let peakCapitalUsed = 0;

  const slipMul = p.slippageBps / 10000;
  const firstClose = bars[0].close;
  let outOfRangeDays = 0;
  const lowerBound = p.basePrice * (1 - p.lowerPct);
  const upperBound = p.basePrice * (1 + p.upperPct);
  const rets: number[] = [];

  for (let b = 0; b < bars.length; b++) {
    const bar = bars[b];
    const { low, high, close } = bar;

    // 布防更新：本日价格从上方穿越买线（开盘/昨收 ≥ 线 ≥ 最低）→ 该买线生效
    const crossHigh = Math.max(bar.open, prevClose);
    for (let i = 0; i < levels.length; i++) {
      if (!armed[i] && crossHigh >= levels[i] && low <= levels[i]) armed[i] = true;
    }

    // ---------- 1) 买单（先买后卖，保守）----------
    for (let i = n - 1; i >= 0; i--) {
      if (!armed[i]) continue; // 未布防（价格尚未从上方穿越）
      if (slots[i].length > 0) continue; // 该格已持仓（占用），不重复建仓
      const line = levels[i];
      if (low > line) continue; // 当日未触及
      const price = r4(line * (1 + slipMul));
      if (price <= 0) continue;

      let qty = p.quantityPerGrid;
      const maxByPrice = Math.floor(cash / (price * (1 + p.commissionRate)) / p.lotSize) * p.lotSize;
      if (qty > maxByPrice) qty = maxByPrice;
      while (qty >= p.lotSize) {
        const amount = qty * price;
        const comm = commissionOf(amount, p.commissionRate, p.minCommission);
        if (amount + comm <= cash + 1e-9) break;
        qty -= p.lotSize;
      }
      if (qty < p.lotSize) {
        cashShortfallSkips++;
        continue;
      }
      const amount = qty * price;
      const comm = commissionOf(amount, p.commissionRate, p.minCommission);
      cash -= amount + comm;
      slots[i].push({ qty, price, commission: comm, date: bar.date });
      totalCommission += comm;
      totalTradedAmount += amount;
      buyCount++;
      if (qty < p.quantityPerGrid) partialFillCount++;
      trades.push({ date: bar.date, side: 'buy', price, quantity: qty, amount: r2(amount), commission: r2(comm), level: i });
    }

    // ---------- 2) 卖单（只用非当日买入的持仓）----------
    for (let i = 0; i < n; i++) {
      if (slots[i].length === 0) continue;
      const line = levels[i + 1];
      if (high < line) continue; // 当日未触及卖线
      const price = r4(line * (1 - slipMul));
      if (price <= 0) continue;

      const sellable = p.applyTPlus1 ? slots[i].filter((l) => l.date !== bar.date) : slots[i];
      if (sellable.length === 0) {
        sameDayBlockedSells++;
        continue;
      }
      let remaining = p.quantityPerGrid;
      const slices: { lot: Lot; qty: number }[] = [];
      for (const lot of sellable) {
        if (remaining <= 0) break;
        const q = Math.min(lot.qty, remaining);
        if (q <= 0) continue;
        slices.push({ lot, qty: q });
        remaining -= q;
      }
      if (slices.length === 0) {
        sameDayBlockedSells++;
        continue;
      }

      let soldQty = 0;
      let soldAmount = 0;
      let soldBuyComm = 0;
      let soldGross = 0;
      for (const s of slices) {
        const frac = s.qty / s.lot.qty;
        soldQty += s.qty;
        soldAmount += s.qty * price;
        soldBuyComm += s.lot.commission * frac;
        soldGross += s.qty * (price - s.lot.price);
      }
      const sellComm = commissionOf(soldAmount, p.commissionRate, p.minCommission);

      // 逐笔平仓统计（必须在移除份额之前：此后 lot.qty 会被扣减，晚算会除零出 NaN）
      for (const s of slices) {
        const frac = s.qty / soldQty;
        const net = s.qty * (price - s.lot.price) - s.lot.commission * (s.qty / s.lot.qty) - sellComm * frac;
        lotTotal++;
        lotProfitSum += net;
        if (net > 0) lotWin++;
        holdingDaysSum += (Date.parse(bar.date) - Date.parse(s.lot.date)) / 86400000;
      }

      // 从槽位移除已卖份额（FIFO，保留当日买入部分）
      let need = soldQty;
      const kept: Lot[] = [];
      for (const lot of slots[i]) {
        if (need <= 0) {
          kept.push(lot);
          continue;
        }
        if (p.applyTPlus1 && lot.date === bar.date) {
          kept.push(lot);
          continue;
        }
        const take = Math.min(lot.qty, need);
        lot.qty -= take;
        need -= take;
        if (lot.qty > 1e-9) kept.push(lot);
      }
      slots[i] = kept;

      cash += soldAmount - sellComm;
      totalCommission += sellComm;
      sellCommissionTotal += sellComm;
      closedBuyCommission += soldBuyComm;
      realizedGross += soldGross;
      totalTradedAmount += soldAmount;
      sellCount++;

      trades.push({
        date: bar.date,
        side: 'sell',
        price,
        quantity: soldQty,
        amount: r2(soldAmount),
        commission: r2(sellComm),
        level: i,
      });
    }

    // ---------- 3) 日终快照 ----------
    let positionValue = 0;
    let positionCost = 0;
    for (const lots of slots) {
      for (const lot of lots) {
        positionValue += lot.qty * close;
        positionCost += lot.qty * lot.price;
      }
    }
    const equity = cash + positionValue;
    if (equity > peakEquity) peakEquity = equity;
    if (peakEquity > 0) {
      const dd = (peakEquity - equity) / peakEquity;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }
    if (positionCost > peakCapitalUsed) peakCapitalUsed = positionCost;
    if (close < lowerBound || close > upperBound) outOfRangeDays++;
    if (b > 0 && bars[b - 1].close > 0) rets.push(close / bars[b - 1].close - 1);

    curve.push({
      date: bar.date,
      equity: r2(equity),
      cash: r2(cash),
      positionValue: r2(positionValue),
      benchmark: r2((p.initialCapital * close) / firstClose),
    });
    prevClose = close;
  }

  // ---------- 指标汇总 ----------
  const last = bars[bars.length - 1];
  const finalPoint = curve[curve.length - 1];
  const totalValue = finalPoint.equity;
  const totalReturn = totalValue / p.initialCapital - 1;
  const years = bars.length / 252;
  const annualizedReturn = years > 0 && totalReturn > -1 ? Math.pow(1 + totalReturn, 1 / years) - 1 : totalReturn;
  const benchmarkReturn = last.close / firstClose - 1;
  const retCount = rets.length;
  const mean = retCount > 0 ? rets.reduce((a, r) => a + r, 0) / retCount : 0;
  const variance = retCount > 1 ? rets.reduce((a, r) => a + (r - mean) * (r - mean), 0) / (retCount - 1) : 0;
  const volatility = Math.sqrt(variance) * Math.sqrt(252);
  const finalCost = slots.reduce((a, lots) => a + lots.reduce((b, l) => b + l.qty * l.price, 0), 0);
  const finalQty = Math.round(slots.reduce((a, lots) => a + lots.reduce((b, l) => b + l.qty, 0), 0));

  const metrics: EngineMetrics = {
    firstDate: bars[0].date,
    lastDate: last.date,
    barCount: bars.length,
    basePrice: r4(p.basePrice),
    lowerPrice: r4(lowerBound),
    upperPrice: r4(upperBound),
    initialCapital: r2(p.initialCapital),
    totalValue,
    totalReturn: r4(totalReturn),
    annualizedReturn: r4(annualizedReturn),
    benchmarkReturn: r4(benchmarkReturn),
    excessReturn: r4(totalReturn - benchmarkReturn),
    maxDrawdown: r4(maxDrawdown),
    peakCapitalUsed: r2(peakCapitalUsed),
    peakCapitalUtilization: r4(p.initialCapital > 0 ? peakCapitalUsed / p.initialCapital : 0),
    realizedGridProfit: r2(realizedGross),
    netRealizedProfit: r2(realizedGross - closedBuyCommission - sellCommissionTotal),
    unrealizedPnl: r2(finalPoint.positionValue - finalCost),
    totalCommission: r2(totalCommission),
    buyCount,
    sellCount,
    pairedCount: sellCount,
    lotPairCount: lotTotal,
    winRate: lotTotal > 0 ? r4(lotWin / lotTotal) : null,
    avgPairProfit: lotTotal > 0 ? r2(lotProfitSum / lotTotal) : null,
    avgHoldingDays: lotTotal > 0 ? r2(holdingDaysSum / lotTotal) : null,
    cashShortfallSkips,
    partialFillCount,
    sameDayBlockedSells,
    outOfRangeDays,
    outOfRangeRatio: r4(outOfRangeDays / bars.length),
    turnover: r4(p.initialCapital > 0 ? totalTradedAmount / p.initialCapital : 0),
    volatility: r4(volatility),
    finalCash: r2(cash),
    finalQty,
    finalPositionValue: r2(finalPoint.positionValue),
    finalPositionCost: r2(finalCost),
  };

  return { levels: levels.map(r4), trades, curve, metrics };
}
