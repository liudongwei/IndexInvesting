/**
 * 指标序列计算器 —— 输入按日期升序的 K 线数组,输出逐日指标宽表值。
 * 公式与有效起点钉死:references/technical-indicators-spec.md §1。
 * MA5/10/20/60/120/250 不在此处(MA 单一来源是 moving_averages 表)。
 */
import { Series, sma, ema, wilderRma, rollingStd, emaOfSeries, percentileInfo, safe } from './indicator-math';

export interface Candle {
  date: string; // 'YYYY-MM-DD'
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  turnover: number | null;
}

export interface IndicatorRow {
  date: string;
  macdDif: number | null;
  macdDea: number | null;
  macdHist: number | null;
  bollMid: number | null;
  bollUpper: number | null;
  bollLower: number | null;
  adx: number | null;
  pdi: number | null;
  mdi: number | null;
  obv: number | null;
  obvEma20: number | null;
  volumeRatio: number | null;
  vma5: number | null;
  vma10: number | null;
  rsi: number | null;
  cmf: number | null;
  bias20: number | null;
  bias60: number | null;
  atr14: number | null;
  hv20: number | null;
}

export interface IndicatorSeries {
  dates: string[];
  closes: number[];
  highs: number[];
  lows: number[];
  opens: number[];
  volumes: (number | null)[];
  dif: Series;
  dea: Series;
  hist: Series;
  bollMid: Series;
  bollUpper: Series;
  bollLower: Series;
  bollBandwidth: Series;
  adx: Series;
  pdi: Series;
  mdi: Series;
  obv: Series;
  obvEma20: Series;
  volumeRatio: Series;
  vma5: Series;
  vma10: Series;
  rsi: Series;
  cmf: Series;
  bias20: Series;
  bias60: Series;
  atr14: Series;
  hv20: Series;
}

export function computeIndicatorSeries(candles: Candle[]): IndicatorSeries {
  const n = candles.length;
  const dates = candles.map((c) => c.date);
  const opens = candles.map((c) => c.open);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => (c.volume !== null && Number.isFinite(c.volume) ? c.volume : null));

  // ---- MACD (12,26,9),柱体=(DIF−DEA)×2(国内惯例,钉死),第 34 根起 ----
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const dif: Series = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (ema12[i] !== null && ema26[i] !== null) dif[i] = (ema12[i] as number) - (ema26[i] as number);
  }
  const dea = emaOfSeries(dif, 9);
  const hist: Series = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (dif[i] !== null && dea[i] !== null) hist[i] = ((dif[i] as number) - (dea[i] as number)) * 2;
  }

  // ---- BOLL (20,2),总体标准差(÷N,钉死),第 20 根 ----
  const bollMid = sma(closes, 20);
  const std20 = rollingStd(closes, 20);
  const bollUpper: Series = new Array(n).fill(null);
  const bollLower: Series = new Array(n).fill(null);
  const bollBandwidth: Series = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (bollMid[i] !== null && std20[i] !== null) {
      const mid = bollMid[i] as number;
      bollUpper[i] = mid + 2 * (std20[i] as number);
      bollLower[i] = mid - 2 * (std20[i] as number);
      bollBandwidth[i] = mid !== 0 ? ((bollUpper[i] as number) - (bollLower[i] as number)) / mid : null;
    }
  }

  // ---- ADX (14) Wilder:TR/+DM/−DM → RMA14 → DI/DX/ADX,第 28 根起 ----
  const trs: (number | null)[] = new Array(n).fill(null);
  const plusDMs: (number | null)[] = new Array(n).fill(null);
  const minusDMs: (number | null)[] = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    trs[i] = tr;
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDMs[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDMs[i] = downMove > upMove && downMove > 0 ? downMove : 0;
  }
  const rmaTr = wilderRma(trs, 14);
  const rmaPlus = wilderRma(plusDMs, 14);
  const rmaMinus = wilderRma(minusDMs, 14);
  const dx: (number | null)[] = new Array(n).fill(null);
  const pdi: Series = new Array(n).fill(null);
  const mdi: Series = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (rmaTr[i] !== null && rmaPlus[i] !== null && rmaMinus[i] !== null && (rmaTr[i] as number) > 0) {
      const p = (100 * (rmaPlus[i] as number)) / (rmaTr[i] as number);
      const m = (100 * (rmaMinus[i] as number)) / (rmaTr[i] as number);
      pdi[i] = p;
      mdi[i] = m;
      const denom = p + m;
      dx[i] = denom > 0 ? (100 * Math.abs(p - m)) / denom : null;
    }
  }
  const adx = wilderRma(dx, 14);

  // ---- OBV:obv_t = obv_{t−1} + sign(close_t − close_{t−1})×volume_t,第 2 根 ----
  const obv: Series = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const v = volumes[i];
    if (i === 0) {
      obv[i] = v !== null ? 0 : null; // 第 1 根基准 0(仅当有量);无量序列整体不输出
      continue;
    }
    if (obv[i - 1] === null || v === null) {
      obv[i] = null;
      continue;
    }
    const diff = closes[i] - closes[i - 1];
    obv[i] = (obv[i - 1] as number) + (diff > 0 ? v : diff < 0 ? -v : 0);
  }
  const obvEma20 = emaOfSeries(obv, 20);

  // ---- 量比 = 当日量 ÷ 前 5 日平均量(复用 trend-analysis 口径),第 6 根;VMA5/10 ----
  const volumeRatio: Series = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (i < 5) continue;
    const cur = volumes[i];
    if (cur === null) continue;
    let sum = 0;
    let ok = true;
    for (let j = i - 5; j < i; j++) {
      const v = volumes[j];
      if (v === null) {
        ok = false;
        break;
      }
      sum += v;
    }
    if (ok && sum > 0) volumeRatio[i] = cur / (sum / 5);
  }
  const volForMa = volumes.map((v) => (v === null ? Number.NaN : v));
  const vma5raw = sma(volForMa, 5);
  const vma10raw = sma(volForMa, 10);
  const vma5: Series = vma5raw.map((v) => safe(v));
  const vma10: Series = vma10raw.map((v) => safe(v));

  // ---- RSI (14) Wilder:RS=RMA(gain)/RMA(loss),第 15 根 ----
  const gains: (number | null)[] = new Array(n).fill(null);
  const losses: (number | null)[] = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    const d = closes[i] - closes[i - 1];
    gains[i] = d > 0 ? d : 0;
    losses[i] = d < 0 ? -d : 0;
  }
  const rmaGain = wilderRma(gains, 14);
  const rmaLoss = wilderRma(losses, 14);
  const rsi: Series = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (rmaGain[i] !== null && rmaLoss[i] !== null) {
      const loss = rmaLoss[i] as number;
      const rs = loss === 0 ? Number.POSITIVE_INFINITY : (rmaGain[i] as number) / loss;
      rsi[i] = rs === Number.POSITIVE_INFINITY ? 100 : 100 - 100 / (1 + rs);
    }
  }

  // ---- BIAS 20/60 = (close−MAN)/MAN×100 ----
  const ma20 = sma(closes, 20);
  const ma60 = sma(closes, 60);
  const bias20: Series = new Array(n).fill(null);
  const bias60: Series = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (ma20[i] !== null && ma20[i] !== 0) bias20[i] = ((closes[i] - (ma20[i] as number)) / (ma20[i] as number)) * 100;
    if (ma60[i] !== null && ma60[i] !== 0) bias60[i] = ((closes[i] - (ma60[i] as number)) / (ma60[i] as number)) * 100;
  }

  // ---- CMF (20):MFM=((C−L)−(H−C))/(H−L)(H=L 取 0);CMF=Σ20(MFV)/Σ20(V) ----
  const cmf: Series = new Array(n).fill(null);
  const mfv: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const v = volumes[i];
    const range = highs[i] - lows[i];
    if (v === null) {
      mfv[i] = null;
      continue;
    }
    const mfm = range > 0 ? ((closes[i] - lows[i]) - (highs[i] - closes[i])) / range : 0;
    mfv[i] = mfm * v;
  }
  for (let i = 19; i < n; i++) {
    let sumMfv = 0;
    let sumV = 0;
    let ok = true;
    for (let j = i - 19; j <= i; j++) {
      if (mfv[j] === null || volumes[j] === null) {
        ok = false;
        break;
      }
      sumMfv += mfv[j] as number;
      sumV += volumes[j] as number;
    }
    if (ok && sumV > 0) cmf[i] = sumMfv / sumV;
  }

  // ---- ATR (14) Wilder TR,第 15 根;HV (20)=std(20 日对数收益)×√250,第 21 根 ----
  const atr14 = wilderRma(trs, 14);
  const logRets: (number | null)[] = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) logRets[i] = Math.log(closes[i] / closes[i - 1]);
  }
  const hv20: Series = new Array(n).fill(null);
  for (let i = 20; i < n; i++) {
    // 20 日对数收益 = logRets[i-19..i],需 21 根K线
    let sum = 0;
    let ok = true;
    for (let j = i - 19; j <= i; j++) {
      if (logRets[j] === null) {
        ok = false;
        break;
      }
      sum += logRets[j] as number;
    }
    if (!ok) continue;
    const mean = sum / 20;
    let sq = 0;
    for (let j = i - 19; j <= i; j++) {
      const d = (logRets[j] as number) - mean;
      sq += d * d;
    }
    hv20[i] = Math.sqrt(sq / 19) * Math.sqrt(250); // 样本标准差(对数收益惯例)
  }

  return {
    dates,
    opens,
    highs,
    lows,
    closes,
    volumes,
    dif,
    dea,
    hist,
    bollMid,
    bollUpper,
    bollLower,
    bollBandwidth,
    adx,
    pdi,
    mdi,
    obv,
    obvEma20,
    volumeRatio,
    vma5,
    vma10,
    rsi,
    cmf,
    bias20,
    bias60,
    atr14,
    hv20,
  };
}

/** 序列 → 逐日宽表行(数值收敛,null 化 NaN/Infinity) */
export function seriesToRows(s: IndicatorSeries): IndicatorRow[] {
  const rows: IndicatorRow[] = [];
  for (let i = 0; i < s.dates.length; i++) {
    rows.push({
      date: s.dates[i],
      macdDif: safe(s.dif[i]),
      macdDea: safe(s.dea[i]),
      macdHist: safe(s.hist[i]),
      bollMid: safe(s.bollMid[i]),
      bollUpper: safe(s.bollUpper[i]),
      bollLower: safe(s.bollLower[i]),
      adx: safe(s.adx[i]),
      pdi: safe(s.pdi[i]),
      mdi: safe(s.mdi[i]),
      obv: safe(s.obv[i]),
      obvEma20: safe(s.obvEma20[i]),
      volumeRatio: safe(s.volumeRatio[i]),
      vma5: safe(s.vma5[i]),
      vma10: safe(s.vma10[i]),
      rsi: safe(s.rsi[i]),
      cmf: safe(s.cmf[i]),
      bias20: safe(s.bias20[i]),
      bias60: safe(s.bias60[i]),
      atr14: safe(s.atr14[i]),
      hv20: safe(s.hv20[i]),
    });
  }
  return rows;
}

/** RSI 分位判定(近 120 日 ≤10% 分位=超卖,≥90%=超买;样本<120 用全部可用并标注) */
export function rsiPercentile(s: IndicatorSeries, i: number): { percentile: number | null; usedFullSample: boolean } {
  return percentileInfo(s.rsi, i, 120);
}

/** 带宽收缩判定:带宽处于近 120 日 ≤20% 分位 */
export function bandSqueezeInfo(s: IndicatorSeries, i: number): { percentile: number | null; usedFullSample: boolean; isSqueeze: boolean } {
  const info = percentileInfo(s.bollBandwidth, i, 120);
  return { ...info, isSqueeze: info.percentile !== null && info.percentile <= 0.2 };
}
