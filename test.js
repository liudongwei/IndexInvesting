const fs = require("fs");
const path = require("path");
const axios = require("axios");

/**
 * 沪深300指数日K线测试 Demo
 * 数据源：东方财富、新浪、腾讯
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

// axios 实例
const httpClient = axios.create({
  timeout: 15000,
  headers: {
    "User-Agent": UA,
    "Accept": "application/json,text/plain,*/*",
    "Accept-Language": "zh-CN,zh;q=0.9",
  },
});

/**
 * 带重试的请求
 */
async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await httpClient.get(url, options);
      return res.data;
    } catch (err) {
      if (i === retries - 1) throw err;
      console.log(`  重试 ${i + 1}/${retries}...`);
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeKlines(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!row || !row.date) continue;
    map.set(row.date, {
      date: row.date,
      open: toNumber(row.open),
      high: toNumber(row.high),
      low: toNumber(row.low),
      close: toNumber(row.close),
      volume: toNumber(row.volume),
      amount: toNumber(row.amount ?? null),
    });
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 东方财富 - 改用 http 协议
 */
async function getEastmoneyKline({ limit = 100 } = {}) {
  // 改用 http 而不是 https，避免 SSL 问题
  const url = `http://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.000300&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=101&fqt=0&end=20500101&lmt=${limit}`;

  const json = await fetchWithRetry(url, {
    headers: { Referer: "http://quote.eastmoney.com/" }
  });

  const klines = json?.data?.klines;
  if (!Array.isArray(klines)) {
    throw new Error("返回格式异常：" + JSON.stringify(json).slice(0, 200));
  }

  const rows = klines.map((line) => {
    const [date, open, close, high, low, volume, amount] = String(line).split(",");
    return { date, open, high, low, close, volume, amount };
  });

  return normalizeKlines(rows);
}

/**
 * 新浪
 */
async function getSinaKline({ limit = 100 } = {}) {
  const datalen = Math.min(limit, 1023);
  const url = `https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData?symbol=sh000300&scale=240&ma=no&datalen=${datalen}`;

  const json = await fetchWithRetry(url, {
    headers: { Referer: "https://finance.sina.com.cn/" }
  });

  if (!Array.isArray(json)) {
    throw new Error("返回格式异常");
  }

  const rows = json.map((item) => ({
    date: item.day,
    open: item.open,
    high: item.high,
    low: item.low,
    close: item.close,
    volume: item.volume,
    amount: null,
  }));

  return normalizeKlines(rows);
}

/**
 * 腾讯
 */
async function getTencentKline({ limit = 100 } = {}) {
  const symbol = "sh000300";
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,${limit},qfq`;

  const json = await fetchWithRetry(url, {
    headers: { Referer: "https://gu.qq.com/" }
  });

  const klines = json?.data?.[symbol]?.day || 
                  json?.data?.[symbol]?.qfqday || [];

  if (!Array.isArray(klines)) {
    throw new Error("返回格式异常");
  }

  const rows = klines
    .map((item) => {
      if (!Array.isArray(item)) return null;
      const [date, open, close, high, low, volume] = item;
      return { date, open, high, low, close, volume, amount: null };
    })
    .filter(Boolean);

  return normalizeKlines(rows);
}

function saveJson(name, data) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = path.join(process.cwd(), `hs300_${name}_${dateStr}.json`);
  fs.writeFileSync(fileName, JSON.stringify(data, null, 2), "utf-8");
  return fileName;
}

function printResult(name, data) {
  console.log(`\n==================== ${name} ====================`);
  console.log(`获取数量：${data.length}`);
  if (!data.length) {
    console.log("没有获取到数据");
    return;
  }
  console.log(`最早日期：${data[0].date}`);
  console.log(`最新日期：${data[data.length - 1].date}`);
  console.log("\n最近5条数据：");
  console.table(data.slice(-5));
  const fileName = saveJson(name, data);
  console.log(`已保存到：${fileName}`);
}

async function runSource(name, limit) {
  const sourceMap = { eastmoney: getEastmoneyKline, sina: getSinaKline, tencent: getTencentKline };
  const fn = sourceMap[name];
  if (!fn) {
    console.error(`未知数据源：${name}`);
    process.exit(1);
  }
  try {
    const data = await fn({ limit });
    printResult(name, data);
  } catch (err) {
    console.error(`\n[${name}] 请求失败：${err.message}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const source = (args[0] || "all").toLowerCase();
  const limit = Math.max(1, Number(args[1]) || 30);

  if (source === "all") {
    await runSource("eastmoney", limit);
    await runSource("sina", limit);
    await runSource("tencent", limit);
  } else {
    await runSource(source, limit);
  }
}

main().catch((err) => {
  console.error("执行失败：", err);
  process.exit(1);
});