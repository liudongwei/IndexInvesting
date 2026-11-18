import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { MacroSeries } from './entities/macro-series.entity';
import { MacroConfig } from './entities/macro-config.entity';

export interface MetricMeta {
  metric: string;
  label: string;
  group: 'fx' | 'asia' | 'cb';
  unit: string;
  decimals: number;
  defaultSource: string;
}

/** 指标字典（看板按此渲染） */
export const METRIC_META: MetricMeta[] = [
  { metric: 'usdcnh', label: '美元/离岸人民币', group: 'fx', unit: '', decimals: 4, defaultSource: 'sina' },
  { metric: 'dxy', label: '美元指数', group: 'fx', unit: '', decimals: 2, defaultSource: 'eastmoney' },
  { metric: 'gold_usd', label: 'COMEX黄金/美元', group: 'fx', unit: '', decimals: 2, defaultSource: 'sina' },
  { metric: 'usd_jpy', label: '美元/日元', group: 'fx', unit: '', decimals: 2, defaultSource: 'sina' },
  { metric: 'eurusd', label: '欧元/美元', group: 'fx', unit: '', decimals: 4, defaultSource: 'sina' },
  { metric: 'cn_30y_yield', label: '中国30年国债收益率', group: 'fx', unit: '%', decimals: 3, defaultSource: 'chinabond' },
  { metric: 'us_10y_yield', label: '美国10年国债收益率', group: 'fx', unit: '%', decimals: 3, defaultSource: 'treasury' },
  { metric: 'nikkei225', label: '日经225', group: 'asia', unit: '', decimals: 0, defaultSource: 'tencent' },
  { metric: 'sensex', label: '孟买SENSEX', group: 'asia', unit: '', decimals: 0, defaultSource: 'eastmoney' },
  { metric: 'etf_511380', label: '可转债ETF 511380', group: 'cb', unit: '', decimals: 3, defaultSource: 'sina' },
];

export interface MetricLatest {
  metric: string;
  date: string;
  value: number;
  prevDate: string | null;
  prevValue: number | null;
  daysStale: number;
  source: string | null;
  minDate: string | null;
  hasData: boolean;
}

@Injectable()
export class MacroService {
  constructor(
    @InjectRepository(MacroSeries)
    private repo: Repository<MacroSeries>,
    @InjectRepository(MacroConfig)
    private cfgRepo: Repository<MacroConfig>,
  ) {}

  /** 统一历史起点：优先读回填脚本写入的配置；否则按现有数据的“最早日期中的最晚者”临时计算 */
  async getUnifiedStart(): Promise<string | null> {
    try {
      const row = await this.cfgRepo.findOne({ where: { key: 'unified_start' } });
      if (row && /^\d{4}-\d{2}-\d{2}$/.test(row.value)) return row.value;
    } catch {
      /* 表未建（首次部署未跑回填）→ 走临时计算 */
    }
    const agg = await this.repo
      .createQueryBuilder('s')
      .select(`to_char(MIN(s."dataDate"), 'YYYY-MM-DD')`, 'minDate')
      .groupBy('s.metric')
      .getRawMany<{ minDate: string }>();
    const mins = agg.map((a) => String(a.minDate).slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    if (!mins.length) return null;
    mins.sort();
    return mins[mins.length - 1];
  }

  /** 批量 upsert（同 metric+date 覆盖；TypeORM 默认列名 = 属性名 dataDate） */
  async upsert(points: { metric: string; date: string; value: number; source?: string }[]): Promise<number> {
    if (!points.length) return 0;
    for (const p of points) {
      const v = String(Math.round(p.value * 1e6) / 1e6);
      await this.repo.query(
        `INSERT INTO macro_series (id, metric, "dataDate", value, source, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, now(), now())
         ON CONFLICT (metric, "dataDate")
         DO UPDATE SET value = $4, source = COALESCE($5, macro_series.source), "updatedAt" = now()`,
        [randomUUID(), p.metric, p.date, v, p.source || null],
      );
    }
    return points.length;
  }

  /** 批量拉取多指标区间序列 */
  async getSeries(
    metrics: string[],
    from: string,
    to: string,
  ): Promise<Record<string, { date: string; value: number }[]>> {
    const out: Record<string, { date: string; value: number }[]> = {};
    for (const m of metrics) {
      const rows = await this.repo
        .createQueryBuilder('s')
        .select('to_char(s."dataDate", \'YYYY-MM-DD\')', 'date')
        .addSelect('s.value', 'value')
        .where('s.metric = :metric', { metric: m })
        .andWhere('s."dataDate" >= :from', { from: from + 'T00:00:00Z' })
        .andWhere('s."dataDate" <= :to', { to: to + 'T00:00:00Z' })
        .orderBy('s."dataDate"', 'ASC')
        .getRawMany<{ date: string; value: string | number }>();
      out[m] = rows.map((r) => ({
        date: String(r.date).slice(0, 10),
        value: typeof r.value === 'number' ? r.value : parseFloat(String(r.value)),
      }));
    }
    return out;
  }

  /** 总览：每指标最新值/前值/最早日期/陈旧度 + 统一起点（各指标最早日期中的最晚者） */
  async getOverview(): Promise<{ unifiedStart: string | null; metrics: MetricLatest[] }> {
    const agg = await this.repo
      .createQueryBuilder('s')
      .select('s.metric', 'metric')
      .addSelect(`to_char(MIN(s."dataDate"), 'YYYY-MM-DD')`, 'minDate')
      .addSelect(`to_char(MAX(s."dataDate"), 'YYYY-MM-DD')`, 'maxDate')
      .groupBy('s.metric')
      .getRawMany<{ metric: string; minDate: string; maxDate: string }>();
    const aggMap = new Map(agg.map((a) => [a.metric, a]));

    const lastRows: Record<string, { date: string; value: string | number; source: string | null }[]> = {};
    for (const m of METRIC_META.map((x) => x.metric)) {
      lastRows[m] = await this.repo
        .createQueryBuilder('s')
        .select(`to_char(s."dataDate", 'YYYY-MM-DD')`, 'date')
        .addSelect('s.value', 'value')
        .addSelect('s.source', 'source')
        .where('s.metric = :m', { m })
        .orderBy('s."dataDate"', 'DESC')
        .limit(2)
        .getRawMany();
    }

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
    const unifiedStart = await this.getUnifiedStart();
    const metrics: MetricLatest[] = METRIC_META.map((meta) => {
      const a = aggMap.get(meta.metric);
      const rows = lastRows[meta.metric];
      const latest = rows ? rows[0] : undefined;
      const prev = rows ? rows[1] : undefined;
      const minDate = a ? String(a.minDate).slice(0, 10) : null;
      if (!a || !latest) {
        return {
          metric: meta.metric,
          date: '',
          value: 0,
          prevDate: null,
          prevValue: null,
          daysStale: 0,
          source: null,
          minDate,
          hasData: false,
        };
      }
      const maxDate = String(a.maxDate).slice(0, 10);
      const daysStale = Math.max(
        0,
        Math.round(
          (new Date(today + 'T00:00:00Z').getTime() - new Date(maxDate + 'T00:00:00Z').getTime()) / 86400000,
        ),
      );
      return {
        metric: meta.metric,
        date: maxDate,
        value: parseFloat(String(latest.value)),
        prevDate: prev ? String(prev.date).slice(0, 10) : null,
        prevValue: prev ? parseFloat(String(prev.value)) : null,
        daysStale,
        source: (latest as any).source ?? null,
        minDate,
        hasData: true,
      };
    });

    return { unifiedStart, metrics };
  }
}
