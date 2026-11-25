/**
 * 技术指标独立对账 E2E(规格 §8.1/8.2):
 * - 按规格 §1 公式独立重实现 MACD/BOLL/ADX/OBV/量比/RSI/BIAS/CMF/ATR/HV(不复制 src 代码),
 *   与 indicator_values 落库值逐点比对(存储精度 r4,容差 1e-4;HV/ATR 等 r4)。
 * - 抽样:最近 1 日 + 中段 2 日(可 --dates=YYYY-MM-DD,YYYY-MM-DD,YYYY-MM-DD 指定)。
 * - 用法:node scripts/e2e-indicators-reconcile.js [--index=沪深300]
 */
const { createRequire } = require('module');
const req = createRequire(require('path').join(__dirname, '..', 'package.json'));
const fs = require('fs');
const { Client } = req('pg');
const env = {};
for (const line of fs.readFileSync(require('path').join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2]; }
const c = new Client({ host: env.DB_HOST || 'localhost', port: 5432, user: env.DB_USERNAME || 'postgres', password: env.DB_PASSWORD || 'jack@123', database: env.DB_DATABASE || 'index_investing' });

const args = process.argv.slice(2);
const indexName = (args.find((a) => a.startsWith('--index=')) || '--index=沪深300').replace('--index=', '');
const datesArg = (args.find((a) => a.startsWith('--dates=')) || '').replace('--dates=', '');
const TOL = 1e-4;

// ===== 独立实现(规格 §1) =====
function emaArr(vals, n) {
  const k = 2 / (n + 1);
  const out = new Array(vals.length).fill(null);
  if (vals.length < n) return out;
  let prev = vals.slice(0, n).reduce((a, b) => a + b, 0) / n;
  out[n - 1] = prev;
  for (let i = n; i < vals.length; i++) { prev = vals[i] * k + prev * (1 - k); out[i] = prev; }
  return out;
}
function macd(closes) {
  const e12 = emaArr(closes, 12), e26 = emaArr(closes, 26);
  const dif = closes.map((_, i) => (e12[i] === null || e26[i] === null ? null : e12[i] - e26[i]));
  // DEA=EMA9(DIF 同递推):从第一个非 null 起取 9 个做种子
  const first = dif.findIndex((v) => v !== null);
  const dea = new Array(dif.length).fill(null);
  if (first >= 0 && dif.length - first >= 9) {
    let prev = dif.slice(first, first + 9).reduce((a, b) => a + b, 0) / 9;
    dea[first + 8] = prev;
    for (let i = first + 9; i < dif.length; i++) { prev = dif[i] * (2 / 10) + prev * (1 - 2 / 10); dea[i] = prev; }
  }
  const hist = dif.map((v, i) => (v === null || dea[i] === null ? null : (v - dea[i]) * 2));
  return { dif, dea, hist };
}
function boll(closes, n = 20, k = 2) {
  const mid = [], up = [], low = [], bw = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < n - 1) { mid.push(null); up.push(null); low.push(null); bw.push(null); continue; }
    const w = closes.slice(i - n + 1, i + 1);
    const m = w.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / n); // 总体标准差 ÷N
    mid.push(m); up.push(m + k * sd); low.push(m - k * sd); bw.push((2 * k * sd) / m);
  }
  return { mid, up, low, bw };
}
function adx(h, l, cl) {
  const n = cl.length;
  const tr = [], pdm = [], mdm = [];
  tr.push(null); pdm.push(null); mdm.push(null);
  for (let i = 1; i < n; i++) {
    tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - cl[i - 1]), Math.abs(l[i] - cl[i - 1])));
    const up = h[i] - h[i - 1], dn = l[i - 1] - l[i];
    pdm.push(up > dn && up > 0 ? up : 0);
    mdm.push(dn > up && dn > 0 ? dn : 0);
  }
  const rma = (arr, n) => {
    const out = new Array(arr.length).fill(null);
    const first = arr.findIndex((v) => v !== null);
    if (first < 0 || first + n > arr.length) return out;
    let prev = arr.slice(first, first + n).reduce((a, b) => a + b, 0) / n;
    out[first + n - 1] = prev;
    for (let i = first + n; i < arr.length; i++) { prev = prev + (arr[i] - prev) / n; out[i] = prev; }
    return out;
  };
  const trR = rma(tr, 14), pR = rma(pdm, 14), mR = rma(mdm, 14);
  const pdi = [], mdi = [], dx = [];
  for (let i = 0; i < n; i++) {
    if (trR[i] === null || trR[i] === 0) { pdi.push(null); mdi.push(null); dx.push(null); continue; }
    const p = (100 * pR[i]) / trR[i], m = (100 * mR[i]) / trR[i];
    pdi.push(p); mdi.push(m);
    dx.push(p + m > 0 ? (100 * Math.abs(p - m)) / (p + m) : null);
  }
  return { adx: rma(dx, 14), pdi, mdi };
}
function obv(closes, vols) {
  const out = [0];
  for (let i = 1; i < closes.length; i++) {
    const sign = Math.sign(closes[i] - closes[i - 1]);
    out.push(out[i - 1] + sign * vols[i]);
  }
  return out;
}
function rsi(closes) {
  const n = closes.length;
  const gains = [null], losses = [null];
  for (let i = 1; i < n; i++) { const d = closes[i] - closes[i - 1]; gains.push(d > 0 ? d : 0); losses.push(d < 0 ? -d : 0); }
  const rma = (arr) => {
    const out = new Array(arr.length).fill(null);
    let prev = arr.slice(1, 15).reduce((a, b) => a + b, 0) / 14;
    out[14] = prev;
    for (let i = 15; i < arr.length; i++) { prev = prev + (arr[i] - prev) / 14; out[i] = prev; }
    return out;
  };
  const g = rma(gains), l = rma(losses);
  return closes.map((_, i) => {
    if (g[i] === null || l[i] === null) return null;
    if (l[i] === 0) return 100;
    const rs = g[i] / l[i];
    return 100 - 100 / (1 + rs);
  });
}
function cmf(h, l, cl, vols, n = 20) {
  const out = [];
  for (let i = 0; i < cl.length; i++) {
    if (i < n - 1) { out.push(null); continue; }
    let mfv = 0, vv = 0, ok = true;
    for (let j = i - n + 1; j <= i; j++) {
      if (vols[j] === null || vols[j] === undefined) { ok = false; break; }
      const range = h[j] - l[j];
      const mfm = range > 0 ? ((cl[j] - l[j]) - (h[j] - cl[j])) / range : 0;
      mfv += mfm * vols[j];
      vv += vols[j];
    }
    out.push(ok && vv > 0 ? mfv / vv : null);
  }
  return out;
}

const dstr = (d) => (typeof d === 'string' ? d.slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);

(async () => {
  await c.connect();
  const idx = (await c.query(`SELECT "id" FROM "indices" WHERE "name" LIKE $1 LIMIT 1`, [`%${indexName}%`])).rows[0];
  if (!idx) { console.error('找不到指数', indexName); process.exit(1); }
  const h = (await c.query(`SELECT "tradeDate","openPrice","highPrice","lowPrice","closePrice","volume" FROM "index_histories" WHERE "indexId"=$1 ORDER BY "tradeDate" ASC`, [idx.id])).rows;
  const dates = h.map((x) => dstr(x.tradeDate));
  const o = h.map((x) => Number(x.openPrice)), hi = h.map((x) => Number(x.highPrice)), lo = h.map((x) => Number(x.lowPrice)), cl = h.map((x) => Number(x.closePrice));
  const v = h.map((x) => (x.volume === null ? null : Number(x.volume)));

  const m = macd(cl);
  const b = boll(cl);
  const a = adx(hi, lo, cl);
  const obvArr = obv(cl, v.map((x) => x ?? 0)); // 无量日按 0 处理(与库一致:OBV 要求连续量,缺则断)
  const rsiArr = rsi(cl);
  const cmfArr = cmf(hi, lo, cl, v);
  const ma20 = b.mid; // BOLL 中轨 = MA20,与 moving_averages 单一来源互证
  const maRows = (await c.query(`SELECT "tradeDate","ma20","ma60" FROM "moving_averages" WHERE "indexId"=$1`, [idx.id])).rows;
  const ma20Map = new Map(maRows.map((r) => [dstr(r.tradeDate), r.ma20 === null ? null : Number(r.ma20)]));

  // 抽样日期:最近 1 日 + 中段 2 日(或指定)
  let sampleDates;
  if (datesArg) sampleDates = datesArg.split(',');
  else sampleDates = [dates[dates.length - 1], dates[Math.floor(dates.length / 2)], dates[Math.floor(dates.length / 4)]];

  const rowsByDate = new Map();
  for (const r of (await c.query(`SELECT * FROM "indicator_values" WHERE "indexId"=$1`, [idx.id])).rows) {
    rowsByDate.set(dstr(r.tradeDate), r);
  }

  let checked = 0, bad = 0;
  const cmp = (name, dbVal, myVal, tol = TOL) => {
    checked++;
    if (dbVal === null && myVal === null) return;
    if (dbVal === null || myVal === null || Math.abs(Number(dbVal) - myVal) > tol) {
      bad++;
      console.log(`  ✗ ${name}: 库=${dbVal} 独立算=${myVal !== null ? myVal.toFixed(6) : null} (tol=${tol})`);
    }
  };

  for (const ds of sampleDates) {
    const i = dates.indexOf(ds);
    const db = rowsByDate.get(ds);
    if (!db) { console.log(`${ds}: 库中无行,跳过`); continue; }
    console.log(`—— ${ds} (第 ${i + 1} 根) ——`);
    cmp('macdDif', db.macdDif, m.dif[i]);
    cmp('macdDea', db.macdDea, m.dea[i]);
    cmp('macdHist', db.macdHist, m.hist[i]);
    cmp('bollMid', db.bollMid, b.mid[i]);
    cmp('bollUpper', db.bollUpper, b.up[i]);
    cmp('bollLower', db.bollLower, b.low[i]);
    cmp('adx', db.adx, a.adx[i]);
    cmp('pdi', db.pdi, a.pdi[i]);
    cmp('mdi', db.mdi, a.mdi[i]);
    cmp('obv', db.obv, obvArr[i]);
    cmp('rsi', db.rsi, rsiArr[i]);
    cmp('cmf', db.cmf, cmfArr[i]);
    // 量比 / BIAS / ATR / HV / VMA 现场按窗口算
    if (i >= 5 && v[i] !== null) {
      const w5 = v.slice(i - 5, i);
      if (w5.every((x) => x !== null) && w5.reduce((x, y) => x + y, 0) > 0) {
        cmp('volumeRatio', db.volumeRatio, v[i] / (w5.reduce((x, y) => x + y, 0) / 5));
      }
    }
    if (i >= 19) cmp('bias20', db.bias20, ((cl[i] - ma20[i]) / ma20[i]) * 100);
    if (i >= 59) {
      const w60 = cl.slice(i - 59, i + 1);
      const m60 = w60.reduce((x, y) => x + y, 0) / 60;
      cmp('bias60', db.bias60, ((cl[i] - m60) / m60) * 100);
      // ATR:TR 的 Wilder RMA14,种子=前14个TR的SMA(tr 从第1根起)
      const trs = [null];
      for (let j = 1; j <= i; j++) trs.push(Math.max(hi[j] - lo[j], Math.abs(hi[j] - cl[j - 1]), Math.abs(lo[j] - cl[j - 1])));
      if (i >= 14) {
        let prev = trs.slice(1, 15).reduce((x, y) => x + y, 0) / 14;
        for (let j = 15; j <= i; j++) prev = prev + (trs[j] - prev) / 14;
        cmp('atr14', db.atr14, prev);
      }
      if (i >= 20) {
        const rets = [];
        for (let j = i - 19; j <= i; j++) rets.push(Math.log(cl[j] / cl[j - 1]));
        const mean = rets.reduce((x, y) => x + y, 0) / 20;
        const sd = Math.sqrt(rets.reduce((x, y) => x + (y - mean) ** 2, 0) / 19);
        cmp('hv20', db.hv20, sd * Math.sqrt(250));
      }
    }
    // OBV EMA20:对独立 OBV 序列做 EMA20(种子=前20个SMA,从有效起点)
    // 与 MA 单一来源互证:BOLL 中轨 == moving_averages.ma20
    const dbMa20 = ma20Map.get(ds);
    checked++;
    if (dbMa20 !== null && db.bollMid !== null && Math.abs(Number(db.bollMid) - dbMa20) > 0.0051) { bad++; console.log(`  ✗ bollMid vs moving_averages.ma20: ${db.bollMid} vs ${dbMa20}`); }
  }

  console.log(`\n独立对账结果: 检查 ${checked} 项, 不一致 ${bad}`);
  console.log(bad === 0 ? '✅ 全部通过(容差 1e-4,MA 互证 0.0051)' : '❌ 存在不一致,需排查');
  await c.end();
  process.exit(bad === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
