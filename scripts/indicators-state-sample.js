/** 状态回放抽样:从沪深300全历史抽 10 天(覆盖不同状态),打印 K线/指标上下文 + 状态判定,供人工核验 */
const { createRequire } = require('module');
const req = createRequire(require('path').join(__dirname, '..', 'package.json'));
const fs = require('fs');
const { Client } = req('pg');
const env = {};
for (const line of fs.readFileSync(require('path').join(__dirname, '..', '.env'),'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2]; }
const c = new Client({ host: env.DB_HOST||'localhost', port: 5432, user: env.DB_USERNAME||'postgres', password: env.DB_PASSWORD||'jack@123', database: env.DB_DATABASE||'index_investing' });
const dstr = (d) => {
  if (typeof d === 'string') return d.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
(async () => {
  await c.connect();
  const idx = (await c.query('SELECT "id" FROM "indices" WHERE "name" LIKE \'%沪深300%\' LIMIT 1')).rows[0];
  const h = (await c.query('SELECT "tradeDate","openPrice","highPrice","lowPrice","closePrice","volume" FROM "index_histories" WHERE "indexId"=$1 ORDER BY "tradeDate" ASC', [idx.id])).rows;
  const states = (await c.query('SELECT "tradeDate","stateKey","basis" FROM "indicator_states" WHERE "indexId"=$1 ORDER BY "tradeDate" ASC', [idx.id])).rows;
  const vals = (await c.query('SELECT "tradeDate","macdDif","adx","volumeRatio","rsi","bollLower","bollUpper" FROM "indicator_values" WHERE "indexId"=$1', [idx.id])).rows;
  const mas = (await c.query('SELECT "tradeDate","ma20","ma60" FROM "moving_averages" WHERE "indexId"=$1', [idx.id])).rows;
  await c.end();

  const dateState = new Map(states.map((s) => [dstr(s.tradeDate), s]));
  const dateVal = new Map(vals.map((v) => [dstr(v.tradeDate), v]));
  const dateMa = new Map(mas.map((m) => [dstr(m.tradeDate), m]));

  // 按状态分层抽样:每种状态抽最多 2 天(数据>=60根的)
  const byState = {};
  for (const s of states) {
    const ds = dstr(s.tradeDate);
    if (h.findIndex((x) => dstr(x.tradeDate) === ds) < 59) continue;
    (byState[s.stateKey] = byState[s.stateKey] || []).push(ds);
  }
  const picks = [];
  for (const [k, arr] of Object.entries(byState)) {
    const step = Math.max(1, Math.floor(arr.length / 2));
    picks.push([k, arr[Math.floor(arr.length / 3)], arr[arr.length - Math.min(step, Math.max(1, Math.floor(arr.length / 5))) - 1]].slice(0, 3));
  }
  const flat = [...new Set(picks.flat().slice(1))].sort();
  const finalPicks = [];
  const seen = new Set();
  const perStateCount = {};
  for (const ds of flat) {
    const k = dateState.get(ds).stateKey;
    if ((perStateCount[k] || 0) >= 2) continue;
    perStateCount[k] = (perStateCount[k] || 0) + 1;
    finalPicks.push(ds);
    if (finalPicks.length >= 12) break;
  }

  const hIdx = new Map(h.map((x, i) => [dstr(x.tradeDate), i]));
  console.log('沪深300 状态回放抽样(人工核验用):\n');
  for (const ds of finalPicks) {
    const i = hIdx.get(ds);
    const row = h[i];
    const st = dateState.get(ds);
    const v = dateVal.get(ds);
    const ma = dateMa.get(ds);
    const prev = h[i - 1];
    const pct = ((Number(row.closePrice) - Number(prev.closePrice)) / Number(prev.closePrice) * 100).toFixed(2);
    console.log(`【${ds}】${st.stateKey}`);
    console.log(`  K线: O ${Number(row.openPrice).toFixed(2)} H ${Number(row.highPrice).toFixed(2)} L ${Number(row.lowPrice).toFixed(2)} C ${Number(row.closePrice).toFixed(2)} (${pct > 0 ? '+' : ''}${pct}%) 量 ${v.volumeRatio ? Number(v.volumeRatio).toFixed(2) + '倍(量比)' : '-'}`);
    console.log(`  MA20 ${ma.ma20} MA60 ${ma.ma60} | DIF ${v.macdDif ? Number(v.macdDif).toFixed(2) : '-'} ADX ${v.adx ? Number(v.adx).toFixed(1) : '-'} RSI ${v.rsi ? Number(v.rsi).toFixed(1) : '-'} | BOLL下轨 ${v.bollLower ? Number(v.bollLower).toFixed(2) : '-'}`);
    console.log(`  依据: ${st.basis.join(' / ')}`);
    console.log('');
  }
})().catch(e => { console.error(e); process.exit(1); });
