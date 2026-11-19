import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MacroSeries } from './entities/macro-series.entity';
import { MacroService } from './macro.service';
import {
  fetchSinaFxDaily,
  fetchSinaGoldDaily,
  fetchSinaDxyDaily,
  fetchTencentNikkeiDaily,
  fetchChinaBondDaily,
  fetchUSTreasuryDaily,
  fetchUSTreasuryRange,
  rangeSinaKline511380,
  rangeEastmoney,
  EastmoneyBlockedError,
  sleep,
} from './macro-sources';

export interface CollectResult {
  metric: string;
  status: 'ok' | 'failed' | 'empty';
  points: number;
  error?: string;
}

/** 东财覆盖的指标（K线历史 + 日度；SG 端被拦时每日硬重试 = 方案B） */
const EM_METRICS = ['sensex', 'dxy', 'gold_usd', 'nikkei225', 'usdcnh', 'usd_jpy', 'eurusd'];

/**
 * 宏观数据每日采集器（方案B：东财失败不阻断，记录后次日重试；启动时 catch-up 补齐缺口）
 * 定时调度已迁移至 cron-config 模块统一管理（任务名 macroDailyCollect，面板可启停/改时间/手动执行）。
 */
@Injectable()
export class MacroCollectorService {
  private readonly logger = new Logger(MacroCollectorService.name);

  constructor(
    private readonly macro: MacroService,
    @InjectRepository(MacroSeries)
    private repo: Repository<MacroSeries>,
  ) {}

  onApplicationBootstrap() {
    // 启动 catch-up（补齐停机期间的缺口，含东财失败重试）
    this.collectAll().catch((e) => this.logger.error(`collectAll failed: ${e}`));
  }

  private async maxDates(): Promise<Record<string, string>> {
    const rows = await this.repo
      .createQueryBuilder('s')
      .select('s.metric', 'metric')
      .addSelect(`to_char(MAX(s."dataDate"), 'YYYY-MM-DD')`, 'maxDate')
      .groupBy('s.metric')
      .getRawMany<{ metric: string; maxDate: string }>();
    const out: Record<string, string> = {};
    for (const r of rows) out[r.metric] = String(r.maxDate).slice(0, 10);
    return out;
  }

  /** 全量采集一轮：所有 SG 可达源 + 东财（失败仅记录，次日重试） */
  async collectAll(): Promise<CollectResult[]> {
    const results: CollectResult[] = [];
    const add = (metric: string, status: CollectResult['status'], points: number, error?: string) =>
      results.push({ metric, status, points, error });

    const maxD = await this.maxDates();

    // 1) 新浪外汇日快照（usdcnh / usd_jpy / eurusd）
    try {
      const pts = await fetchSinaFxDaily();
      if (pts.length) await this.macro.upsert(pts);
      for (const m of ['usdcnh', 'usd_jpy', 'eurusd']) {
        const got = pts.find((p) => p.metric === m);
        add(m, got ? 'ok' : 'empty', got ? 1 : 0, got ? undefined : 'sina returned no data');
      }
    } catch (e: any) {
      for (const m of ['usdcnh', 'usd_jpy', 'eurusd']) add(m, 'failed', 0, String(e?.message || e));
    }

    // 2) 新浪黄金
    try {
      const pts = await fetchSinaGoldDaily();
      if (pts.length) await this.macro.upsert(pts);
      add('gold_usd', pts.length ? 'ok' : 'empty', pts.length, pts.length ? undefined : 'sina returned no data');
    } catch (e: any) {
      add('gold_usd', 'failed', 0, String(e?.message || e));
    }

    // 3) 新浪美元指数 DINIW（东财被拦期间 dxy 的日度主源）
    try {
      const pts = await fetchSinaDxyDaily();
      if (pts.length) await this.macro.upsert(pts);
      add('dxy', pts.length ? 'ok' : 'empty', pts.length, pts.length ? undefined : 'sina DINIW returned no data');
    } catch (e: any) {
      add('dxy', 'failed', 0, String(e?.message || e));
    }

    // 4) 腾讯日经
    try {
      const pts = await fetchTencentNikkeiDaily();
      if (pts.length) await this.macro.upsert(pts);
      add('nikkei225', pts.length ? 'ok' : 'empty', pts.length, pts.length ? undefined : 'tencent returned no data');
    } catch (e: any) {
      add('nikkei225', 'failed', 0, String(e?.message || e));
    }

    // 5) 中债 30Y（当日空则自动回退，最多 10 天）
    try {
      const pts = await fetchChinaBondDaily();
      if (pts.length) await this.macro.upsert(pts);
      add('cn_30y_yield', pts.length ? 'ok' : 'empty', pts.length, pts.length ? undefined : 'chinabond empty (holiday?)');
    } catch (e: any) {
      add('cn_30y_yield', 'failed', 0, String(e?.message || e));
    }

    // 6) 美债 10Y（补缺口：从 maxDate 所在年到当前年）
    try {
      let pts = await fetchUSTreasuryDaily();
      const year = parseInt((maxD['us_10y_yield'] || '').slice(0, 4) || new Date().getFullYear().toString(), 10);
      if (year < new Date().getFullYear()) {
        pts = await fetchUSTreasuryRange(year, new Date().getFullYear());
      }
      if (pts.length) await this.macro.upsert(pts);
      add('us_10y_yield', pts.length ? 'ok' : 'empty', pts.length, pts.length ? undefined : 'treasury empty');
    } catch (e: any) {
      add('us_10y_yield', 'failed', 0, String(e?.message || e));
    }

    // 7) 可转债ETF 511380（新浪K线最后30根 catch-up）
    try {
      let pts = await rangeSinaKline511380(30);
      const md = maxD['etf_511380'];
      if (md) pts = pts.filter((p) => p.date >= md);
      if (pts.length) await this.macro.upsert(pts);
      add('etf_511380', pts.length ? 'ok' : 'empty', pts.length, pts.length ? undefined : 'sina kline empty');
    } catch (e: any) {
      add('etf_511380', 'failed', 0, String(e?.message || e));
    }

    // 8) 东财（方案B）：按“统一起点”补历史 + 日度；被拦 → 首个指标即快断，其余标记次日重试
    const floor = await this.macro.getUnifiedStart();
    if (!floor) {
      for (const m of EM_METRICS) add(m, 'empty', 0, 'no unified start yet (run backfill first)');
    } else {
      let blocked = false;
      for (const m of EM_METRICS) {
        if (blocked) {
          add(m, 'failed', 0, 'eastmoney blocked (retry next day)');
          continue;
        }
        try {
          const pts = await rangeEastmoney(m, floor);
          if (pts.length) await this.macro.upsert(pts);
          add(m, pts.length ? 'ok' : 'empty', pts.length, pts.length ? undefined : 'eastmoney no data');
          await sleep(1500);
        } catch (e: any) {
          if (e instanceof EastmoneyBlockedError) {
            blocked = true;
            add(m, 'failed', 0, 'eastmoney blocked (retry next day)');
          } else {
            add(m, 'failed', 0, String(e?.message || e));
          }
        }
      }
    }

    this.logger.log(
      `collectAll done: ${results.map((r) => `${r.metric}:${r.status}(${r.points})`).join(' ')}`,
    );
    return results;
  }
}
