/**
 * 信号检测 —— 定义钉死:references/technical-indicators-spec.md §2。
 * 输出稀疏信号列表(仅信号日),每条含 type/direction/date/basis。
 */
import { IndicatorSeries } from './indicator-calculator';

export type SignalDirection = 'bullish' | 'bearish' | 'neutral';

export interface DetectedSignal {
  date: string;
  type: string;
  direction: SignalDirection;
  basis: string;
}

const r4 = (v: number) => Number(v.toFixed(4));
const r2 = (v: number) => Number(v.toFixed(2));

/** 波峰:收盘价在其前后各 3 根窗口内最大(窗口完整才算) */
function isPeak(values: number[], i: number): boolean {
  if (i < 3 || i + 3 >= values.length) return false;
  for (let j = i - 3; j <= i + 3; j++) {
    if (j !== i && values[j] >= values[i]) return false;
  }
  return true;
}

/** 波谷:收盘价在其前后各 3 根窗口内最小 */
function isTrough(values: number[], i: number): boolean {
  if (i < 3 || i + 3 >= values.length) return false;
  for (let j = i - 3; j <= i + 3; j++) {
    if (j !== i && values[j] <= values[i]) return false;
  }
  return true;
}

/** 波峰 ±3 根窗口内比较序列最大值(窗口越界则取可用范围,需含峰点) */
function maxInWindow(values: (number | null)[], peakIdx: number): number | null {
  let max: number | null = null;
  for (let j = Math.max(0, peakIdx - 3); j <= Math.min(values.length - 1, peakIdx + 3); j++) {
    const v = values[j];
    if (v !== null && (max === null || v > max)) max = v;
  }
  return max;
}

function minInWindow(values: (number | null)[], peakIdx: number): number | null {
  let min: number | null = null;
  for (let j = Math.max(0, peakIdx - 3); j <= Math.min(values.length - 1, peakIdx + 3); j++) {
    const v = values[j];
    if (v !== null && (min === null || v < min)) min = v;
  }
  return min;
}

/**
 * 顶背离(比较对象:比较序列的波峰,指标序列取窗口内最大值,如价格/DIF、价格/OBV):
 * 取最近两个相邻价格波峰 p1、p2(p2 时间在后且 p2>p1×1.001);d1、d2 为各自 ±3 根窗口内指标最大值;
 * p2 更高而 d2<d1×0.999(容差 0.1%)→ 顶背离成立。
 */
function detectTopDivergence(
  s: IndicatorSeries,
  compare: (number | null)[],
  label: string,
): DetectedSignal[] {
  const out: DetectedSignal[] = [];
  const peaks: number[] = [];
  for (let i = 0; i < s.closes.length; i++) if (isPeak(s.closes, i)) peaks.push(i);
  for (let k = 1; k < peaks.length; k++) {
    const p1 = peaks[k - 1];
    const p2 = peaks[k];
    if (s.closes[p2] <= s.closes[p1] * 1.001) continue;
    const d1 = maxInWindow(compare, p1);
    const d2 = maxInWindow(compare, p2);
    if (d1 === null || d2 === null) continue;
    if (d2 < d1 * 0.999) {
      out.push({
        date: s.dates[p2],
        type: label === 'OBV' ? 'obvTopDivergence' : 'macdTopDivergence',
        direction: 'bearish',
        basis: `${label}顶背离:价格波峰 ${s.dates[p1]}(${r2(s.closes[p1])}) → ${s.dates[p2]}(${r2(s.closes[p2])}) 创新高,而${label}读数 ${r4(d1)} → ${r4(d2)} 走低`,
      });
    }
  }
  return out;
}

/** 底背离镜像:相邻波谷 p2<p1×0.999,而指标窗口最小值 d2>d1×1.001 */
function detectBottomDivergence(
  s: IndicatorSeries,
  compare: (number | null)[],
  label: string,
): DetectedSignal[] {
  const out: DetectedSignal[] = [];
  const troughs: number[] = [];
  for (let i = 0; i < s.closes.length; i++) if (isTrough(s.closes, i)) troughs.push(i);
  for (let k = 1; k < troughs.length; k++) {
    const p1 = troughs[k - 1];
    const p2 = troughs[k];
    if (s.closes[p2] >= s.closes[p1] * 0.999) continue;
    const d1 = minInWindow(compare, p1);
    const d2 = minInWindow(compare, p2);
    if (d1 === null || d2 === null) continue;
    if (d2 > d1 * 1.001) {
      out.push({
        date: s.dates[p2],
        type: label === 'OBV' ? 'obvBottomDivergence' : 'macdBottomDivergence',
        direction: 'bullish',
        basis: `${label}底背离:价格波谷 ${s.dates[p1]}(${r2(s.closes[p1])}) → ${s.dates[p2]}(${r2(s.closes[p2])}) 创新低,而${label}读数 ${r4(d1)} → ${r4(d2)} 抬高`,
      });
    }
  }
  return out;
}

export function detectSignals(s: IndicatorSeries): DetectedSignal[] {
  const out: DetectedSignal[] = [];
  const n = s.closes.length;

  // MACD 金叉/死叉:t−1 日 DIF≤DEA 且 t 日 DIF>DEA(死叉反之),附带零轴上方/下方标注
  for (let i = 1; i < n; i++) {
    if (s.dif[i] === null || s.dea[i] === null || s.dif[i - 1] === null || s.dea[i - 1] === null) continue;
    const prevGap = (s.dif[i - 1] as number) - (s.dea[i - 1] as number);
    const curGap = (s.dif[i] as number) - (s.dea[i] as number);
    if (prevGap <= 0 && curGap > 0) {
      const side = (s.dif[i] as number) > 0 ? '零轴上方' : '零轴下方';
      out.push({
        date: s.dates[i],
        type: 'macdGoldenCross',
        direction: 'bullish',
        basis: `MACD金叉(${side}):DIF ${r4(s.dif[i] as number)} 上穿 DEA ${r4(s.dea[i] as number)}(前日 DIF−DEA=${r4(prevGap)})`,
      });
    } else if (prevGap >= 0 && curGap < 0) {
      const side = (s.dif[i] as number) > 0 ? '零轴上方' : '零轴下方';
      out.push({
        date: s.dates[i],
        type: 'macdDeathCross',
        direction: 'bearish',
        basis: `MACD死叉(${side}):DIF ${r4(s.dif[i] as number)} 下穿 DEA ${r4(s.dea[i] as number)}(前日 DIF−DEA=${r4(prevGap)})`,
      });
    }
  }

  // 背离(价格/MACD 与 价格/OBV)
  out.push(...detectTopDivergence(s, s.dif, 'MACD'));
  out.push(...detectTopDivergence(s, s.obv, 'OBV'));
  out.push(...detectBottomDivergence(s, s.dif, 'MACD'));
  out.push(...detectBottomDivergence(s, s.obv, 'OBV'));

  // 带宽收缩:带宽处于自身近 120 日 ≤20% 分位(样本<120 日用全部可用样本)
  for (let i = 0; i < n; i++) {
    if (s.bollBandwidth[i] === null) continue;
    const start = Math.max(0, i - 119);
    const sample: number[] = [];
    for (let j = start; j <= i; j++) {
      const v = s.bollBandwidth[j];
      if (v !== null) sample.push(v);
    }
    if (sample.length === 0) continue;
    const usedFull = sample.length < 120;
    sample.sort((a, b) => a - b);
    let cnt = 0;
    const cur = s.bollBandwidth[i] as number;
    for (const v of sample) if (v <= cur) cnt++;
    const p = cnt / sample.length;
    if (p <= 0.2) {
      out.push({
        date: s.dates[i],
        type: 'bollBandSqueeze',
        direction: 'neutral',
        basis: `带宽收缩:${r4(cur)} 处于近${usedFull ? `全部可用样本(${sample.length}日)` : '120日'}的 ${(p * 100).toFixed(1)}% 分位(≤20%),波动率收敛待方向选择`,
      });
    }
  }

  // 放量/缩量:量比≥1.5 / ≤0.7(钉死)
  for (let i = 0; i < n; i++) {
    const vr = s.volumeRatio[i];
    if (vr === null) continue;
    if (vr >= 1.5) {
      out.push({
        date: s.dates[i],
        type: 'volumeSurge',
        direction: 'neutral',
        basis: `放量:量比 ${r4(vr)} ≥ 1.5`,
      });
    } else if (vr <= 0.7) {
      out.push({
        date: s.dates[i],
        type: 'volumeShrink',
        direction: 'neutral',
        basis: `缩量:量比 ${r4(vr)} ≤ 0.7`,
      });
    }
  }

  return out;
}
