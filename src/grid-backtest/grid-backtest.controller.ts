import { Controller, Get, Post, Delete, Body, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GridBacktestService } from './grid-backtest.service';
import { RunGridBacktestDto, SuggestParamsDto, ScanGridDto } from './dto/grid-backtest.dto';

/**
 * 网格回测控制器（管理后台，与现有 admin/* 路由约定一致）
 */
@UseGuards(JwtAuthGuard)
@Controller('admin/grid-backtest')
export class GridBacktestController {
  constructor(private readonly service: GridBacktestService) {}

  /** 运行一次回测并保存记录 */
  @Post('runs')
  run(@Body() dto: RunGridBacktestDto) {
    return this.service.run(dto);
  }

  /** 按区间波动自动建议网格参数 */
  @Post('suggest')
  suggest(@Body() dto: SuggestParamsDto) {
    return this.service.suggest(dto);
  }

  /** 参数敏感性扫描（网格数 × 上界比例矩阵） */
  @Post('scan')
  scan(@Body() dto: ScanGridDto) {
    return this.service.scan(dto);
  }

  /** 历史回测记录列表（不含曲线/明细） */
  @Get('runs')
  list() {
    return this.service.list();
  }

  /** 单条回测详情（含曲线/明细，K线按参数重新解析） */
  @Get('runs/:id')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getOne(id);
  }

  /** 删除回测记录 */
  @Delete('runs/:id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
