/**
 * 宏观看板数据源（纯函数，无 Nest 依赖；Node 18+ global fetch）
 * 服务端部署于新加坡，时区 Asia/Shanghai。所有接口的可达性已实测：
 *   ✅ 新浪 hq/K线、腾讯 qt（gz 全球指数）、中债 API、美财政部 TextView
 *   ⚠️ 东财 push2/push2his 在 SG 被连接级拦截 —— 采集失败即抛错，由上层按“方案B 每日硬重试”处理
 * 注意：每个点子的 date 一律取数据源自己的 session 日期，不是采集执行日期。
 */
export interface MacroPoint {
  metric: string;
  date: string; // YYYY-MM-DD
  value: number;
  source: string;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function todayCST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

async function getText(url: string, headers: Record<string, string> = {}, timeoutMs = 25000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, ...headers },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return await res.text();
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error(`timeout: ${url}`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

async function getGBKText(url: string, headers: Record<string, string> = {}, timeoutMs = 25000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, ...headers },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    const buf = await res.arrayBuffer();
    return new TextDecoder('gbk').decode(buf);
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error(`timeout: ${url}`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

function parseSinaHq(text: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/var hq_str_(\w+)="([^"]*)"/);
    if (m && m[1] && typeof m[2] === 'string') out[m[1]] = m[2].split(',');
  }
  return out;
}

function post(url: string, body: string, headers: Record<string, string>): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  return fetch(url, {
    method: 'POST',
    body,
    headers: { 'User-Agent': UA, ...headers },
    signal: ctrl.signal,
  })
    .then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
      return await r.text();
    })
    .catch((e: any) => {
      if (e?.name === 'AbortError') throw new Error(`timeout: ${url}`);
      throw e;
    })
    .finally(() => clearTimeout(t));
}

/* ================= 日度快照（每日采集） ================= */

/** 新浪外汇：USDCNH / USDJPY / EURUSD（字段：3=现价, 末位=日期） */
export async function fetchSinaFxDaily(): Promise<MacroPoint[]> {
  const text = await getGBKText('https://hq.sinajs.cn/list=fx_susdcnh,fx_susdjpy,fx_seurusd', {
    Referer: 'https://finance.sina.com.cn',
  });
  const q = parseSinaHq(text);
  const map: [string, string][] = [
    ['fx_susdcnh', 'usdcnh'],
    ['fx_susdjpy', 'usd_jpy'],
    ['fx_seurusd', 'eurusd'],
  ];
  const pts: MacroPoint[] = [];
  for (const [code, metric] of map) {
    const f = q[code];
    if (!f || !f[0]) continue;
    const value = parseFloat(f[3] ?? '');
    const date = f[f.length - 1] ?? '';
    if (isNaN(value) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    pts.push({ metric, date, value, source: 'sina' });
  }
  return pts;
}

/** 新浪 COMEX 黄金期货 hf_GC（字段：0=现价, 13=日期） */
export async function fetchSinaGoldDaily(): Promise<MacroPoint[]> {
  const text = await getGBKText('https://hq.sinajs.cn/list=hf_GC', {
    Referer: 'https://finance.sina.com.cn',
  });
  const f = parseSinaHq(text)['hf_GC'];
  if (!f || !f[0]) return [];
  const value = parseFloat(f[0]);
  // hf_* 字段位置因品种而异，直接扫描找日期字段
  const date = f.find((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)) || '';
  if (isNaN(value) || !date) return [];
  return [{ metric: 'gold_usd', date, value, source: 'sina' }];
}

/** 腾讯全球指数 gzN225 日经225（~分隔：2=session时间, 3=点位）——比新浪 int_nikkei 可靠（后者吐陈旧缓存） */
export async function fetchTencentNikkeiDaily(): Promise<MacroPoint[]> {
  const text = await getGBKText('https://qt.gtimg.cn/q=gzN225');
  const m = text.match(/v_gzN225="([^"]*)"/);
  if (!m) return [];
  const f = m[1].split('~');
  const value = parseFloat(f[3] ?? '');
  const date = (f[2] ?? '').slice(0, 10);
  if (isNaN(value) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  return [{ metric: 'nikkei225', date, value, source: 'tencent' }];
}

function parseChinaBond(html: string, date: string): MacroPoint[] {
  // 中债响应：<table> 里有多行曲线。表头期限是拆开的单元格（"30" + "年"），
  // 不能按 "30年" 整串匹配。数据行「中债国债收益率曲线」的数值列按固定期限梯队
  // [隔夜,3月,6月,1年,3年,5年,7年,10年,30年] 排列，30年 = 末位数值，10年 = 倒数第二。
  const trs = html.match(/<tr[\s\S]*?<\/tr>/g) || [];
  for (const tr of trs) {
    if (!tr.includes('中债国债收益率曲线')) continue;
    const nums = (tr.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [])
      .map((c) => c.replace(/<[^>]+>/g, '').trim())
      .filter((t) => /^\d+(\.\d+)?$/.test(t))
      .map(Number);
    if (nums.length < 2) continue;
    const v30 = nums[nums.length - 1];
    const v10 = nums[nums.length - 2];
    if (isNaN(v30)) continue;
    const pts: MacroPoint[] = [{ metric: 'cn_30y_yield', date, value: v30, source: 'chinabond' }];
    // 顺带存 10 年曲线作参考（不展示，备用）
    if (!isNaN(v10)) pts.push({ metric: 'cn_10y_yield', date, value: v10, source: 'chinabond' });
    return pts;
  }
  return [];
}

async function chinabondOn(date: string): Promise<MacroPoint[]> {
  const html = await post(
    `https://yield.chinabond.com.cn/cbweb-pbc-web/pbc/queryGjqxInfo?&workTime=${date}&locale=cn_ZH`,
    '',
    { Referer: 'https://yield.chinabond.com.cn/cbweb-pbc-web/pbc/more' },
  );
  return parseChinaBond(html, date);
}

/** 中债 30 年国债收益率（当日为空则回退，最多 10 天） */
export async function fetchChinaBondDaily(): Promise<MacroPoint[]> {
  const d = new Date();
  for (let i = 0; i < 10; i++) {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(
      new Date(d.getTime() - i * 86400000),
    );
    try {
      const pts = await chinabondOn(date);
      if (pts.length) return pts;
    } catch {
      /* 网络抖动则停止回退 */
      break;
    }
  }
  return [];
}

/** 美财政部日收益率曲线 CSV（每年一个请求，列头含 "10 Yr"，行序新→旧） */
function parseTreasuryCsv(text: string): MacroPoint[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = (lines[0].match(/"[^"]+"|[^,]+/g) || []).map((s) => s.replace(/^"|"$/g, '').trim());
  const col10 = header.findIndex((c) => /^10\s*Yr$/i.test(c));
  if (col10 < 0) return [];
  const pts: MacroPoint[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    const m = (cells[0] || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) continue;
    const v = parseFloat(cells[col10]);
    if (isNaN(v)) continue;
    pts.push({ metric: 'us_10y_yield', date: `${m[3]}-${m[1]}-${m[2]}`, value: v, source: 'treasury' });
  }
  pts.sort((a, b) => a.date.localeCompare(b.date));
  return pts;
}

async function fetchTreasuryYearCsv(year: number): Promise<MacroPoint[]> {
  const url =
    `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all` +
    `?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`;
  let text = '';
  let lastErr: any;
  for (let i = 0; i < 3; i++) {
    try {
      text = await getText(url);
      if (text.trim().length > 100) break;
      text = '';
    } catch (e) {
      lastErr = e;
    }
    await sleep(3000);
  }
  if (!text) throw lastErr || new Error(`treasury csv empty for ${year}`);
  return parseTreasuryCsv(text);
}

/** 美财政部日度收益率曲线（CSV，按年一个请求；滞后约 1 个交易日） */
export async function fetchUSTreasuryDaily(): Promise<MacroPoint[]> {
  const year = parseInt(todayCST().slice(0, 4), 10);
  const all = await fetchTreasuryYearCsv(year);
  return all.slice(-3); // 日采只取最近几行兜底
}

export async function fetchUSTreasuryRange(fromYear: number, toYear: number): Promise<MacroPoint[]> {
  const pts: MacroPoint[] = [];
  for (let y = fromYear; y <= toYear; y++) {
    pts.push(...(await fetchTreasuryYearCsv(y)));
    await sleep(1000);
  }
  pts.sort((a, b) => a.date.localeCompare(b.date));
  return pts;
}

/** 新浪美元指数 DINIW（实时快照；字段：1=现价，日期字段扫描取得） */
export async function fetchSinaDxyDaily(): Promise<MacroPoint[]> {
  const text = await getGBKText('https://hq.sinajs.cn/list=DINIW', {
    Referer: 'https://finance.sina.com.cn',
  });
  const f = parseSinaHq(text)['DINIW'];
  if (!f || !f[0]) return [];
  const value = parseFloat(f[1] ?? '');
  const date = f.find((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)) || '';
  if (isNaN(value) || !date) return [];
  return [{ metric: 'dxy', date, value, source: 'sina' }];
}

/**
 * frankfurter（ECB 参考汇率，SG 可达）区间历史：usd_jpy、eurusd
 * 注：ECB 参考价与市场价存在极小偏差；东财恢复后其K线会覆盖同区间（更贴近行情价）。
 */
export async function rangeFrankfurter(from: string, to: string): Promise<MacroPoint[]> {
  const url = `https://api.frankfurter.dev/v1/${from}..${to}?base=USD&symbols=JPY,EUR`;
  let text = '';
  let lastErr: any;
  for (let i = 0; i < 3; i++) {
    try {
      text = await getText(url);
      break;
    } catch (e) {
      lastErr = e;
      await sleep(2000);
    }
  }
  if (!text) throw lastErr || new Error('frankfurter fetch failed');
  const d = JSON.parse(text);
  const rates: Record<string, Record<string, number>> = d?.rates || {};
  const pts: MacroPoint[] = [];
  for (const [date, r] of Object.entries(rates)) {
    if (r && typeof r.JPY === 'number') pts.push({ metric: 'usd_jpy', date, value: r.JPY, source: 'ecb' });
    if (r && typeof r.EUR === 'number' && r.EUR !== 0)
      pts.push({ metric: 'eurusd', date, value: 1 / r.EUR, source: 'ecb' });
  }
  pts.sort((a, b) => a.date.localeCompare(b.date));
  return pts;
}

/** 新浪 A 股 K线：511380 博时转债ETF（日采取最后一根） */
export async function fetchSinaKline511380Daily(): Promise<MacroPoint[]> {
  const pts = await rangeSinaKline511380(10);
  return pts.slice(-1);
}

/** 新浪 K线全量（datalen 上限 1023 ≈ 4.2 年） */
export async function rangeSinaKline511380(datalen = 1023): Promise<MacroPoint[]> {
  const text = await getText(
    `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=sh511380&scale=240&ma=no&datalen=${datalen}`,
    { Referer: 'https://finance.sina.com.cn' },
  );
  const rows: any[] = JSON.parse(text || '[]');
  return rows.map((r) => ({
    metric: 'etf_511380',
    date: String(r.day),
    value: parseFloat(r.close),
    source: 'sina',
  }));
}

/* ================= 东财（SG 端被拦，方案B：失败即抛，上层每日重试） ================= */

export const EASTMONEY_SECIDS: Record<string, string> = {
  dxy: '100.UDI', // 美元指数
  sensex: '100.SENSEX',
  nikkei225: '100.N225',
  gold_usd: '101.GC00Y',
  usdcnh: '133.USDCNH',
  usd_jpy: '133.USDJPY', // 需 discover 确认
  eurusd: '133.EURUSD', // 需 discover 确认
};

export class EastmoneyBlockedError extends Error {
  constructor() {
    super('eastmoney unreachable (connection-level block)');
    this.name = 'EastmoneyBlockedError';
  }
}

async function emKline(secid: string, lmt: number): Promise<{ date: string; close: string }[]> {
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1&fields2=f51,f53&klt=101&fqt=1&end=20500101&lmt=${lmt}`;
  let lastErr: any;
  for (let i = 0; i < 3; i++) {
    try {
      const text = await getText(url, { Referer: 'https://quote.eastmoney.com/' });
      const d = JSON.parse(text);
      const klines: string[] = d?.data?.klines || [];
      return klines.map((s) => {
        const [date, close] = s.split(',');
        return { date, close };
      });
    } catch (e) {
      lastErr = e;
      await sleep(3000);
    }
  }
  throw new EastmoneyBlockedError();
}

/** 东财日度：取各 secid 最后一根 K 线（日采用） */
export async function fetchEastmoneyDaily(): Promise<MacroPoint[]> {
  const pts: MacroPoint[] = [];
  for (const [metric, secid] of Object.entries(EASTMONEY_SECIDS)) {
    const bars = await emKline(secid, 5);
    const last = bars[bars.length - 1];
    if (!last) continue;
    pts.push({ metric, date: last.date, value: parseFloat(last.close), source: 'eastmoney' });
  }
  return pts;
}

/** 东财区间回填（按 from 推算 lmt，避免无谓的大响应） */
export async function rangeEastmoney(metric: string, from: string): Promise<MacroPoint[]> {
  const secid = EASTMONEY_SECIDS[metric];
  if (!secid) throw new Error(`no eastmoney secid for ${metric}`);
  const days = Math.max(1, Math.round((Date.now() - new Date(from + 'T00:00:00Z').getTime()) / 86400000));
  const lmt = Math.min(100000, Math.ceil(days * 1.6) + 30);
  const bars = await emKline(secid, lmt);
  return bars
    .filter((b) => b.date >= from)
    .map((b) => ({ metric, date: b.date, value: parseFloat(b.close), source: 'eastmoney' }));
}

/** 东财最早日期（探测统一起点用） */
export async function probeEastmoneyEarliest(metric: string): Promise<string | null> {
  const secid = EASTMONEY_SECIDS[metric];
  if (!secid) return null;
  const bars = await emKline(secid, 100000);
  return bars.length ? bars[0].date : null;
}

/** 中债 30Y 最早可用日期（二分探测） */
export async function probeChinaBondEarliest(): Promise<string | null> {
  const has = async (date: string): Promise<boolean> => {
    try {
      return (await chinabondOn(date)).length > 0;
    } catch {
      return false;
    }
  };
  let lo = '2015-01-02';
  let hi = '2024-09-30';
  const hasR = async (date: string): Promise<boolean> => {
    for (let i = 0; i < 3; i++) if (await has(date)) return true;
    await sleep(1000);
    return false;
  };
  if (!(await hasR(hi))) {
    // 锚点缺失则从已知有的日期往回找
    for (let i = 0; i < 400 && !(await hasR(hi)); i++) {
      hi = new Date(new Date(hi).getTime() - 86400000).toISOString().slice(0, 10);
    }
    if (!(await hasR(hi))) return null;
  }
  while (lo < hi) {
    const mid = new Date(new Date(lo).getTime() + (new Date(hi).getTime() - new Date(lo).getTime()) / 2).toISOString().slice(0, 10);
    if (await hasR(mid)) hi = mid;
    else lo = new Date(new Date(mid).getTime() + 86400000).toISOString().slice(0, 10);
    await sleep(500);
  }
  return hi;
}

const isWeekday = (date: string): boolean => {
  const dow = new Date(date + 'T00:00:00Z').getUTCDay();
  return dow >= 1 && dow <= 5;
};

/**
 * 中债按日拉取（限流防护）：
 *  - 基础间隔 700ms（实测 0.38s/req 时会丢 ~35% 的交易日）
 *  - 工作日返回空 → 视为可能被限流，3s 后重试一次
 *  - exclude：断点续跑时跳过库中已有的日期
 */
export async function rangeChinaBond(from: string, to: string, exclude?: Set<string>): Promise<MacroPoint[]> {
  const pts: MacroPoint[] = [];
  let retried = 0;
  let throttled = 0;
  const d = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  while (d <= end) {
    const date = d.toISOString().slice(0, 10);
    d.setTime(d.getTime() + 86400000);
    if (exclude && exclude.has(date)) continue;
    let got: MacroPoint[] = [];
    try {
      got = await chinabondOn(date);
    } catch {
      got = [];
    }
    if (!got.length && isWeekday(date)) {
      throttled++;
      await sleep(3000);
      try {
        got = await chinabondOn(date);
      } catch {
        got = [];
      }
      if (got.length) retried++;
    }
    pts.push(...got);
    await sleep(700);
  }
  if (throttled) console.log(`  中债：${throttled} 个工作日首查为空，重试补回 ${retried} 天`);
  return pts;
}

/** 美债区间（年循环） */
export async function rangeUSTreasury(from: string, to: string): Promise<MacroPoint[]> {
  const fy = parseInt(from.slice(0, 4), 10);
  const ty = parseInt(to.slice(0, 4), 10);
  const pts = await fetchUSTreasuryRange(fy, ty);
  return pts.filter((p) => p.date >= from && p.date <= to);
}

/** 东财 secid 发现（clist 按市场枚举，供回填 FX secid 确认） */
export async function discoverEastmoneySecids(names: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const m of [100, 133]) {
    const text = await getText(
      `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=200&fs=m:${m}&fields=f12,f14`,
      { Referer: 'https://quote.eastmoney.com/' },
    );
    const d = JSON.parse(text);
    const diff: Record<string, any> = d?.data?.diff || {};
    for (const k of Object.keys(diff)) {
      const it = diff[k];
      if (names.some((n) => it?.f14?.includes(n))) out[it.f14] = `${m}.${it.f12}`;
    }
    await sleep(2000);
  }
  return out;
}
