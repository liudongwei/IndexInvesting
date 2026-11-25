import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Index } from '../indices/entities/index.entity';
import { IndexHistory } from '../indices/entities/index-history.entity';
import { MovingAverage } from '../moving-averages/entities/moving-average.entity';
import { KLinePattern } from '../kline-patterns/entities/kline-pattern.entity';
import { IndicatorValue } from './entities/indicator-value.entity';
import { IndicatorState } from './entities/indicator-state.entity';
import { IndicatorSignal } from './entities/indicator-signal.entity';
import { Candle, computeIndicatorSeries, seriesToRows, IndicatorRow } from './indicator-calculator';
import { detectSignals } from './signal-detector';
import { classifyAll, STATE_LABELS, MaRowLite } from './state-machine';

export type BatchName = 'aStock' | 'hkStock' | 'usPrecious';

const UPSERT_BATCH = 500;
/** 与 DB decimal(20,4) 存储精度匹配:差异超过半个最小单位才算"值变了" */
const VALUE_EPS = 5e-4;

@Injectable()
export class IndicatorsService {
  private readonly logger = new Logger(IndicatorsService.name);
  /** 进程内重入锁:上一批未跑完则本批跳过(1核2G 串行纪律) */
  private running = false;

  constructor(
    @InjectRepository(IndicatorValue)
    private valueRepo: Repository<IndicatorValue>,
    @InjectRepository(IndicatorState)
    private stateRepo: Repository<IndicatorState>,
    @InjectRepository(IndicatorSignal)
    private signalRepo: Repository<IndicatorSignal>,
    @InjectRepository(IndexHistory)
    private historyRepo: Repository<IndexHistory>,
    @InjectRepository(MovingAverage)
    private maRepo: Repository<MovingAverage>,
    @InjectRepository(KLinePattern)
    private klinePatternRepo: Repository<KLinePattern>,
  ) {}

  // ================= 批次入口(cron 调用) =================

  /** 单批执行:逐指数串行,禁 Promise.all(1核2G 资源纪律) */
  async runBatch(batch: BatchName): Promise<{
    batch: BatchName;
    total: number;
    computed: number;
    skipped: number;
    empty: number;
    failed: number;
    elapsedMs: number;
  }> {
    const started = Date.now();
    if (this.running) {
      this.logger.warn('上一指标批次尚未跑完,本批跳过(重入锁)');
      return { batch, total: 0, computed: 0, skipped: 0, empty: 0, failed: 0, elapsedMs: Date.now() - started };
    }
    this.running = true;
    try {
      const indices = await this.indicesOfBatch(batch);
      let computed = 0;
      let skipped = 0;
      let empty = 0;
      let failed = 0;
      for (const index of indices) {
        try {
          const r = await this.computeAndStoreForIndex(index);
          if (r === 'computed') computed++;
          else if (r === 'skipped') skipped++;
          else empty++;
        } catch (error) {
          failed++;
          const msg = error instanceof Error ? error.message : String(error);
          this.logger.error(`指标计算失败 ${index.name}: ${msg}`);
        }
      }
      const elapsedMs = Date.now() - started;
      this.logger.log(`指标批次 ${batch} 完成: 共${totalOf(indices)} 指数, 计算${computed}, 跳过${skipped}, 无数据${empty}, 失败${failed}, 耗时${elapsedMs}ms`);
      return { batch, total: totalOf(indices), computed, skipped, empty, failed, elapsedMs };
    } finally {
      this.running = false;
    }
  }

  async isRunning(): Promise<boolean> {
    return this.running;
  }

  private indicesOfBatch(batch: BatchName): Promise<Index[]> {
    return this.valueRepo.manager
      .getRepository(Index)
      .find({ where: { isActive: true } })
      .then((all) => all.filter((idx) => batchOfIndex(idx) === batch));
  }

  // ================= 单指数计算 + 落库 =================

  /**
   * 计算并落库单个指数。
   * 跳过守卫:index_histories 与 indicator_values 的 max(tradeDate) 相等即跳过(重复执行零写入)。
   * 每日全量重算 + 差异 upsert:值无变化的行不写。
   */
  async computeAndStoreForIndex(
    index: Index,
  ): Promise<'computed' | 'skipped' | 'empty'> {
    const histories = await this.historyRepo.find({
      where: { indexId: index.id },
      order: { tradeDate: 'ASC' },
    });
    if (histories.length === 0) return 'empty';

    // 跳过守卫
    const lastHistoryDate = maxDateStr(histories.map((h) => toStr(h.tradeDate)));
    const lastValueRow = await this.valueRepo.findOne({
      where: { indexId: index.id },
      order: { tradeDate: 'DESC' },
    });
    if (lastValueRow && toStr(lastValueRow.tradeDate) >= lastHistoryDate) {
      return 'skipped';
    }

    // K线 + MA(moving_averages 单一来源)+ 阶段位置(kline_patterns)
    const candles: Candle[] = histories.map((h) => ({
      date: toStr(h.tradeDate),
      open: Number(h.openPrice),
      high: Number(h.highPrice),
      low: Number(h.lowPrice),
      close: Number(h.closePrice),
      volume: h.volume !== null && h.volume !== undefined ? Number(h.volume) : null,
      turnover: h.turnover !== null && h.turnover !== undefined ? Number(h.turnover) : null,
    }));

    const maRowsEntities = await this.maRepo.find({ where: { indexId: index.id }, order: { tradeDate: 'ASC' } });
    const maRows = new Map<string, MaRowLite>();
    for (const m of maRowsEntities) {
      maRows.set(toStr(m.tradeDate), { date: toStr(m.tradeDate), ma20: num(m.ma20), ma60: num(m.ma60) });
    }

    const patterns = await this.klinePatternRepo.find({
      where: { indexId: index.id },
      select: { tradeDate: true, marketPosition: true },
    });
    const positionByDate = new Map<string, string>();
    for (const p of patterns) {
      const mp = (p as any).marketPosition;
      if (mp) positionByDate.set(toStr(p.tradeDate), mp);
    }

    // ---- 计算 ----
    const series = computeIndicatorSeries(candles);
    const rows = seriesToRows(series);
    const signals = detectSignals(series);
    const stateResults = classifyAll(series, maRows, positionByDate, signals);
    const states = stateResults.map((st, idx) => ({ date: series.dates[idx], stateKey: st.stateKey, basis: st.basis }));

    // ---- 差异落库 ----
    const valuesChanged = await this.diffUpsertValues(index.id, rows);
    const statesChanged = await this.diffUpsertStates(index.id, states);
    const signalsChanged = await this.diffUpsertSignals(index.id, signals);

    this.logger.log(
      `${index.name} 指标计算完成: ${rows.length} 日,值变更 ${valuesChanged},状态变更 ${statesChanged},信号变更 ${signalsChanged}(最新 ${lastHistoryDate})`,
    );
    return 'computed';
  }

  private async diffUpsertValues(indexId: string, rows: IndicatorRow[]): Promise<number> {
    const existing = await this.valueRepo.find({ where: { indexId } });
    const existingByDate = new Map(existing.map((e) => [toStr(e.tradeDate), e]));
    const toWrite: IndicatorValue[] = [];
    for (const row of rows) {
      const prev = existingByDate.get(row.date);
      if (prev && rowEquals(prev, row)) continue;
      toWrite.push(this.valueRepo.create({ indexId, ...rowToEntity(row) }));
    }
    for (let i = 0; i < toWrite.length; i += UPSERT_BATCH) {
      await this.valueRepo.upsert(toWrite.slice(i, i + UPSERT_BATCH), ['indexId', 'tradeDate']);
    }
    return toWrite.length;
  }

  private async diffUpsertStates(indexId: string, states: { date: string; stateKey: string; basis: string[] }[]): Promise<number> {
    const existing = await this.stateRepo.find({ where: { indexId } });
    const existingByDate = new Map(existing.map((e) => [toStr(e.tradeDate), e]));
    const toWrite: IndicatorState[] = [];
    for (const st of states) {
      const prev = existingByDate.get(st.date);
      if (prev && prev.stateKey === st.stateKey && JSON.stringify(prev.basis) === JSON.stringify(st.basis)) continue;
      toWrite.push(
        this.stateRepo.create({
          indexId,
          tradeDate: toDate(st.date),
          stateKey: st.stateKey,
          basis: st.basis,
        }),
      );
    }
    for (let i = 0; i < toWrite.length; i += UPSERT_BATCH) {
      await this.stateRepo.upsert(toWrite.slice(i, i + UPSERT_BATCH), ['indexId', 'tradeDate']);
    }
    return toWrite.length;
  }

  private async diffUpsertSignals(indexId: string, signals: { date: string; type: string; direction: string; basis: string }[]): Promise<number> {
    const existing = await this.signalRepo.find({ where: { indexId } });
    const computedKeys = new Set(signals.map((s) => `${s.date}|${s.type}`));
    // 删除不再成立的信号(如背离在后续数据下不再满足)
    const stale = existing.filter((e) => !computedKeys.has(`${toStr(e.tradeDate)}|${e.type}`));
    if (stale.length > 0) {
      await this.signalRepo.delete({ id: In(stale.map((s) => s.id)) });
    }
    const existingByKey = new Map(existing.map((e) => [`${toStr(e.tradeDate)}|${e.type}`, e]));
    const toWrite: IndicatorSignal[] = [];
    for (const sig of signals) {
      const prev = existingByKey.get(`${sig.date}|${sig.type}`);
      if (prev && prev.direction === sig.direction && prev.basis === sig.basis) continue;
      toWrite.push(
        this.signalRepo.create({
          indexId,
          tradeDate: toDate(sig.date),
          type: sig.type,
          direction: sig.direction,
          basis: sig.basis,
        }),
      );
    }
    for (let i = 0; i < toWrite.length; i += UPSERT_BATCH) {
      await this.signalRepo.upsert(toWrite.slice(i, i + UPSERT_BATCH), ['indexId', 'tradeDate', 'type']);
    }
    return toWrite.length;
  }
}

// ================= 市场批次划分(与 index-sync 同口径) =================

/** 三批次:A股(+台湾/日韩,14:30 前已收) / 港股 / 美股+贵金属(+其余兜底,保证全覆盖) */
export function batchOfIndex(index: Index): BatchName {
  const exchange = index.exchange || '';
  const code = index.code || '';
  const officialCode = index.officialCode || '';
  const name = index.name || '';

  const isAStock =
    exchange.includes('上海') || exchange.includes('深圳') || exchange.includes('北京') ||
    exchange.includes('上交所') || exchange.includes('深交所') || exchange.includes('北交所') ||
    code.startsWith('sh') || code.startsWith('sz') ||
    officialCode.includes('.SH') || officialCode.includes('.SZ') ||
    officialCode === '932000' || officialCode === '899050';
  const isTaiwan = exchange.includes('台湾') || exchange.includes('台股') || name.includes('台湾') || name.includes('台股') || name.includes('加权') || code.includes('TWII');
  const isJapanKorea =
    exchange.includes('日本') || exchange.includes('东京') || exchange.includes('韩国') || exchange.includes('首尔') ||
    name.includes('日经') || name.includes('韩国') || name.includes('KOSPI') || name.includes('N225');
  if (isAStock || isTaiwan || isJapanKorea) return 'aStock';

  const isHK = exchange.includes('港交所') || exchange.includes('香港') || code.startsWith('hk');
  if (isHK) return 'hkStock';

  return 'usPrecious'; // 美股、贵金属、欧洲等其余市场:06:30 批次(欧洲/美盘/贵金属 06:30 前均收盘)
}

// ================= 工具 =================

const totalOf = (indices: Index[]) => indices.length;

/** 实体读出的 date 列可能是 Date 或 'YYYY-MM-DD' 字符串 —— 统一归一为本地日期字符串(b5884ca 教训) */
function toStr(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 写库用本地零点 Date(不用 UTC 解析的 new Date('YYYY-MM-DD')) */
function toDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** pg decimal 列返回 JS 字符串 —— 统一 Number() */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function maxDateStr(dates: string[]): string {
  return dates.reduce((a, b) => (b > a ? b : a), dates[0] ?? '0000-00-00');
}

const VALUE_FIELDS: (keyof IndicatorRow)[] = [
  'macdDif', 'macdDea', 'macdHist', 'bollMid', 'bollUpper', 'bollLower',
  'adx', 'pdi', 'mdi', 'obv', 'obvEma20', 'volumeRatio', 'vma5', 'vma10',
  'rsi', 'cmf', 'bias20', 'bias60', 'atr14', 'hv20',
];

/** 与存储行比对(decimal(20,4) 精度,VALUE_EPS 容差防抖动重写) */
function rowEquals(prev: IndicatorValue, row: IndicatorRow): boolean {
  for (const f of VALUE_FIELDS) {
    const a = num((prev as any)[f]);
    const b = row[f] as number | null;
    if (a === null && b === null) continue;
    if (a === null || b === null) return false;
    if (Math.abs(a - b) > VALUE_EPS) return false;
  }
  return true;
}

function rowToEntity(row: IndicatorRow): Record<string, unknown> {
  const out: Record<string, unknown> = { tradeDate: toDate(row.date) };
  for (const f of VALUE_FIELDS) out[f] = row[f];
  return out;
}
