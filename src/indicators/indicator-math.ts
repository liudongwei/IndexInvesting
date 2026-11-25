/**
 * 技术指标纯函数库 —— 公式钉死于 index-investing-dev 技能 references/technical-indicators-spec.md §1
 * 所有函数输入为按日期升序的数值序列,输出与输入等长的数组,无效期为 null。
 * 计算统一用全精度 float64;API 响应层再做 r4 舍入;禁止 NaN 进入存储/序列化(一律转 null)。
 */

export type Series = (number | null)[];

/** 简单移动平均:窗口不足 N 日输出 null */
export function sma(values: number[], n: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (n <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

/**
 * EMA 递推: ema_t = close×2/(N+1) + ema_{t-1}×(1−2/(N+1)),种子 = 前 N 日 SMA。
 * 不足 N 日(种子未成)输出 null。
 */
export function ema(values: number[], n: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (n <= 0 || values.length < n) return out;
  const k = 2 / (n + 1);
  let seed = 0;
  for (let i = 0; i < n; i++) seed += values[i];
  seed /= n;
  let prev = seed;
  out[n - 1] = prev;
  for (let i = n; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/**
 * Wilder 平滑(RMA,α=1/N): 种子 = 前 N 日 SMA,之后 rma_t = prev + (x_t − prev)/N。
 */
export function wilderRma(values: (number | null)[], n: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (n <= 0) return out;
  // 找到第一个连续 N 个非 null 的窗口做种子
  let i = 0;
  while (i + n <= values.length) {
    let sum = 0;
    let ok = true;
    for (let j = i; j < i + n; j++) {
      const v = values[j];
      if (v === null || v === undefined || !Number.isFinite(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    if (ok) {
      let prev = sum / n;
      out[i + n - 1] = prev;
      for (let t = i + n; t < values.length; t++) {
        const v = values[t];
        if (v === null || v === undefined || !Number.isFinite(v)) {
          out[t] = null; // 数据缺口中断平滑,后续不再输出
        } else {
          prev = prev + (v - prev) / n;
          out[t] = prev;
        }
      }
      break;
    }
    i++;
  }
  return out;
}

/** 总体标准差(÷N,钉死);窗口不足 N 输出 null */
export function rollingStd(values: number[], n: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (n <= 0) return out;
  for (let i = n - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - n + 1; j <= i; j++) sum += values[j];
    const mean = sum / n;
    let sq = 0;
    for (let j = i - n + 1; j <= i; j++) {
      const d = values[j] - mean;
      sq += d * d;
    }
    out[i] = Math.sqrt(sq / n);
  }
  return out;
}

/** x 的移动平均作用于已含 null 的序列(用于 OBV 的 EMA20、DIF 的 EMA9),从第一个连续 n 个非 null 的窗口起算,null 透传 */
export function emaOfSeries(src: Series, n: number): Series {
  const out: Series = new Array(src.length).fill(null);
  if (n <= 0 || src.length < n) return out;
  const k = 2 / (n + 1);
  let i = 0;
  while (i + n <= src.length) {
    let sum = 0;
    let ok = true;
    for (let j = i; j < i + n; j++) {
      const v = src[j];
      if (v === null || v === undefined || !Number.isFinite(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    if (ok) {
      let prev = sum / n;
      out[i + n - 1] = prev;
      for (let t = i + n; t < src.length; t++) {
        const v = src[t];
        if (v === null || v === undefined || !Number.isFinite(v)) {
          out[t] = null; // 缺口:该点不输出,平滑基准保持
        } else {
          prev = v * k + prev * (1 - k);
          out[t] = prev;
        }
      }
      break;
    }
    i++;
  }
  return out;
}

/**
 * 分位数判定辅助:返回 {percentile, usedFullSample}
 * RSI/带宽收缩阈值口径:近 120 日分位,样本<120 日用全部可用样本并标注。
 */
export function percentileInfo(values: Series, idx: number, window = 120): { percentile: number | null; usedFullSample: boolean } {
  const cur = values[idx];
  if (cur === null) return { percentile: null, usedFullSample: false };
  const start = Math.max(0, idx - window + 1);
  const sample: number[] = [];
  for (let i = start; i <= idx; i++) {
    const v = values[i];
    if (v !== null) sample.push(v);
  }
  if (sample.length === 0) return { percentile: null, usedFullSample: false };
  const usedFullSample = sample.length < 120;
  sample.sort((a, b) => a - b);
  let cnt = 0;
  for (const v of sample) if (v <= cur) cnt++;
  return { percentile: cnt / sample.length, usedFullSample };
}

/** 数值收敛:null/NaN/Infinity → null */
export function safe(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return Number.isFinite(v) ? v : null;
}
