import { Controller, Get, Post, Body, Query, Param, ParseUUIDPipe } from '@nestjs/common';
import { KLinePatternService } from './kline-pattern.service';
import { AnalyzePatternDto, GetPatternHistoryDto } from './dto/analyze-pattern.dto';

/**
 * K线形态分析控制器
 */
@Controller('kline-patterns')
export class KLinePatternController {
  constructor(private readonly klinePatternService: KLinePatternService) {}

  /**
   * 分析指定指数的K线形态
   */
  @Post('analyze')
  async analyze(@Body() dto: AnalyzePatternDto) {
    const tradeDate = dto.tradeDate || new Date();
    
    const result = await this.klinePatternService.analyzeKLinePattern(
      dto.indexId,
      tradeDate,
      dto.isRealtime || false
    );

    return {
      success: !!result,
      data: result
    };
  }

  /**
   * 获取指数的K线形态历史
   */
  @Get('history/:indexId')
  async getHistory(
    @Param('indexId', ParseUUIDPipe) indexId: string,
    @Query() query: GetPatternHistoryDto
  ) {
    const limit = query.limit || 10;
    const isRealtime = query.isRealtime || false;

    const patterns = await this.klinePatternService.getRecentPatterns(
      indexId,
      limit,
      isRealtime
    );

    return {
      success: true,
      data: patterns
    };
  }

  /**
   * 获取指定日期的K线形态
   */
  @Get(':indexId/:date')
  async getByDate(
    @Param('indexId', ParseUUIDPipe) indexId: string,
    @Param('date') date: string,
    @Query('isRealtime') isRealtime?: boolean
  ) {
    const tradeDate = new Date(date);
    
    const pattern = await this.klinePatternService.getPatternByDate(
      indexId,
      tradeDate,
      isRealtime || false
    );

    return {
      success: !!pattern,
      data: pattern
    };
  }

  /**
   * 批量分析所有活跃指数（收盘后使用）
   */
  @Post('batch-analyze')
  async batchAnalyze(@Body('tradeDate') tradeDate?: string) {
    const date = tradeDate ? new Date(tradeDate) : new Date();
    
    // TODO: 获取所有需要分析的指数ID
    // 这里简化处理，实际应该从indices表获取标记了"参与K线形态计算"的指数
    
    return {
      success: true,
      message: '批量分析已触发'
    };
  }

  /**
   * 实时分析所有活跃指数（盘中使用）
   */
  @Post('realtime-analyze')
  async realtimeAnalyze() {
    await this.klinePatternService.realtimeAnalyzeAll();
    
    return {
      success: true,
      message: '实时分析已完成'
    };
  }
}
