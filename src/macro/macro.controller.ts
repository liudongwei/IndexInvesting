import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { MacroService, METRIC_META } from './macro.service';

@Controller('macro')
export class MacroController {
  constructor(private readonly macroService: MacroService) {}

  /** 总览：每指标最新值 + 陈旧度 + 统一起点 */
  @Get('overview')
  getOverview() {
    return this.macroService.getOverview();
  }

  /** 指标字典（前端渲染用） */
  @Get('metrics')
  getMetrics() {
    return METRIC_META;
  }

  /** 区间序列：?metrics=usdcnh,dxy&from=2024-01-01&to=2026-11-18（均可选） */
  @Get('series')
  async getSeries(
    @Query('metrics') metrics?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const known = METRIC_META.map((m) => m.metric);
    const list = metrics
      ? metrics
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : known;
    const bad = list.filter((m) => !known.includes(m));
    if (bad.length) throw new BadRequestException(`unknown metrics: ${bad.join(',')}`);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
    const fromStr = from || '1900-01-01';
    const toStr = to || today;
    const data = await this.macroService.getSeries(list, fromStr, toStr);
    return { from: fromStr, to: toStr, series: data };
  }
}
