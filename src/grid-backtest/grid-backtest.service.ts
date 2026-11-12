import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { GridBacktestRun } from './entities/grid-backtest-run.entity';
import { InstrumentHistory } from './entities/instrument-history.entity';
import { TradingInstrument, TradingRule } from '../simulation-portfolio/entities/trading-instrument.entity';
import { Index } from '../indices/entities/index.entity';
import { IndexHistory } from '../indices/entities/index-history.entity';
import { KLinePattern } from '../kline-patterns/entities/kline-pattern.entity';
import { EngineBar, EngineParams, runGridEngine, buildLevels } from './grid-engine';
import {
  RunGridBacktestDto,
  SuggestParamsDto,
  ScanGridDto,
  DEFAULTS,
} from './dto/grid-backtest.dto';

const FRESH_DAYS = 4; // 缓存新鲜度窗口（自然日，覆盖周末/小长假）

const pad2 = (n: number) => String(n).padStart(2, '0');
/** Date -> 'YYYY-MM-DD'（按本地时区，与 pg 驱动对 date 列的解析一致） */
function toLocalStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
/** 'YYYY-MM-DD' -> 本地时区零点 Date（用于与 date 列比较，避免 UTC 偏移 8 小时错位） */
function localDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
const r4 = (x: number) => Math.round(x * 10000) / 10000;

interface RawBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  turnover: number | null;
}

interface ResolvedTarget {
  kind: 'instrument' | 'index';
  label: string;
  symbol?: string;
  secid?: string;
  instrument?: TradingInstrument;
  index?: Index;
}

interface ResolvedBars {
  bars: EngineBar[];
  warnings: string[];
  source: string;
}

@Injectable()
export class GridBacktestService {
  constructor(
    @InjectRepository(GridBacktestRun) private readonly runRepo: Repository<GridBacktestRun>,
    @InjectRepository(InstrumentHistory) private readonly histRepo: Repository<InstrumentHistory>,
    @InjectRepository(TradingInstrument) private readonly instrumentRepo: Repository<TradingInstrument>,
    @InjectRepository(Index) private readonly indexRepo: Repository<Index>,
    @InjectRepository(IndexHistory) private readonly indexHistoryRepo: Repository<IndexHistory>,
    @InjectRepository(KLinePattern) private readonly patternRepo: Repository<KLinePattern>,
    private readonly http: HttpService,
  ) {}

  // ---------------------------------------------------------------- 目标解析

  private async resolveTarget(dto: {
    instrumentCode?: string;
    indexCode?: string;
    adaptivityIndexCode?: string;
  }): Promise<ResolvedTarget> {
    if (!dto.instrumentCode && !dto.indexCode) {
      throw new BadRequestException('必须指定 instrumentCode 或 indexCode 之一');
    }
    if (dto.instrumentCode && dto.indexCode) {
      throw new BadRequestException('instrumentCode 与 indexCode 只能指定一个');
    }
    if (dto.instrumentCode) {
      const inst = await this.instrumentRepo.findOne({ where: { code: dto.instrumentCode }, relations: { index: true } });
      if (!inst) throw new NotFoundException(`交易标的不存在: ${dto.instrumentCode}`);
      const sh = '569'.includes(inst.code[0]);
      const prefix = sh ? 'sh' : 'sz';
      return {
        kind: 'instrument',
        label: `${inst.name}(${inst.code})`,
        symbol: `${prefix}${inst.code}`,
        secid: `${sh ? 1 : 0}.${inst.code}`,
        instrument: inst,
      };
    }
    const idx = await this.indexRepo.findOne({
      where: [{ code: dto.indexCode! }, { officialCode: dto.indexCode! }],
    });
    if (!idx) throw new NotFoundException(`指数不存在: ${dto.indexCode}`);
    return { kind: 'index', label: `${idx.name}(${idx.code})`, index: idx };
  }

  /** 适配性分析参照指数：显式指定 > 标的关联指数 > 指数回测自身 */
  private async resolveAdaptivityIndexId(target: ResolvedTarget, explicitCode?: string): Promise<string | undefined> {
    if (explicitCode) {
      const idx = await this.indexRepo.findOne({
        where: [{ code: explicitCode }, { officialCode: explicitCode }],
      });
      return idx?.id;
    }
    if (target.instrument?.index?.id) return target.instrument.index.id;
    if (target.index) return target.index.id;
    return undefined;
  }

  // ---------------------------------------------------------------- K线数据

  private secidFor(code: string): string {
    const sh = '569'.includes(code[0]);
    return `${sh ? 1 : 0}.${code}`;
  }

  private async fetchEastmoneyDaily(secid: string): Promise<RawBar[]> {
    const url = 'https://push2his.eastmoney.com/api/qt/stock/kline/get';
    const res = await firstValueFrom(
      this.http.get(url, {
        params: {
          secid,
          klt: 101, // 日K
          fqt: 1, // 前复权
          lmt: 99999999,
          end: 20500101,
          fields1: 'f1,f2,f3,f4,f5,f6',
          fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        },
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          Referer: 'https://quote.eastmoney.com/',
        },
      }),
    );
    const klines: unknown = res.data?.data?.klines;
    if (!Array.isArray(klines) || klines.length === 0) {
      throw new Error('东财返回空数据');
    }
    return klines.map((k) => {
      const f = String(k).split(',');
      const date = f[0];
      const open = Number(f[1]);
      const close = Number(f[2]);
      const high = Number(f[3]);
      const low = Number(f[4]);
      const volume = f[5] !== undefined && f[5] !== '' ? Number(f[5]) : null;
      const turnover = f[6] !== undefined && f[6] !== '' ? Number(f[6]) : null;
      if (
        !(open > 0 && close > 0 && high > 0 && low > 0) ||
        high < Math.max(open, close) - 1e-9 ||
        low > Math.min(open, close) + 1e-9
      ) {
        throw new Error(`东财K线字段解析异常: ${k}`);
      }
      return { date, open, high, low, close, volume, turnover };
    });
  }

  /** 腾讯 qfqday 日线备用源（东财不可用时兜底；深度约 640 根 / 2.7 年） */
  private async fetchTencentDaily(symbol: string): Promise<RawBar[]> {
    const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,640,qfq`;
    const res = await firstValueFrom(
      this.http.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          Referer: 'https://gu.qq.com/',
        },
      }),
    );
    const node = res.data?.data?.[symbol];
    const klines: unknown = node?.qfqday || node?.day;
    if (!Array.isArray(klines) || klines.length === 0) {
      throw new Error('腾讯返回空数据');
    }
    return klines.map((k: any) => {
      const date = String(k[0]);
      const open = Number(k[1]);
      const close = Number(k[2]);
      const high = Number(k[3]);
      const low = Number(k[4]);
      const volume = k[5] !== undefined && k[5] !== '' ? Number(k[5]) : null;
      if (
        !(open > 0 && close > 0 && high > 0 && low > 0) ||
        high < Math.max(open, close) - 1e-9 ||
        low > Math.min(open, close) + 1e-9
      ) {
        throw new Error(`腾讯K线字段解析异常: ${JSON.stringify(k)}`);
      }
      return { date, open, high, low, close, volume, turnover: null };
    });
  }

  /** 全量替换某 symbol 的日线缓存 */
  private async saveKlineCache(symbol: string, raw: RawBar[], dataSource: string): Promise<void> {
    await this.histRepo.manager.transaction(async (em) => {
      await em.delete(InstrumentHistory, { symbol });
      await em.insert(
        InstrumentHistory,
        raw.map((r) => ({
          symbol,
          tradeDate: r.date,
          openPrice: r.open,
          highPrice: r.high,
          lowPrice: r.low,
          closePrice: r.close,
          volume: r.volume,
          turnover: r.turnover,
          dataSource,
        })),
      );
    });
  }

  private cacheToRaw(rows: InstrumentHistory[]): RawBar[] {
    // pg decimal 列返回字符串，必须 Number()（index-investing-dev 已知坑）
    return rows.map((r) => ({
      date: toLocalStr(new Date(r.tradeDate)),
      open: Number(r.openPrice),
      high: Number(r.highPrice),
      low: Number(r.lowPrice),
      close: Number(r.closePrice),
      volume: r.volume === null || r.volume === undefined ? null : Number(r.volume),
      turnover: r.turnover === null || r.turnover === undefined ? null : Number(r.turnover),
    }));
  }

  private async getInstrumentBars(target: ResolvedTarget): Promise<ResolvedBars> {
    const symbol = target.symbol!;
    const warnings: string[] = [];
    const cached = await this.histRepo.find({ where: { symbol }, order: { tradeDate: 'ASC' } });
    const cutoff = toLocalStr(new Date(Date.now() - FRESH_DAYS * 86400000));
    const fresh = cached.length > 0 && toLocalStr(new Date(cached[cached.length - 1].tradeDate)) >= cutoff;

    let raw: RawBar[];
    let source: string;
    if (fresh) {
      raw = this.cacheToRaw(cached);
      source = 'cache';
    } else {
      // 数据链：东财（主，13.8年） → 本地缓存（陈旧但更深） → 腾讯（备用，约2.7年）
      try {
        raw = await this.fetchEastmoneyDaily(target.secid!);
        await this.saveKlineCache(symbol, raw, 'eastmoney');
        source = 'eastmoney';
      } catch (e: any) {
        const emErr = e?.message || String(e);
        if (cached.length > 0) {
          warnings.push(
            `东财K线接口获取失败（${emErr}），已降级使用本地缓存（截至 ${toLocalStr(new Date(cached[cached.length - 1].tradeDate))}）`,
          );
          raw = this.cacheToRaw(cached);
          source = 'cache-stale';
        } else {
          try {
            raw = await this.fetchTencentDaily(symbol);
            await this.saveKlineCache(symbol, raw, 'tencent');
            warnings.push('东财K线接口不可用，已改用腾讯日线备用源（约2.7年，深度较浅；东财恢复后重跑将自动补全为完整历史）');
            source = 'tencent';
          } catch (e2: any) {
            throw new BadRequestException(
              `东财与腾讯K线接口均不可用（东财: ${emErr}；腾讯: ${e2?.message || e2}），请稍后重试`,
            );
          }
        }
      }
    }
    return { ...this.filterRange(raw, warnings), source };
  }

  private async getIndexBars(target: ResolvedTarget, startDate: string, endDate: string): Promise<ResolvedBars> {
    const warnings: string[] = [];
    const rows = await this.indexHistoryRepo.find({
      where: { indexId: target.index!.id, tradeDate: Between(localDate(startDate), localDate(endDate)) },
      order: { tradeDate: 'ASC' },
    });
    const raw: RawBar[] = rows.map((r) => ({
      date: toLocalStr(new Date(r.tradeDate)),
      open: Number(r.openPrice),
      high: Number(r.highPrice),
      low: Number(r.lowPrice),
      close: Number(r.closePrice),
      volume: r.volume === null || r.volume === undefined ? null : Number(r.volume),
      turnover: r.turnover === null || r.turnover === undefined ? null : Number(r.turnover),
    }));
    const filtered = this.filterRange(raw, warnings, startDate, endDate, true);
    return { ...filtered, source: 'index-histories' };
  }

  private filterRange(
    raw: RawBar[],
    warnings: string[],
    startDate?: string,
    endDate?: string,
    preFiltered = false,
  ): { bars: EngineBar[]; warnings: string[] } {
    const inRange = preFiltered
      ? raw
      : raw.filter((r) => (!startDate || r.date >= startDate) && (!endDate || r.date <= endDate));
    if (inRange.length < 2) {
      throw new BadRequestException(
        `区间内可用K线不足（${inRange.length} 根）。数据实际覆盖 ${
          raw.length ? `${raw[0].date} ~ ${raw[raw.length - 1].date}` : '为空'
        }，请调整回测区间`,
      );
    }
    if (!preFiltered && startDate && inRange[0].date > startDate) {
      warnings.push(`数据自 ${inRange[0].date} 起，请求起始日 ${startDate} 无数据，已按可用区间回测`);
    }
    const bars: EngineBar[] = inRange.map((r) => ({
      date: r.date,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
    }));
    bars.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return { bars, warnings };
  }

  private async resolveBars(
    target: ResolvedTarget,
    startDate: string,
    endDate: string,
  ): Promise<ResolvedBars> {
    if (target.kind === 'instrument') {
      const res = await this.getInstrumentBars(target);
      const bars = res.bars.filter((b) => b.date >= startDate && b.date <= endDate);
      if (bars.length < 2) {
        throw new BadRequestException(
          `区间内可用K线不足（${bars.length} 根），请调整回测区间`,
        );
      }
      if (bars[0].date > startDate) {
        res.warnings.push(`数据自 ${bars[0].date} 起，请求起始日 ${startDate} 无数据，已按可用区间回测`);
      }
      return { ...res, bars };
    }
    return this.getIndexBars(target, startDate, endDate);
  }

  // ---------------------------------------------------------------- 适配性

  private async buildAdaptivity(
    indexId: string | undefined,
    startDate: string,
    endDate: string,
    barCount: number,
  ) {
    if (!indexId) {
      return {
        available: false,
        reason: '未指定参照指数（该标的未关联指数，可在参数中手动选择）',
      };
    }
    const rows = await this.patternRepo.find({
      where: { indexId, tradeDate: Between(localDate(startDate), localDate(endDate)) },
    });
    // 同一日期优先取收盘静态结果（isRealtime=false）
    const byDate = new Map<string, KLinePattern>();
    for (const r of rows) {
      const ds = toLocalStr(new Date(r.tradeDate));
      const cur = byDate.get(ds);
      if (!cur || !r.isRealtime) byDate.set(ds, r);
    }
    const trend: Record<string, number> = { uptrend: 0, downtrend: 0, sideways: 0 };
    const position: Record<string, number> = {};
    for (const r of byDate.values()) {
      trend[r.trendState] = (trend[r.trendState] || 0) + 1;
      position[r.marketPosition] = (position[r.marketPosition] || 0) + 1;
    }
    const sample = byDate.size;
    const coverage = barCount > 0 ? r4(sample / barCount) : 0;
    const sidRatio = sample > 0 ? (trend.sideways || 0) / sample : 0;
    let label: string;
    if (sample < 5 || coverage < 0.5) {
      label = '趋势数据覆盖不足（<50%），适配性仅供参考';
    } else if (sidRatio >= 0.6) {
      label = '横盘占比高，较适合网格';
    } else if (sidRatio >= 0.4) {
      label = '震荡与趋势混合，网格效果中性';
    } else {
      label = '趋势主导，单边行情风险较大，谨慎使用网格';
    }
    return {
      available: true,
      indexId,
      sampleDays: sample,
      coverage,
      trendDistribution: trend,
      trendRatio: {
        uptrend: sample ? r4((trend.uptrend || 0) / sample) : 0,
        downtrend: sample ? r4((trend.downtrend || 0) / sample) : 0,
        sideways: sample ? r4(sidRatio) : 0,
      },
      marketPositionDistribution: position,
      label,
    };
  }

  // ---------------------------------------------------------------- 参数组装

  private toEngineParams(
    dto: {
      basePrice?: number;
      upperPct: number;
      lowerPct?: number;
      gridMode: 'arithmetic' | 'geometric';
      gridCount: number;
      quantityPerGrid: number;
      initialCapital: number;
      commissionRate?: number;
      minCommission?: number;
      slippageBps?: number;
      lotSize?: number;
      applyTPlus1?: boolean;
    },
    bars: EngineBar[],
    target: ResolvedTarget,
    lowerPctOverride?: number,
  ): EngineParams {
    const inst = target.instrument;
    return {
      basePrice: dto.basePrice && dto.basePrice > 0 ? dto.basePrice : bars[0].close,
      upperPct: dto.upperPct,
      lowerPct: lowerPctOverride ?? dto.lowerPct ?? 0.15,
      gridMode: dto.gridMode,
      gridCount: dto.gridCount,
      quantityPerGrid: dto.quantityPerGrid,
      initialCapital: dto.initialCapital,
      commissionRate: dto.commissionRate ?? DEFAULTS.COMMISSION_RATE,
      minCommission: dto.minCommission ?? DEFAULTS.MIN_COMMISSION,
      slippageBps: dto.slippageBps ?? 0,
      lotSize: dto.lotSize ?? inst?.lotSize ?? 100,
      applyTPlus1: dto.applyTPlus1 ?? (inst ? inst.tradingRule === TradingRule.T_PLUS_1 : true),
    };
  }

  // ---------------------------------------------------------------- API 实现

  async run(dto: RunGridBacktestDto) {
    if (dto.startDate > dto.endDate) throw new BadRequestException('startDate 不能晚于 endDate');
    const target = await this.resolveTarget(dto);
    const { bars, warnings, source } = await this.resolveBars(target, dto.startDate, dto.endDate);
    const params = this.toEngineParams(dto, bars, target);

    const started = Date.now();
    const result = runGridEngine(bars, params);
    const elapsedMs = Date.now() - started;

    const adaptivityIndexId = await this.resolveAdaptivityIndexId(target, dto.adaptivityIndexCode);
    const adaptivity = await this.buildAdaptivity(adaptivityIndexId, bars[0].date, bars[bars.length - 1].date, bars.length);

    const entity = await this.runRepo.save(
      this.runRepo.create({
        instrumentCode: target.kind === 'instrument' ? target.instrument!.code : null,
        indexCode: target.kind === 'index' ? target.index!.code : null,
        targetType: target.kind,
        targetLabel: target.label,
        params: { ...params, startDate: bars[0].date, endDate: bars[bars.length - 1].date, requestedStart: dto.startDate, requestedEnd: dto.endDate },
        metrics: result.metrics as any,
        curve: result.curve,
        trades: result.trades,
        adaptivity: adaptivity as any,
        warnings: warnings.length ? warnings : null,
        dataSource: source,
        elapsedMs,
      }),
    );

    return {
      success: true,
      data: {
        id: entity.id,
        targetType: target.kind,
        targetLabel: target.label,
        instrumentCode: entity.instrumentCode,
        indexCode: entity.indexCode,
        params: entity.params,
        metrics: result.metrics,
        levels: result.levels,
        adaptivity,
        warnings,
        curve: result.curve,
        trades: result.trades,
        bars: bars.map((b) => ({ date: b.date, open: r4(b.open), high: r4(b.high), low: r4(b.low), close: r4(b.close) })),
        dataSource: source,
        elapsedMs,
        createdAt: entity.createdAt,
      },
    };
  }

  async suggest(dto: SuggestParamsDto) {
    if (dto.startDate > dto.endDate) throw new BadRequestException('startDate 不能晚于 endDate');
    const target = await this.resolveTarget(dto);
    const { bars, warnings } = await this.resolveBars(target, dto.startDate, dto.endDate);

    const gridCount = dto.gridCount ?? 10;
    const initialCapital = dto.initialCapital ?? 50000;
    const basePrice = bars[0].close;
    let maxHigh = -Infinity;
    let minLow = Infinity;
    let sumRet = 0;
    const rets: number[] = [];
    for (let i = 0; i < bars.length; i++) {
      if (bars[i].high > maxHigh) maxHigh = bars[i].high;
      if (bars[i].low < minLow) minLow = bars[i].low;
      if (i > 0 && bars[i - 1].close > 0) rets.push(bars[i].close / bars[i - 1].close - 1);
    }
    const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
    const variance = rets.length > 1 ? rets.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (rets.length - 1) : 0;
    const volatility = Math.sqrt(variance) * Math.sqrt(252);

    const rangeHi = maxHigh / basePrice - 1;
    const rangeLo = 1 - minLow / basePrice;
    const roundUp5 = (x: number) => Math.ceil(Math.max(x, 0.05) * 20) / 20; // 向上取整到 5%
    const upperPct = roundUp5(rangeHi);
    const lowerPct = Math.min(0.95, roundUp5(rangeLo));
    const gridMode: 'arithmetic' | 'geometric' = upperPct + lowerPct > 0.25 ? 'geometric' : 'arithmetic';
    const lotSize = target.instrument?.lotSize ?? 100;
    let quantityPerGrid = Math.floor(((initialCapital * 0.8) / gridCount / basePrice / lotSize)) * lotSize;
    if (quantityPerGrid < lotSize) quantityPerGrid = lotSize;

    const suggestWarnings = [...warnings];
    if (upperPct + lowerPct < 0.1) {
      suggestWarnings.push('区间振幅很小（<10%），网格可操作空间有限');
    }
    if (quantityPerGrid * gridCount * basePrice > initialCapital) {
      suggestWarnings.push('按建议每格数量，理论满格占用资金可能超过初始资金（会出现资金不足跳过）');
    }

    return {
      success: true,
      data: {
        basePrice: r4(basePrice),
        upperPct,
        lowerPct,
        upperPrice: r4(basePrice * (1 + upperPct)),
        lowerPrice: r4(basePrice * (1 - lowerPct)),
        gridMode,
        gridCount,
        quantityPerGrid,
        initialCapital,
        lotSize,
        commissionRate: DEFAULTS.COMMISSION_RATE,
        minCommission: DEFAULTS.MIN_COMMISSION,
        slippageBps: 0,
        applyTPlus1: target.instrument ? target.instrument.tradingRule === TradingRule.T_PLUS_1 : true,
        annualizedVolatility: r4(volatility),
        rangeHigh: r4(maxHigh),
        rangeLow: r4(minLow),
        coverage: { firstDate: bars[0].date, lastDate: bars[bars.length - 1].date, barCount: bars.length },
        warnings: suggestWarnings,
      },
    };
  }

  async scan(dto: ScanGridDto) {
    if (dto.startDate > dto.endDate) throw new BadRequestException('startDate 不能晚于 endDate');
    const target = await this.resolveTarget(dto);
    const { bars } = await this.resolveBars(target, dto.startDate, dto.endDate);

    const started = Date.now();
    const cells: any[] = [];
    for (const gridCount of dto.gridCounts) {
      for (const upperPct of dto.upperPcts) {
        const params = this.toEngineParams(
          { ...dto, gridCount, upperPct, lowerPct: upperPct },
          bars,
          target,
          upperPct, // 扫描时下界与上界对称
        );
        const res = runGridEngine(bars, params);
        cells.push({
          gridCount,
          upperPct,
          lowerPct: upperPct,
          totalReturn: res.metrics.totalReturn,
          annualizedReturn: res.metrics.annualizedReturn,
          excessReturn: res.metrics.excessReturn,
          maxDrawdown: res.metrics.maxDrawdown,
          peakCapitalUtilization: res.metrics.peakCapitalUtilization,
          pairedCount: res.metrics.pairedCount,
          winRate: res.metrics.winRate,
          totalValue: res.metrics.totalValue,
          totalCommission: res.metrics.totalCommission,
        });
      }
    }
    let best: any = null;
    for (const c of cells) {
      if (!best || c.totalReturn > best.totalReturn) best = c;
    }
    return {
      success: true,
      data: {
        gridCounts: dto.gridCounts,
        upperPcts: dto.upperPcts,
        symmetric: true,
        barCount: bars.length,
        cells,
        best,
        elapsedMs: Date.now() - started,
      },
    };
  }

  async list() {
    const rows = await this.runRepo
      .createQueryBuilder('r')
      .select([
        'r.id',
        'r.targetType',
        'r.targetLabel',
        'r.instrumentCode',
        'r.indexCode',
        'r.params',
        'r.metrics',
        'r.createdAt',
      ])
      .orderBy('r.createdAt', 'DESC')
      .limit(100)
      .getMany();
    return { success: true, data: rows };
  }

  async getOne(id: string) {
    const row = await this.runRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('回测记录不存在');
    // K线不落库：按记录参数重新解析（来自缓存，正常不走外网）
    let bars: any[] | null = null;
    let barsWarning: string | null = null;
    try {
      const target = await this.resolveTarget({
        instrumentCode: row.instrumentCode || undefined,
        indexCode: row.indexCode || undefined,
      });
      const p = row.params;
      const res = await this.resolveBars(target, p.requestedStart || p.startDate, p.requestedEnd || p.endDate);
      bars = res.bars.map((b) => ({ date: b.date, open: r4(b.open), high: r4(b.high), low: r4(b.low), close: r4(b.close) }));
      if (res.warnings.length) barsWarning = res.warnings.join('；');
    } catch (e: any) {
      barsWarning = `K线数据加载失败：${e?.message || e}`;
    }
    // 网格线不落库：按存储参数用引擎纯函数确定性重建（K线图依赖，缺失会导致前端崩溃）
    let levels: number[] = [];
    try {
      const p = row.params;
      levels = buildLevels({
        basePrice: Number(p.basePrice),
        upperPct: Number(p.upperPct),
        lowerPct: Number(p.lowerPct),
        gridMode: p.gridMode,
        gridCount: Number(p.gridCount),
        quantityPerGrid: Number(p.quantityPerGrid),
        initialCapital: Number(p.initialCapital),
        commissionRate: Number(p.commissionRate),
        minCommission: Number(p.minCommission),
        slippageBps: Number(p.slippageBps),
        lotSize: Number(p.lotSize),
        applyTPlus1: !!p.applyTPlus1,
      }).map(r4);
    } catch {
      levels = [];
    }
    return { success: true, data: { ...row, levels, bars, barsWarning } };
  }

  async remove(id: string) {
    const row = await this.runRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('回测记录不存在');
    await this.runRepo.delete(id);
    return { success: true, data: { id } };
  }
}
