/* P2 接口冒烟测试:公开 GET、结构、NaN 泄漏、r4、asOfDate、区间裁剪、404、空响应 */
const { createRequire } = require('module');
const req = createRequire(require('path').join(__dirname, '..', 'package.json'));
const fs = require('fs');
const { Client } = req('pg');
const env = {};
for (const line of fs.readFileSync(require('path').join(__dirname, '..', '.env'),'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2]; }
const http = require('http');
function get(path) {
  return new Promise((resolve, reject) => {
    http.get({host:'localhost',port:3100,path,timeout:30000}, res => {
      let b=''; res.on('data',d=>b+=d); res.on('end',()=>resolve({code:res.statusCode, body:b}));
    }).on('error', reject);
  });
}
async function freshClient() {
  const c = new Client({ host: env.DB_HOST||'localhost', port: 5432, user: env.DB_USERNAME||'postgres', password: env.DB_PASSWORD||'jack@123', database: env.DB_DATABASE||'index_investing' });
  await c.connect();
  return c;
}
(async () => {
  const c = await freshClient();
  const idx = (await c.query('SELECT "id","name" FROM "indices" WHERE "name" LIKE \'%沪深300%\' LIMIT 1')).rows[0];
  const noData = (await c.query('SELECT i."id" FROM "indices" i LEFT JOIN "indicator_values" v ON v."indexId"=i."id" WHERE v."id" IS NULL LIMIT 1')).rows[0];
  await c.end();

  const r1 = await get('/api/indicators/' + idx.id + '?range=1y');
  console.log('无token GET:', r1.code, '(期望 200)');
  const j = JSON.parse(r1.body);
  const assert = (cond, msg) => console.log((cond ? 'PASS' : 'FAIL'), msg);
  assert(j.indexId === idx.id && j.name === idx.name, 'indexId/name 正确 (' + j.name + ')');
  assert(j.range === '1y', 'range=' + j.range);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(j.asOfDate), 'asOfDate=' + j.asOfDate + ' 格式 YYYY-MM-DD');
  assert(j.candles.length > 0, 'candles ' + j.candles.length + ' 根');
  const n = j.candles.length;
  const arrays = {
    'ma.ma20': j.overlays.ma.ma20, 'ma.ma60': j.overlays.ma.ma60, 'ma.ma120': j.overlays.ma.ma120, 'ma.ma250': j.overlays.ma.ma250,
    'boll.mid': j.overlays.boll.mid, 'boll.upper': j.overlays.boll.upper,
    'macd.dif': j.subcharts.macd.dif, 'adx.adx': j.subcharts.adx.adx, 'obv.obv': j.subcharts.obv.obv,
    'volume.vma5': j.subcharts.volume.vma5, 'volume.volumeRatio': j.subcharts.volume.volumeRatio,
    'optional.rsi': j.optional.rsi, 'optional.cmf': j.optional.cmf, 'optional.bias20': j.optional.bias20,
  };
  for (const [k, arr] of Object.entries(arrays)) {
    assert(Array.isArray(arr) && arr.length === n, k + ' 等长 ' + (arr ? arr.length : 'undefined') + ' == ' + n);
  }
  assert(j.state && j.state.key && j.state.label && Array.isArray(j.state.basis), 'state=' + (j.state ? j.state.key + '/' + j.state.label : 'null') + ' basis ' + (j.state && j.state.basis ? j.state.basis.length : 0) + ' 条');
  assert(Array.isArray(j.signals) && j.signals.length > 0 && j.signals.length <= 30, 'signals ' + j.signals.length + ' 条(≤30)');
  assert(j.disclaimer.indexOf('不构成投资建议') >= 0, 'disclaimer 在位');
  assert(!/NaN|-?Infinity/.test(r1.body), '响应无 NaN/Infinity 泄漏');
  const allDatesOk = j.candles.every(x => /^\d{4}-\d{2}-\d{2}$/.test(x.date));
  assert(allDatesOk, '全部 candle 日期格式 YYYY-MM-DD');
  const r4ok = j.subcharts.macd.dif.every(v => v === null || Math.abs(Number(v) - Number(Number(v).toFixed(4))) < 1e-9);
  assert(r4ok, '数值 r4 舍入');
  assert(j.candles[n-1].date === j.asOfDate, '最新K线 ' + j.candles[n-1].date + ' == asOfDate');

  const rAll = JSON.parse((await get('/api/indicators/' + idx.id + '?range=all')).body);
  const r3m = JSON.parse((await get('/api/indicators/' + idx.id + '?range=3m')).body);
  assert(rAll.candles.length > r3m.candles.length && r3m.candles.length > 50, '区间裁剪: all=' + rAll.candles.length + ' 3m=' + r3m.candles.length);
  const r404 = await get('/api/indicators/00000000-0000-0000-0000-000000000000');
  assert(r404.code === 404, '不存在指数 → ' + r404.code + ' (期望 404)');
  if (noData) {
    const rEmpty = await get('/api/indicators/' + noData.id);
    const je = JSON.parse(rEmpty.body);
    assert(rEmpty.code === 200 && je.candles.length === 0 && (je.message || '').length > 0, '无指标数据指数 → 200 空响应, message=' + (je.message || '').slice(0, 40));
  }
  console.log('\n状态(当日):', j.state.key, '| 依据:', JSON.stringify(j.state.basis));
  console.log('最近3条信号:', JSON.stringify(j.signals.slice(0, 3).map(x => ({ date: x.date, type: x.type, direction: x.direction }))));
})().catch(e => { console.error(e); process.exit(1); });
