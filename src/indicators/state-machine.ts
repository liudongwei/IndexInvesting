/**
 * 10 态状态机 —— 判定优先级自上而下,命中即停。钉死:references/technical-indicators-spec.md §2/§3。
 * MA 值从 moving_averages 表读取(单一来源,r2 舍入口径);
 * 阶段位置读 kline_patterns 该指数对应日期记录,无记录视为缺失(不阻断)。
 *
 * 实现口径说明(规格未逐字钉死处,在检查点报告披露):
 * - 背离"成立"窗口:信号日(波峰 p2 日)起 10 个交易日内视为活跃背离;
 * - P3 "MACD 死叉后":最近 5 个交易日内发生过死叉,且当日 DIF<0;
 * - P4 "MACD 金叉(近 5 日内)":最近 5 个交易日内发生过金叉;
 * - P6 "无背离":无活跃背离(顶或底);
 * - P7 "RSI 前一日≤10% 分位且今日已回升":前一日 RSI 处于近 120 日 ≤10% 分位,且今日 RSI 值大于前一日。
 */
import { IndicatorSeries } from './indicator-calculator';
import { DetectedSignal } from './signal-detector';

export interface StateResult {
  stateKey: string;
  label: string;
  basis: string[];
}

export interface MaRowLite {
  date: string;
  ma20: number | null;
  ma60: number | null;
}

export const STATE_LABELS: Record<string, string> = {
  trendHealthy: '① 趋势健康',
  topWarning: '② 顶部预警',
  trendStart: '③ 趋势启动',
  rangebound: '④ 震荡市',
  bottomZone: '⑤ 底部区域',
  bearWeak: '⑥ 空头弱势',
  bullPullback: '⑦ 多头回调',
  bearRebound: '⑧ 空头反弹',
  breakdownConfirmed: '⑨ 破位确认',
  wait: '⑩ 观望',
};

const DIVERGENCE_ACTIVE_WINDOW = 10; // 交易日
const CROSS_RECENT_WINDOW = 5; // 交易日
const r4 = (v: number) => Number(v.toFixed(4));
const r2 = (v: number) => Number(v.toFixed(2));

export function classifyAll(
  s: IndicatorSeries,
  maRows: Map<string, MaRowLite>,
  marketPositionByDate: Map<string, string>,
  signals: DetectedSignal[],
): StateResult[] {
  const n = s.dates.length;

  // 背离活跃索引集:信号日(波峰 p2 日)起 10 个交易日内视为活跃背离
  const topDivActive = new Array<boolean>(n).fill(false);
  const topDivSource = new Array<string | null>(n).fill(null);
  const anyDivActive = new Array<boolean>(n).fill(false);
  const deathCrossRecent = new Array<boolean>(n).fill(false);
  const goldenCrossRecent = new Array<boolean>(n).fill(false);
  const markActive = (arr: boolean[], date: string, source?: (string | null)[]) => {
    const idx = s.dates.indexOf(date);
    if (idx < 0) return;
    for (let t = idx; t < Math.min(n, idx + DIVERGENCE_ACTIVE_WINDOW); t++) {
      arr[t] = true;
      if (source && source[t] === null) source[t] = date;
    }
  };
  const markRecent = (arr: boolean[], date: string) => {
    const idx = s.dates.indexOf(date);
    if (idx < 0) return;
    for (let t = idx; t < Math.min(n, idx + CROSS_RECENT_WINDOW); t++) arr[t] = true;
  };
  for (const sig of signals) {
    if (sig.type === 'macdTopDivergence' || sig.type === 'obvTopDivergence') markActive(topDivActive, sig.date, topDivSource);
    if (sig.type.endsWith('Divergence')) markActive(anyDivActive, sig.date);
    if (sig.type === 'macdDeathCross') markRecent(deathCrossRecent, sig.date);
    if (sig.type === 'macdGoldenCross') markRecent(goldenCrossRecent, sig.date);
  }

  const results: StateResult[] = [];
  for (let i = 0; i < n; i++) {
    results.push(classifyDay(s, maRows, marketPositionByDate, i, topDivActive[i], topDivSource[i], anyDivActive[i], deathCrossRecent[i], goldenCrossRecent[i]));
  }
  return results;
}

function classifyDay(
  s: IndicatorSeries,
  maRows: Map<string, MaRowLite>,
  marketPositionByDate: Map<string, string>,
  i: number,
  topDivActive: boolean,
  topDivSourceDate: string | null,
  anyDivActive: boolean,
  deathCrossRecent: boolean,
  goldenCrossRecent: boolean,
): StateResult {
  const date = s.dates[i];
  const close = s.closes[i];
  const ma = maRows.get(date);
  const ma20 = ma?.ma20 ?? null;
  const ma60 = ma?.ma60 ?? null;
  const dif = s.dif[i];
  const adx = s.adx[i];
  const adxPrev = i > 0 ? s.adx[i - 1] : null;
  const rsi = s.rsi[i];
  const rsiPrev = i > 0 ? s.rsi[i - 1] : null;
  const cmf = s.cmf[i];
  const cmfPrev = i > 0 ? s.cmf[i - 1] : null;
  const vr = s.volumeRatio[i];
  const obv = s.obv[i];
  const obvEma = s.obvEma20[i];
  const bollLower = s.bollLower[i];
  const position = marketPositionByDate.get(date) ?? null; // 缺失=不阻断

  const label = (key: string) => STATE_LABELS[key] ?? key;

  // ---- P0 观望:close 序列 <60 根,或 MA60/MACD 关键值缺失 ----
  const missing: string[] = [];
  if (i < 59) missing.push(`K线仅 ${i + 1} 根(<60)`);
  if (ma60 === null) missing.push('MA60 缺失');
  if (dif === null) missing.push('MACD DIF 缺失');
  if (missing.length > 0) {
    const key = 'wait';
    return { stateKey: key, label: label(key), basis: [`关键数据不足,无法判定状态:${missing.join('、')}`] };
  }

  const ma60Trend = ma60TrendOf(s, maRows, i); // 'up' | 'down' | 'flat'

  // ---- P1 ② 顶部预警:MACD 或 OBV 顶背离成立 ----
  if (topDivActive) {
    const key = 'topWarning';
    return {
      stateKey: key,
      label: label(key),
      basis: [`${date} 处于顶背离活跃期(背离信号日 ${topDivSourceDate ?? '?'} 起算,10 个交易日内有效,详见信号表)`],
    };
  }

  // ---- P2 ⑤ 底部区域:(RSI 低分位 或(触/破 BOLL 下轨 且 CMF 止跌转正)) 且 阶段位置≠top ----
  if (position !== 'top') {
    const rsiInfo = rsiPercentileAt(s, i);
    const rsiLow = rsiInfo.percentile !== null && rsiInfo.percentile <= 0.1;
    const touchLower = bollLower !== null && close <= bollLower;
    const cmfTurnPositive = cmf !== null && cmfPrev !== null && cmfPrev < 0 && cmf >= 0;
    const cmfRising3 =
      cmf !== null && i >= 3 && s.cmf[i - 1] !== null && s.cmf[i - 2] !== null && s.cmf[i - 3] !== null &&
      (cmf as number) > (s.cmf[i - 1] as number) && (s.cmf[i - 1] as number) > (s.cmf[i - 2] as number) && (s.cmf[i - 2] as number) > (s.cmf[i - 3] as number);
    const cmfStablize = touchLower && (cmfTurnPositive || cmfRising3);
    if (rsiLow || cmfStablize) {
      const key = 'bottomZone';
      const why: string[] = [];
      if (rsiLow) why.push(`RSI ${r2(rsi as number)} 处于近120日${rsiInfo.usedFullSample ? `全部可用样本(${rsiInfo.sampleCount}日)` : ''} ${((rsiInfo.percentile as number) * 100).toFixed(1)}% 分位(≤10%)`);
      if (cmfStablize) why.push(`收盘 ${r2(close)} 触/破 BOLL 下轨 ${r2(bollLower as number)},且 CMF${cmfTurnPositive ? '由负转正' : '连续3日抬升'}(${r4(cmf as number)})`);
      if (position === null) why.push('阶段位置无记录(视为缺失,不阻断)');
      return { stateKey: key, label: label(key), basis: why };
    }
  }

  // ---- P3 ⑨ 破位确认:收盘<MA60 且 MA60 非上行 且 MACD 死叉后 DIF<0 且 量比≥1.5 ----
  if (ma60 !== null && close < ma60 && ma60Trend !== 'up' && deathCrossRecent && dif !== null && (dif as number) < 0 && vr !== null && (vr as number) >= 1.5) {
    const key = 'breakdownConfirmed';
    return {
      stateKey: key,
      label: label(key),
      basis: [
        `收盘 ${r2(close)} < MA60 ${r2(ma60)} 且 MA60 非上行`,
        `近5个交易日内 MACD 死叉,当日 DIF ${r4(dif as number)} < 0`,
        `放量:量比 ${r4(vr)} ≥ 1.5(破位日 ${date})`,
      ],
    };
  }

  // ---- P4 ③ 趋势启动:ADX 前一日<25 且今日≥25 且 MACD 金叉(近 5 日内)且 收盘>MA20 且 量比≥1.5 ----
  if (
    adx !== null && adxPrev !== null && (adxPrev as number) < 25 && (adx as number) >= 25 &&
    goldenCrossRecent && ma20 !== null && close > ma20 && vr !== null && (vr as number) >= 1.5
  ) {
    const key = 'trendStart';
    return {
      stateKey: key,
      label: label(key),
      basis: [
        `ADX 自 ${r4(adxPrev as number)} 升至 ${r4(adx as number)}(≥25,趋势强度确认)`,
        `近5个交易日内 MACD 金叉`,
        `收盘 ${r2(close)} > MA20 ${r2(ma20)},量比 ${r4(vr)} ≥ 1.5`,
      ],
    };
  }

  // ---- P5 ⑥ 空头弱势:收盘<MA60 且 MA60 下行 且 DIF<0 ----
  if (ma60 !== null && close < ma60 && ma60Trend === 'down' && dif !== null && (dif as number) < 0) {
    const key = 'bearWeak';
    return {
      stateKey: key,
      label: label(key),
      basis: [`收盘 ${r2(close)} < MA60 ${r2(ma60)}(下行),DIF ${r4(dif as number)} < 0,空头趋势`],
    };
  }

  // ---- P6 ⑦ 多头回调:收盘<MA20 且 MA60 上行 且 DIF>0 且 量比<1.5 且 无背离 ----
  if (ma20 !== null && close < ma20 && ma60Trend === 'up' && dif !== null && (dif as number) > 0 && vr !== null && (vr as number) < 1.5 && !anyDivActive) {
    const depth = ((close - (ma20 as number)) / (ma20 as number)) * 100;
    const key = 'bullPullback';
    return {
      stateKey: key,
      label: label(key),
      basis: [
        `收盘 ${r2(close)} 回踩 MA20 ${r2(ma20)}(距 MA20 ${r4(depth)}%),MA60 上行,DIF ${r4(dif as number)} > 0`,
        `量比 ${r4(vr)} < 1.5,缩量回调特征,无活跃背离`,
      ],
    };
  }

  // ---- P7 ⑧ 空头反弹:MA60 下行 且 收盘<MA60 且 RSI 前一日≤10% 分位且今日已回升 且 量比≥1.2 ----
  if (ma60Trend === 'down' && ma60 !== null && close < ma60 && vr !== null && (vr as number) >= 1.2 && rsi !== null && rsiPrev !== null) {
    const prevInfo = rsiPercentileAt(s, i - 1);
    const prevLow = prevInfo.percentile !== null && prevInfo.percentile <= 0.1;
    if (prevLow && (rsi as number) > (rsiPrev as number)) {
      const key = 'bearRebound';
      return {
        stateKey: key,
        label: label(key),
        basis: [
          `MA60 ${r2(ma60)} 下行且收盘 ${r2(close)} 位于其下`,
          `RSI 前日 ${r2(rsiPrev as number)} 处于近120日${prevInfo.usedFullSample ? `全部可用样本(${prevInfo.sampleCount}日)` : ''} ${((prevInfo.percentile as number) * 100).toFixed(1)}% 分位(超卖),今日回升至 ${r2(rsi as number)}`,
          `量比 ${r4(vr)} ≥ 1.2`,
        ],
      };
    }
  }

  // ---- P8 ① 趋势健康:收盘>MA20>MA60 且 MA60 上行 且 DIF>0 且 ADX>25 且 OBV>EMA20(OBV) ----
  if (
    ma20 !== null && ma60 !== null && close > ma20 && ma20 > ma60 && ma60Trend === 'up' &&
    dif !== null && (dif as number) > 0 && adx !== null && (adx as number) > 25 &&
    obv !== null && obvEma !== null && (obv as number) > (obvEma as number)
  ) {
    const key = 'trendHealthy';
    return {
      stateKey: key,
      label: label(key),
      basis: [
        `收盘 ${r2(close)} > MA20 ${r2(ma20)} > MA60 ${r2(ma60)},MA60 上行`,
        `MACD DIF ${r4(dif as number)} 在零轴上方,ADX ${r4(adx as number)} > 25`,
        `OBV 高于其 20 日 EMA`,
      ],
    };
  }

  // ---- P9 ④ 震荡市:ADX<20 ----
  if (adx !== null && (adx as number) < 20) {
    const key = 'rangebound';
    return {
      stateKey: key,
      label: label(key),
      basis: [`ADX ${r4(adx as number)} < 20,趋势强度不足,判定为震荡市(趋势信号停用)`],
    };
  }

  // ---- P10 ⑩ 观望 兜底 ----
  const key = 'wait';
  const contradictions: string[] = [];
  if (ma60Trend === 'flat') contradictions.push('MA60 走平');
  if (dif !== null && (dif as number) > 0 && ma60 !== null && close < ma60) contradictions.push('DIF>0 但收盘低于 MA60');
  if (adx !== null && (adx as number) >= 20 && (adx as number) <= 25) contradictions.push(`ADX ${r4(adx as number)} 在 20~25 之间,趋势强度暧昧`);
  return {
    stateKey: key,
    label: label(key),
    basis: [contradictions.length > 0 ? `条件矛盾或不满足全部判定:${contradictions.join(';')}` : '其余状态条件均不满足,进入观望'],
  };
}

/** MA60 上行定义:MA60(t) > MA60(t−5);下行反之;平坦=差值绝对值<0.1%(钉死) */
export function ma60TrendOf(s: IndicatorSeries, maRows: Map<string, MaRowLite>, i: number): 'up' | 'down' | 'flat' | 'unknown' {
  const cur = maRows.get(s.dates[i])?.ma60 ?? null;
  const prev = i >= 5 ? maRows.get(s.dates[i - 5])?.ma60 ?? null : null;
  if (cur === null || prev === null || prev === 0) return 'unknown';
  const diffPct = ((cur - prev) / prev) * 100;
  if (Math.abs(diffPct) < 0.1) return 'flat';
  return diffPct > 0 ? 'up' : 'down';
}

/** RSI 分位判定(近 120 日,样本<120 用全部可用并标注) */
function rsiPercentileAt(s: IndicatorSeries, i: number): { percentile: number | null; usedFullSample: boolean; sampleCount: number } {
  const cur = s.rsi[i];
  if (cur === null) return { percentile: null, usedFullSample: false, sampleCount: 0 };
  const start = Math.max(0, i - 119);
  const sample: number[] = [];
  for (let j = start; j <= i; j++) {
    const v = s.rsi[j];
    if (v !== null) sample.push(v);
  }
  if (sample.length === 0) return { percentile: null, usedFullSample: false, sampleCount: 0 };
  const usedFullSample = sample.length < 120;
  sample.sort((a, b) => a - b);
  let cnt = 0;
  for (const v of sample) if (v <= cur) cnt++;
  return { percentile: cnt / sample.length, usedFullSample, sampleCount: sample.length };
}

