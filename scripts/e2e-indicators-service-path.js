/* 服务路径重算测试:删恒生指数三表数据 → cron 手动执行 → 与删除前值对账 */
const { createRequire } = require('module');
const req = createRequire(require('path').join(__dirname, '..', 'package.json'));
const fs = require('fs');
const { Client } = req('pg');
const http = require('http');
const env = {};
for (const line of fs.readFileSync('D:/wwwroot/index-investing/.env','utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2]; }
function call(path, method) {
  return new Promise((resolve,reject)=>{
    const r = http.request({host:'localhost',port:3100,path,method,headers:{'Authorization':'Bearer '+fs.readFileSync(process.env.LOCALAPPDATA+'/Temp/admin-token.txt','utf8').trim()},timeout:180000}, res=>{
      let b=''; res.on('data',d=>b+=d); res.on('end',()=>resolve({code:res.statusCode,body:b}));
    }); r.on('error',reject); r.end();
  });
}
const dstr = (d) => { if (typeof d === 'string') return d.slice(0,10); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
(async () => {
  const c = new Client({ host: env.DB_HOST||'localhost', port: 5432, user: env.DB_USERNAME||'postgres', password: env.DB_PASSWORD||'jack@123', database: env.DB_DATABASE||'index_investing' });
  await c.connect();
  const idx = (await c.query('SELECT "id","name" FROM "indices" WHERE "name" LIKE \'%恒生指数%\' LIMIT 1')).rows[0];
  const before = (await c.query('SELECT "tradeDate","macdDif","adx","rsi","cmf","obv","hv20" FROM "indicator_values" WHERE "indexId"=$1 ORDER BY "tradeDate" ASC', [idx.id])).rows;
  const beforeStates = (await c.query('SELECT count(*)::int n, count(DISTINCT "stateKey")::int d FROM "indicator_states" WHERE "indexId"=$1', [idx.id])).rows[0];
  const beforeSignals = (await c.query('SELECT count(*)::int n FROM "indicator_signals" WHERE "indexId"=$1', [idx.id])).rows[0];
  console.log(`删除前: 值行 ${before.length}, 状态 ${beforeStates.n}行/${beforeStates.d}态, 信号 ${beforeSignals.n}`);
  await c.query('DELETE FROM "indicator_values" WHERE "indexId"=$1', [idx.id]);
  await c.query('DELETE FROM "indicator_states" WHERE "indexId"=$1', [idx.id]);
  await c.query('DELETE FROM "indicator_signals" WHERE "indexId"=$1', [idx.id]);
  const r = await call('/api/admin/cron-configs/indicatorBatchHkStock/run', 'POST');
  console.log('cron 执行:', r.code, r.body.slice(0,120));
  const after = (await c.query('SELECT "tradeDate","macdDif","adx","rsi","cmf","obv","hv20" FROM "indicator_values" WHERE "indexId"=$1 ORDER BY "tradeDate" ASC', [idx.id])).rows;
  const afterStates = (await c.query('SELECT count(*)::int n, count(DISTINCT "stateKey")::int d FROM "indicator_states" WHERE "indexId"=$1', [idx.id])).rows[0];
  const afterSignals = (await c.query('SELECT count(*)::int n FROM "indicator_signals" WHERE "indexId"=$1', [idx.id])).rows[0];
  console.log(`重算后: 值行 ${after.length}, 状态 ${afterStates.n}行/${afterStates.d}态, 信号 ${afterSignals.n}`);
  let checked = 0, bad = 0;
  if (before.length !== after.length) { console.log('行数不一致!'); bad++; }
  for (let i = 0; i < Math.min(before.length, after.length); i++) {
    for (const col of ['macdDif','adx','rsi','cmf','obv','hv20']) {
      checked++;
      const a = before[i][col] === null ? null : Number(before[i][col]);
      const b = after[i][col] === null ? null : Number(after[i][col]);
      if (a === null && b === null) continue;
      if (a === null || b === null || Math.abs(a - b) > 1e-4) { bad++; if (bad < 6) console.log(`  ✗ ${dstr(before[i].tradeDate)} ${col}: ${a} vs ${b}`); }
    }
  }
  console.log(`服务路径 vs 回填脚本对账: 检查 ${checked} 项, 不一致 ${bad}`);
  await c.end();
  process.exit(bad === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
