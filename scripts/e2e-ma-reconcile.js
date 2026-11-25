/**
 * MA 全量重算对账:快照(tmp_ma_snapshot,重算前的 ma5/10/20/60)vs 重算后
 * 断言:ma5/10/20/60 零差异(只允许新增两列 ma120/ma250 + 新增行);
 * ma120/250 抽样与独立 SQL 窗口均值比对 ≤1e-4...实际 MA 落库精度 r2(0.01),容差 0.0051。
 */
const { createRequire } = require('module');
const req = createRequire('D:/wwwroot/index-investing/package.json');
const fs = require('fs');
const { Client } = req('pg');
const env = {};
for (const line of fs.readFileSync('D:/wwwroot/index-investing/.env', 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2]; }
const c = new Client({ host: env.DB_HOST||'localhost', port: 5432, user: env.DB_USERNAME||'postgres', password: env.DB_PASSWORD||'jack@123', database: env.DB_DATABASE||'index_investing' });
const dstr = (d) => (typeof d === 'string' ? d.slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);

(async () => {
  await c.connect();
  // 1) 快照比对(仅快照覆盖的 indexId+日期)
  const snap = (await c.query(`SELECT "indexId","tradeDate","ma5","ma10","ma20","ma60" FROM tmp_ma_snapshot`)).rows;
  let diffCount = 0, checked = 0, missing = 0;
  const diffs = [];
  for (const s of snap) {
    const cur = (await c.query(
      `SELECT "ma5","ma10","ma20","ma60" FROM "moving_averages" WHERE "indexId"=$1 AND "tradeDate"=$2`,
      [s.indexId, dstr(s.tradeDate)],
    )).rows[0];
    if (!cur) { missing++; diffs.push(`缺失 ${s.indexId} ${dstr(s.tradeDate)}`); continue; }
    checked++;
    for (const col of ['ma5','ma10','ma20','ma60']) {
      const a = s[col] === null ? null : Number(s[col]);
      const b = cur[col] === null ? null : Number(cur[col]);
      if (a === null && b === null) continue;
      if (a === null || b === null || Math.abs(a - b) > 0.0051) {
        diffCount++;
        if (diffs.length < 10) diffs.push(`${s.indexId} ${dstr(s.tradeDate)} ${col}: 快照${a} vs 现在${b}`);
      }
    }
  }
  console.log(`快照比对: 检查 ${checked} 行 × 4 列, 值差异 ${diffCount}, 行缺失 ${missing}`);
  diffs.slice(0, 10).forEach((d) => console.log('  DIFF:', d));

  // 2) ma120/250 覆盖与独立窗口均值抽样验证
  const idxs = (await c.query(`SELECT DISTINCT "indexId" FROM "moving_averages" LIMIT 5`)).rows;
  let verified = 0, bad = 0;
  for (const row of idxs) {
    const dates = (await c.query(
      `SELECT "tradeDate","ma120","ma250" FROM "moving_averages" WHERE "indexId"=$1 AND "ma120" IS NOT NULL ORDER BY "tradeDate" DESC LIMIT 3`, [row.indexId],
    )).rows;
    for (const d of dates) {
      const ds = dstr(d.tradeDate);
      const win120 = (await c.query(
        `SELECT ROUND(AVG("closePrice")::numeric,2) AS v FROM (SELECT "closePrice" FROM "index_histories" WHERE "indexId"=$1 AND "tradeDate"<=$2 ORDER BY "tradeDate" DESC LIMIT 120) t`, [row.indexId, ds],
      )).rows[0].v;
      const win250 = (await c.query(
        `SELECT ROUND(AVG("closePrice")::numeric,2) AS v FROM (SELECT "closePrice" FROM "index_histories" WHERE "indexId"=$1 AND "tradeDate"<=$2 ORDER BY "tradeDate" DESC LIMIT 250) t`, [row.indexId, ds],
      )).rows[0].v;
      const e120 = Math.abs(Number(win120) - Number(d.ma120));
      const e250 = d.ma250 === null ? null : Math.abs(Number(win250) - Number(d.ma250));
      const ok120 = e120 <= 0.0051;
      const ok250 = e250 === null || e250 <= 0.0051;
      if (ok120 && ok250) verified++; else { bad++; console.log(`  BAD ${row.indexId} ${ds}: ma120 ${d.ma120} vs ${win120}(e=${e120}), ma250 ${d.ma250} vs ${win250}(e=${e250})`); }
    }
  }
  console.log(`MA120/250 独立窗口验证: 通过 ${verified}, 失败 ${bad}`);
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
