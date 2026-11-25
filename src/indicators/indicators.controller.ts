import { Controller, Get, Param, Query, NotFoundException, UseGuards } from '@nestjs/common';
import { WriteGuard } from '../auth/guards/write.guard';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Index } from '../indices/entities/index.entity';
import { IndexHistory } from '../indices/entities/index-history.entity';
import { MovingAverage } from '../moving-averages/entities/moving-average.entity';
import { IndicatorValue } from './entities/indicator-value.entity';
import { IndicatorState } from './entities/indicator-state.entity';
import { IndicatorSignal } from './entities/indicator-signal.entity';

const r4 = (v: number | null | undefined): number | null => {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return null;
  return Number(Number(v).toFixed(4));
};

const RANGE_DAYS: Record<string, number> = { '3m': 92, '6m': 183, '1y': 366, all: Number.MAX_SAFE_INTEGER };

@ApiTags('技术指标')
@UseGuards(WriteGuard) // GET/HEAD/OPTIONS 放行,写方法须 JWT —— 公开 GET
@Controller('indicators')
export class IndicatorsController {
  constructor(
    @InjectRepository(Index)
    private indexRepo: Repository<Index>,
    @InjectRepository(IndexHistory)
    private historyRepo: Repository<IndexHistory>,
    @InjectRepository(IndicatorValue)
    private valueRepo: Repository<IndicatorValue>,
    @InjectRepository(IndicatorState)
    private stateRepo: Repository<IndicatorState>,
    @InjectRepository(IndicatorSignal)
    private signalRepo: Repository<IndicatorSignal>,
    @InjectRepository(MovingAverage)
    private maRepo: Repository<MovingAverage>,
  ) {}

  /**
   * 技术指标数据(读表组装,不再现算)。
   * 盘中当日未落库时返回最近已算交易日,响应 asOfDate 标注。
   */
  @Get(':indexId')
  @ApiOperation({ summary: '指数技术指标(K线+指标+状态机+信号),range=3m/6m/1y/all' })
  async getIndicators(
    @Param('indexId') indexId: string,
    @Query('range') range: string = '1y',
  ) {
    const days = RANGE_DAYS[range] ?? RANGE_DAYS['1y'];
    const effectiveRange = RANGE_DAYS[range] ? range : '1y';

    const index = await this.indexRepo.findOne({ where: { id: indexId } });
    if (!index) throw new NotFoundException(`指数不存在: ${indexId}`);

    const [histories, values, mas, signals] = await Promise.all([
      this.historyRepo.find({ where: { indexId }, order: { tradeDate: 'ASC' } }),
      this.valueRepo.find({ where: { indexId }, order: { tradeDate: 'ASC' } }),
      this.maRepo.find({ where: { indexId }, order: { tradeDate: 'ASC' } }),
      this.signalRepo.find({ where: { indexId }, order: { tradeDate: 'DESC' }, take: 30 }),
    ]);

    const toStr = (d: Date | string): string => {
      if (typeof d === 'string') return d.slice(0, 10);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    if (values.length === 0) {
      return {
        indexId, name: index.name, range: effectiveRange,
        asOfDate: null,
        candles: [], overlays: { ma: {}, boll: {} },
        subcharts: { volume: {}, macd: {}, adx: {}, obv: {} },
        optional: {}, state: null, signals: [],
        disclaimer: '仅供参考,不构成投资建议',
        message: '指标尚未计算(等待 cron 批次或手动回填)',
      };
    }

    // asOfDate = 最近已算交易日(盘中请求当日无数据时即为此日)
    const lastValueDate = toStr(values[values.length - 1].tradeDate);
    const cutoff = days === Number.MAX_SAFE_INTEGER ? '0000-01-01' : shiftDays(lastValueDate, -days);

    // 区间内的 K线 + 指标 + MA,按日期对齐等长
    const valueByDate = new Map(values.map((v) => [toStr(v.tradeDate), v]));
    const maByDate = new Map(mas.map((m) => [toStr(m.tradeDate), m]));

    const candles: any[] = [];
    const ma = { ma20: [] as (number | null)[], ma60: [] as (number | null)[], ma120: [] as (number | null)[], ma250: [] as (number | null)[] };
    const boll = { mid: [] as (number | null)[], upper: [] as (number | null)[], lower: [] as (number | null)[] };
    const volume = { v: [] as (number | null)[], vma5: [] as (number | null)[], vma10: [] as (number | null)[], volumeRatio: [] as (number | null)[] };
    const macd = { dif: [] as (number | null)[], dea: [] as (number | null)[], hist: [] as (number | null)[] };
    const adx = { adx: [] as (number | null)[], pdi: [] as (number | null)[], mdi: [] as (number | null)[] };
    const obv = { obv: [] as (number | null)[], obvEma20: [] as (number | null)[] };
    const optional = { rsi: [] as (number | null)[], cmf: [] as (number | null)[], bias20: [] as (number | null)[], bias60: [] as (number | null)[], atr14: [] as (number | null)[], hv20: [] as (number | null)[] };

    for (const h of histories) {
      const date = toStr(h.tradeDate);
      if (date < cutoff) continue;
      const v = valueByDate.get(date);
      const m = maByDate.get(date);
      candles.push({
        date,
        o: r4(h.openPrice), h: r4(h.highPrice), l: r4(h.lowPrice), c: r4(h.closePrice),
        v: h.volume !== null && h.volume !== undefined ? r4(h.volume) : null,
      });
      ma.ma20.push(m ? r4(m.ma20) : null);
      ma.ma60.push(m ? r4(m.ma60) : null);
      ma.ma120.push(m ? r4((m as any).ma120) : null);
      ma.ma250.push(m ? r4((m as any).ma250) : null);
      boll.mid.push(v ? r4(v.bollMid) : null);
      boll.upper.push(v ? r4(v.bollUpper) : null);
      boll.lower.push(v ? r4(v.bollLower) : null);
      volume.v.push(h.volume !== null && h.volume !== undefined ? r4(h.volume) : null);
      volume.vma5.push(v ? r4(v.vma5) : null);
      volume.vma10.push(v ? r4(v.vma10) : null);
      volume.volumeRatio.push(v ? r4(v.volumeRatio) : null);
      macd.dif.push(v ? r4(v.macdDif) : null);
      macd.dea.push(v ? r4(v.macdDea) : null);
      macd.hist.push(v ? r4(v.macdHist) : null);
      adx.adx.push(v ? r4(v.adx) : null);
      adx.pdi.push(v ? r4(v.pdi) : null);
      adx.mdi.push(v ? r4(v.mdi) : null);
      obv.obv.push(v ? r4(v.obv) : null);
      obv.obvEma20.push(v ? r4(v.obvEma20) : null);
      optional.rsi.push(v ? r4(v.rsi) : null);
      optional.cmf.push(v ? r4(v.cmf) : null);
      optional.bias20.push(v ? r4(v.bias20) : null);
      optional.bias60.push(v ? r4(v.bias60) : null);
      optional.atr14.push(v ? r4(v.atr14) : null);
      optional.hv20.push(v ? r4(v.hv20) : null);
    }

    // 状态(asOfDate 当日)与近 30 条信号
    const lastState = await this.stateRepo.findOne({ where: { indexId, tradeDate: toDate(lastValueDate) } });
    const state = lastState
      ? { key: lastState.stateKey, label: labelOf(lastState.stateKey), basis: lastState.basis, date: toStr(lastState.tradeDate) }
      : null;

    return {
      indexId,
      name: index.name,
      range: effectiveRange,
      asOfDate: lastValueDate,
      candles,
      overlays: { ma, boll },
      subcharts: { volume, macd, adx, obv },
      optional,
      state,
      signals: signals.map((s) => ({
        date: toStr(s.tradeDate),
        type: s.type,
        direction: s.direction,
        basis: s.basis,
      })),
      disclaimer: '仅供参考,不构成投资建议',
    };
  }
}

const STATE_LABELS: Record<string, string> = {
  trendHealthy: '① 趋势健康',
  topWarning: '② 顶部预警',
  trendStart: '③ 趋势启动',
  rangebound: '④ 震荡市',
  bottomZone: '⑤ 底部区域',
  bearWeak: '⑥ 空头弱势',
  bullPullback: '⑦ 多头回调',
  bearRebound: '⑧ 空头反弹',
  breakdownConfirmed: '⑨ 破位确认',
  wait: '⑩ 观望',
};
const labelOf = (key: string) => STATE_LABELS[key] ?? key;

function toDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function shiftDays(dateStr: string, delta: number): string {
  const d = toDate(dateStr);
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
