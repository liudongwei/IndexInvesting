#!/usr/bin/env node
/**
 * 宏观看板历史数据一次性回填
 *
 * 数据源（按指标）：
 *   cn_30y_yield / cn_10y_yield : 中债 PBC 曲线（按日 POST，深历史 ≥2019）
 *   us_10y_yield                : 美财政部 TextView（按年 HTML，深历史）
 *   etf_511380                  : 新浪 A股K线（1023 根封顶 ≈ 2022-08 起）
 *   dxy/sensex/gold_usd/nikkei225/usdcnh/usd_jpy/eurusd : 东财 K线
 *       （东财 push2his 目前在本机与 SG 服务器均连接级被拦 → 失败时跳过并提示，
 *        这些指标将从每日采集起累积；东财恢复可达后重跑本脚本即可补齐）
 *
 * 统一起点规则（用户指定）：各指标可拿历史中的「最晚最早日期」为统一起点，
 * 其余指标也截断到该日期起同步。
 *
 * 用法（项目根目录，先 npm run build）：
 *   node scripts/backfill-macro.js                 # 干跑：探测起点 + 拉数据 + 统计，不写库
 *   node scripts/backfill-macro.js --apply         # 实际写入（自动建表 IF NOT EXISTS）
 *   node scripts/backfill-macro.js --from=2024-01-01   # 指定起点，跳过统一计算
 *
 * 目标库：本地（.env/默认）；线上执行时依赖服务器 /var/www/index_investing/.env。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

// DB 连接：process.env > 项目 .env > 默认值（与 app.module.ts 一致）
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
const fromArg = (args.find((a) => a.startsWith('--from=')) || '').replace('--from=', '');

// 拉取函数来自编译产物（先 npm run build）
const dist = path.join(__dirname, '..', 'dist', 'macro', 'macro-sources.js');
if (!fs.existsSync(dist)) {
  console.error('未找到 dist/macro/macro-sources.js —— 请先在项目根目录执行 npm run build');
  process.exit(1);
}
const src = require(dist);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const DDL = `
CREATE TABLE IF NOT EXISTS macro_series (
  id uuid PRIMARY KEY,
  metric varchar(40) NOT NULL,
  "dataDate" date NOT NULL,
  value numeric(18,6),
  source varchar(40),
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_macro_metric_date ON macro_series (metric, "dataDate");
CREATE TABLE IF NOT EXISTS macro_config (
  key varchar(50) PRIMARY KEY,
  value varchar(200) NOT NULL,
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
`;

/** 写入统一起点配置（应用侧 getUnifiedStart 优先读它） */
async function saveUnifiedStart(client, value) {
  await client.query(
    `INSERT INTO macro_config (key, value, "updatedAt") VALUES ('unified_start', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = $1, "updatedAt" = now()`,
    [value],
  );
}

/** 批量 upsert（单事务，批量 COPY 不如参数化稳妥；点数 ~万级，逐条 OK） */
async function upsertPoints(client, points) {
  const byMetric = new Map();
  for (const p of points) {
    const arr = byMetric.get(p.metric) || [];
    arr.push(p);
    byMetric.set(p.metric, arr);
  }
  let n = 0;
  for (const [metric, arr] of byMetric) {
    for (const p of arr) {
      const v = Math.round(p.value * 1e6) / 1e6;
      await client.query(
        `INSERT INTO macro_series (id, metric, "dataDate", value, source)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (metric, "dataDate")
         DO UPDATE SET value = $4, source = COALESCE($5, macro_series.source), "updatedAt" = now()`,
        [crypto.randomUUID(), metric, p.date, v, p.source || null],
      );
      n++;
    }
    log(`  upsert ${metric}: ${arr.length} 点（${arr[0].date} ~ ${arr[arr.length - 1].date}）`);
  }
  return n;
}

/** 东财可达性探测（一次小请求） */
async function eastmoneyAlive() {
  try {
    await src.rangeEastmoney('dxy', '2026-01-01');
    return true;
  } catch {
    return false;
  }
}

(async () => {
  const client = new Client(conf);
  await client.connect();

  // 1) 探测各指标可拿历史的最早日期
  log('== 探测各指标最早可拿日期 ==');
  const mins = {};

  // etf_511380：新浪K线第一根
  try {
    const rows = await src.rangeSinaKline511380(1023);
    if (rows.length) {
      mins['etf_511380'] = rows[0].date;
      log(`  etf_511380: ${rows[0].date}（${rows.length} 根，新浪封顶）`);
    }
  } catch (e) {
    log(`  etf_511380: 探测失败 ${e.message}`);
  }

  // cn_30y_yield：二分找中债最早交易日（2015~最近已知有数据的 2024-09-30）
  try {
    const eb = await src.probeChinaBondEarliest();
    if (eb) {
      mins['cn_30y_yield'] = eb;
      log(`  cn_30y_yield: ${eb}`);
    }
  } catch (e) {
    log(`  cn_30y_yield: 探测失败 ${e.message}`);
  }

  // us_10y_yield：深历史（美债日度曲线 1962 年起），取 1962 作为下限即可
  mins['us_10y_yield'] = '1962-01-02';
  log(`  us_10y_yield: 深历史（按年循环，实际起点取统一截断）`);

  // frankfurter（ECB）：usd_jpy / eurusd 深历史（1999 年起）
  try {
    const fp = await src.rangeFrankfurter('1999-01-04', '1999-01-12');
    if (fp.length) {
      mins['usd_jpy'] = '1999-01-04';
      mins['eurusd'] = '1999-01-04';
      log(`  usd_jpy/eurusd: 1999-01-04（frankfurter/ECB）`);
    }
  } catch (e) {
    log(`  frankfurter 探测失败 ${e.message}`);
  }

  // 东财系指标
  const emAlive = await eastmoneyAlive();
  if (emAlive) {
    for (const m of ['dxy', 'sensex', 'gold_usd', 'nikkei225', 'usdcnh', 'usd_jpy', 'eurusd']) {
      try {
        const first = await src.probeEastmoneyEarliest(m);
        if (first) {
          mins[m] = first;
          log(`  ${m}: ${first}（东财）`);
        }
      } catch {
        /* 单个失败跳过 */
      }
    }
  } else {
    log('  东财 push2his 不可达：dxy/sensex/gold_usd/nikkei225/usdcnh/usd_jpy/eurusd 无历史，' +
      '将从每日采集起累积（东财恢复后重跑本脚本补齐）');
  }

  // 2) 统一起点 = 各指标最早日期中的最晚者
  let unified = fromArg || null;
  if (!unified) {
    const avail = Object.values(mins).filter(Boolean);
    unified = avail.length ? avail.sort()[avail.length - 1] : '2022-01-01';
    log(`\n== 统一起点（最晚最早日期）= ${unified} ==`);
    log('  各指标最早日期: ' + Object.entries(mins).map(([k, v]) => `${k}=${v || '无'}`).join('  '));
  }

  const to = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());

  // 3) 拉取各指标 [unified, to] 序列
  log(`\n== 拉取 [${unified} ~ ${to}] ==`);
  const all = [];

  log('-- etf_511380（新浪K线）');
  try {
    const rows = (await src.rangeSinaKline511380(1023)).filter((p) => p.date >= unified);
    all.push(...rows);
  } catch (e) {
    log('  失败:', e.message);
  }

  log('-- cn_30y_yield + cn_10y_yield（中债按日，断点续跑跳过已有日期）');
  try {
    const exist = await client.query(
      `SELECT to_char("dataDate", 'YYYY-MM-DD') AS d FROM macro_series
       WHERE metric = 'cn_30y_yield' AND "dataDate" >= $1 AND "dataDate" <= $2`,
      [unified, to],
    );
    const exclude = new Set(exist.rows.map((r) => r.d));
    if (exclude.size) log(`  库中已有 ${exclude.size} 天，跳过`);
    const cb = await src.rangeChinaBond(unified, to, exclude);
    all.push(...cb);
    log(`  中债 ${cb.length} 点`);
  } catch (e) {
    log('  失败:', e.message);
  }

  log('-- us_10y_yield（美债按年）');
  try {
    const us = await src.rangeUSTreasury(unified, to);
    all.push(...us);
    log(`  美债 ${us.length} 点`);
  } catch (e) {
    log('  失败:', e.message);
  }

  log('-- usd_jpy / eurusd（frankfurter/ECB 按日）');
  try {
    const fx = await src.rangeFrankfurter(unified, to);
    all.push(...fx);
    log(`  frankfurter ${fx.length} 点`);
  } catch (e) {
    log('  失败:', e.message);
  }

  if (emAlive) {
    log('-- 东财系指标');
    for (const m of ['dxy', 'sensex', 'gold_usd', 'nikkei225', 'usdcnh', 'usd_jpy', 'eurusd']) {
      try {
        const rows = (await src.rangeEastmoney(m, unified)).filter((p) => p.date >= unified);
        all.push(...rows);
        log(`  ${m}: ${rows.length} 点`);
      } catch (e) {
        log(`  ${m}: 失败 ${e.message}`);
      }
    }
  }

  log(`\n== 合计 ${all.length} 点，涉及指标: ${[...new Set(all.map((p) => p.metric))].join(', ')} ==`);
  if (!all.length) {
    log('无数据可写，退出');
    await client.end();
    return;
  }

  if (!apply) {
    log('\n[干跑] 未写库。加 --apply 实际写入。');
    const sample = all.slice(0, 3).concat(all.slice(-3));
    log('样本: ' + JSON.stringify(sample, null, 1));
    await client.end();
    return;
  }

  log('\n== 写库（--apply）==');
  await client.query(DDL);
  await upsertPoints(client, all);
  await saveUnifiedStart(client, unified);
  log(`完成：写入 ${all.length} 点，统一起点 unified_start=${unified} 已保存到 macro_config。`);
  await client.end();
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
