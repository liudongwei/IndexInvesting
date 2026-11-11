#!/usr/bin/env node
/**
 * 一次性回填：simulation_positions.total_sell（累计卖出所得）并据此重算 avg_cost
 *
 * 背景：「动态成本」功能上线前，卖出不调整 avg_cost/total_sell。
 * 已有持仓行的 total_sell 默认为 0，需要按本仓位行生命周期内的卖出流水补数：
 * 只统计本行创建之后的 SELL 流水（清仓删除行之前的卖出属于上一段仓位，
 * 与当前行无关；重新买入会新建行，重新计成本）。
 *
 * 公式（券商口径）：avg_cost = (total_cost − total_sell) / quantity
 *
 * 用法（在项目根目录执行，依赖项目 node_modules 的 pg）：
 *   node scripts/backfill-position-total-sell.js           # 干跑，仅预览
 *   node scripts/backfill-position-total-sell.js --apply   # 实际更新
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// DB 连接：process.env > 项目 .env > app.module.ts 同款默认值
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

const apply = process.argv.includes('--apply');
const round4 = (v) => Math.round((v + Number.EPSILON) * 10000) / 10000;

(async () => {
  const client = new Client(conf);
  await client.connect();
  console.log(`DB: ${conf.user}@${conf.host}:${conf.port}/${conf.database}  模式: ${apply ? 'APPLY' : 'DRY-RUN'}`);

  const positions = await client.query(
    `SELECT id, account_id, instrument_id, quantity, total_cost, avg_cost, created_at
     FROM simulation_positions
     WHERE quantity > 0
     ORDER BY created_at`,
  );
  console.log(`活跃持仓行数: ${positions.rows.length}`);

  let changed = 0;
  for (const p of positions.rows) {
    const sold = await client.query(
      `SELECT COALESCE(SUM(amount - commission), 0) AS total
       FROM simulation_trades
       WHERE account_id = $1 AND instrument_id = $2
         AND trade_type = 'SELL' AND created_at > $3`,
      [p.account_id, p.instrument_id, p.created_at],
    );
    const totalSell = Number(sold.rows[0].total);
    const totalCost = Number(p.total_cost);
    const qty = Number(p.quantity);
    const oldAvg = Number(p.avg_cost);
    const newAvg = round4((totalCost - totalSell) / qty);

    const mark =
      Math.abs(newAvg - oldAvg) < 1e-9 ? ' =' : ' ~';
    console.log(
      `  [${p.instrument_id}] qty=${qty} totalCost=${totalCost} totalSell=${totalSell}` +
        `  avgCost ${oldAvg}${mark}${newAvg}  (row ${p.id})`,
    );

    if (apply && (totalSell !== 0 || Math.abs(newAvg - oldAvg) >= 1e-9)) {
      await client.query(
        `UPDATE simulation_positions
         SET total_sell = $1, avg_cost = $2
         WHERE id = $3`,
        [totalSell, newAvg, p.id],
      );
      changed++;
    }
  }

  console.log(apply ? `已更新 ${changed} 行` : '干跑完成，未修改数据；确认后加 --apply 执行');
  await client.end();
})().catch((e) => {
  console.error('回填失败:', e.message);
  process.exit(1);
});
