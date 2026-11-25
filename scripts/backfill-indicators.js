#!/usr/bin/env node
/**
 * 技术指标历史回填(indicator_values / indicator_states / indicator_signals 三表)
 *
 * 计算逻辑直接复用编译产物 dist/indicators/*.js(纯函数,与线上服务同一份代码)。
 * MA(含 MA120/250)不在本脚本范围 —— 走 POST /api/moving-averages/calculate-all(规格 §6)。
 *
 * 用法(项目根目录,先 npm run build):
 *   node scripts/backfill-indicators.js            # 干跑:全量计算+对账统计,不写库
 *   node scripts/backfill-indicators.js --apply    # 实际写入(全量重算+upsert,幂等)
 *   node scripts/backfill-indicators.js --index=sh000300   # 只跑一个指数
 *   node scripts/backfill-indicators.js --batch=aStock     # 只跑一个市场批次
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// DB 连接:process.env > 项目 .env > 默认值(与 app.module.ts 一致)
const env = {};
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  }
}
const conf = {
  host: process.env.DB_HOST || env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || env.DB_PORT || '5432', 10),
  user: process.env.DB_USERNAME || env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || env.DB_PASSWORD || 'jack@123',
  database: process.env.DB_DATABASE || env.DB_DATABASE || 'index_investing',
};

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const indexArg = (args.find((a) => a.startsWith('--index=')) || '').replace('--index=', '');
const batchArg = (args.find((a) => a.startsWith('--batch=')) || '').replace('--batch=', '');

const dist = path.join(__dirname, '..', 'dist', 'indicators');
if (!fs.existsSync(path.join(dist, 'indicator-calculator.js'))) {
  console.error('未找到 dist/indicators/indicator-calculator.js —— 请先在项目根目录执行 npm run build');
  process.exit(1);
}
const { computeIndicatorSeries, seriesToRows } = require(path.join(dist, 'indicator-calculator.js'));
const { detectSignals } = require(path.join(dist, 'signal-detector.js'));
const { classifyAll } = require(path.join(dist, 'state-machine.js'));

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// 市场批次划分(与 src/indicators/indicators.service.ts batchOfIndex 同口径)
function batchOfIndex(idx) {
  const exchange = idx.exchange || '';
  const code = idx.code || '';
  const officialCode = idx.officialCode || '';
  const name = idx.name || '';
  const isAStock =
    exchange.includes('上海') || exchange.includes('深圳') || exchange.includes('北京') ||
    exchange.includes('上交所') || exchange.includes('深交所') || exchange.includes('北交所') ||
    code.startsWith('sh') || code.startsWith('sz') ||
    officialCode.includes('.SH') || officialCode.includes('.SZ') ||
    officialCode === '932000' || officialCode === '899050';
  const isTaiwan = exchange.includes('台湾') || exchange.includes('台股') || name.includes('台湾') || name.includes('台股') || name.includes('加权') || code.includes('TWII');
  const isJapanKorea = exchange.includes('日本') || exchange.includes('东京') || exchange.includes('韩国') || exchange.includes('首尔') ||
    name.includes('日经') || name.includes('韩国') || name.includes('KOSPI') || name.includes('N225');
  if (isAStock || isTaiwan || isJapanKorea) return 'aStock';
  const isHK = exchange.includes('港交所') || exchange.includes('香港') || code.startsWith('hk');
  if (isHK) return 'hkStock';
  return 'usPrecious';
}

const q = (s) => `"${String(s)}"`;
const dstr = (d) => {
  if (typeof d === 'string') return d.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const VALUE_COLS = ['macdDif','macdDea','macdHist','bollMid','bollUpper','bollLower','adx','pdi','mdi','obv','obvEma20','volumeRatio','vma5','vma10','rsi','cmf','bias20','bias60','atr14','hv20'];

async function main() {
  const client = new Client(conf);
  await client.connect();
  log(`已连接 ${conf.database} @ ${conf.host} | 模式: ${apply ? 'APPLY(写库)' : 'DRY-RUN(干跑,不写库)'}`);

  const indices = (await client.query(
    `SELECT "id","name","code","officialCode","exchange","isActive" FROM "indices" ORDER BY "name"`,
  )).rows.filter((i) => i.isActive && (!indexArg || i.code === indexArg || i.officialCode === indexArg || i.id === indexArg))
    .filter((i) => !batchArg || batchOfIndex(i) === batchArg);

  log(`待处理指数 ${indices.length} 个`);
  const summary = [];

  for (const idx of indices) {
    const t0 = Date.now();
    const histories = (await client.query(
      `SELECT "tradeDate","openPrice","highPrice","lowPrice","closePrice","volume","turnover" FROM "index_histories" WHERE "indexId"=$1 ORDER BY "tradeDate" ASC`,
      [idx.id],
    )).rows;
    if (histories.length === 0) {
      log(`${idx.name}: 无K线,跳过`);
      continue;
    }

    const mas = (await client.query(
      `SELECT "tradeDate","ma20","ma60" FROM "moving_averages" WHERE "indexId"=$1`,
      [idx.id],
    )).rows;
    const maRows = new Map(mas.map((m) => [dstr(m.tradeDate), { date: dstr(m.tradeDate), ma20: m.ma20 === null ? null : Number(m.ma20), ma60: m.ma60 === null ? null : Number(m.ma60) }]));

    const patterns = (await client.query(
      `SELECT "tradeDate","marketPosition" FROM "kline_patterns" WHERE "indexId"=$1`,
      [idx.id],
    )).rows;
    const positionByDate = new Map(patterns.filter((p) => p.marketPosition).map((p) => [dstr(p.tradeDate), p.marketPosition]));

    const candles = histories.map((h) => ({
      date: dstr(h.tradeDate),
      open: Number(h.openPrice),
      high: Number(h.highPrice),
      low: Number(h.lowPrice),
      close: Number(h.closePrice),
      volume: h.volume === null ? null : Number(h.volume),
      turnover: h.turnover === null ? null : Number(h.turnover),
    }));

    const series = computeIndicatorSeries(candles);
    const rows = seriesToRows(series);
    const signals = detectSignals(series);
    const states = classifyAll(series, maRows, positionByDate, signals)
      .map((st, i) => ({ date: series.dates[i], stateKey: st.stateKey, basis: st.basis }));

    // 状态分布统计(sanity:观望<10%、震荡 30~60%、预警类<10%)
    const dist = {};
    for (const st of states) dist[st.stateKey] = (dist[st.stateKey] || 0) + 1;
    const distPct = Object.fromEntries(Object.entries(dist).map(([k, v]) => [k, `${((v / states.length) * 100).toFixed(1)}%`]));

    // 既有行对账(变更量统计)
    const existingVals = (await client.query(
      `SELECT ${q('tradeDate')},${VALUE_COLS.map(q).join(',')} FROM "indicator_values" WHERE ${q('indexId')}=$1`,
      [idx.id],
    )).rows;
    const existingByKey = new Map(existingVals.map((e) => [dstr(e.tradeDate), e]));
    let changedVals = 0;
    for (const row of rows) {
      const prev = existingByKey.get(row.date);
      if (!prev) { changedVals++; continue; }
      for (const c of VALUE_COLS) {
        const a = prev[c] === null ? null : Number(prev[c]);
        const b = row[c];
        if (a === null && b === null) continue;
        if (a === null || b === null || Math.abs(a - b) > 5e-4) { changedVals++; break; }
      }
    }

    const lastHistory = dstr(histories[histories.length - 1].tradeDate);
    log(`${idx.name}: ${histories.length}根K线(MA行${mas.length},位置记录${patterns.length}) → 指标行${rows.length}(待写${changedVals}),状态${states.length},信号${signals.length} | 状态分布 ${JSON.stringify(distPct)} | 最新${lastHistory} | ${Date.now() - t0}ms`);

    summary.push({ name: idx.name, batch: batchOfIndex(idx), candles: histories.length, valueRows: rows.length, changedVals, states: states.length, signals: signals.length, distPct });

    if (apply) {
      await applyValues(client, idx.id, rows);
      await applyStates(client, idx.id, states);
      await applySignals(client, idx.id, signals);
    }
  }

  // 汇总
  const total = {
    indices: summary.length,
    valueRows: summary.reduce((a, s) => a + s.valueRows, 0),
    changedVals: summary.reduce((a, s) => a + s.changedVals, 0),
    signals: summary.reduce((a, s) => a + s.signals, 0),
  };
  log(`汇总: ${JSON.stringify(total)} ${apply ? '(已写入)' : '(干跑,未写入)'}`);
  await client.end();
}

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

async function applyValues(client, indexId, rows) {
  for (const batch of chunk(rows, 300)) {
    const values = [];
    const placeholders = batch.map((row, i) => {
      const b = i * (2 + VALUE_COLS.length);
      values.push(indexId, row.date);
      VALUE_COLS.forEach((c, j) => values.push(row[c]));
      return `($${b + 1},$${b + 2},${VALUE_COLS.map((_, j) => `$${b + 3 + j}`).join(',')})`;
    }).join(',');
    const cols = [q('indexId'), q('tradeDate'), ...VALUE_COLS.map(q)].join(',');
    const sets = VALUE_COLS.map(q).map((c) => `${c}=EXCLUDED.${c}`).join(',');
    await client.query(
      `INSERT INTO "indicator_values" (${cols}) VALUES ${placeholders}
       ON CONFLICT (${q('indexId')},${q('tradeDate')}) DO UPDATE SET ${sets}, "updatedAt"=now()`,
      values,
    );
  }
}

async function applyStates(client, indexId, states) {
  for (const batch of chunk(states, 300)) {
    const values = [];
    const placeholders = batch.map((st, i) => {
      const b = i * 4;
      values.push(indexId, st.date, st.stateKey, JSON.stringify(st.basis));
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4}::jsonb)`;
    }).join(',');
    await client.query(
      `INSERT INTO "indicator_states" (${q('indexId')},${q('tradeDate')},${q('stateKey')},${q('basis')}) VALUES ${placeholders}
       ON CONFLICT (${q('indexId')},${q('tradeDate')}) DO UPDATE SET ${q('stateKey')}=EXCLUDED.${q('stateKey')}, ${q('basis')}=EXCLUDED.${q('basis')}, "updatedAt"=now()`,
      values,
    );
  }
}

async function applySignals(client, indexId, signals) {
  // 删除不再成立的信号
  const keys = new Set(signals.map((s) => `${s.date}|${s.type}`));
  const existing = (await client.query(
    `SELECT "id","tradeDate","type" FROM "indicator_signals" WHERE ${q('indexId')}=$1`, [indexId],
  )).rows.filter((e) => !keys.has(`${dstr(e.tradeDate)}|${e.type}`));
  for (const e of existing) {
    await client.query(`DELETE FROM "indicator_signals" WHERE ${q('id')}=$1`, [e.id]);
  }
  for (const batch of chunk(signals, 300)) {
    const values = [];
    const placeholders = batch.map((s, i) => {
      const b = i * 5;
      values.push(indexId, s.date, s.type, s.direction, s.basis);
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`;
    }).join(',');
    await client.query(
      `INSERT INTO "indicator_signals" (${q('indexId')},${q('tradeDate')},${q('type')},${q('direction')},${q('basis')}) VALUES ${placeholders}
       ON CONFLICT (${q('indexId')},${q('tradeDate')},${q('type')}) DO UPDATE SET ${q('direction')}=EXCLUDED.${q('direction')}, ${q('basis')}=EXCLUDED.${q('basis')}, "updatedAt"=now()`,
      values,
    );
  }
}

main().catch((e) => {
  console.error('回填失败:', e);
  process.exit(1);
});
