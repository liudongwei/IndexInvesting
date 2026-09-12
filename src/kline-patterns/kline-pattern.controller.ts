import { Controller, Get, Post, Body, Query, Param, ParseUUIDPipe, ValidationPipe } from '@nestjs/common';
import { KLinePatternService } from './kline-pattern.service';
import { AnalyzePatternDto, GetPatternHistoryDto, QueryPatternDto } from './dto/analyze-pattern.dto';
import { CalculateKLinePatternDto } from './dto/calculate-kline-pattern.dto';

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

  /**
   * 按条件查询K线形态数据（支持分页）
   * @param query 查询参数
   * @param query.indexId 可选，指数ID
   * @param query.startDate 可选，开始日期
   * @param query.endDate 可选，结束日期
   * @param query.isRealtime 可选，是否实时数据
   * @param query.trendState 可选，趋势状态 (uptrend/downtrend/sideways)
   * @param query.patternName 可选，形态名称（支持模糊搜索）
   * @param query.signal 可选，信号类型 (buy/sell/neutral)
   * @param query.page 可选，页码（默认1）
   * @param query.pageSize 可选，每页条数（默认20）
   */
  @Get('query')
  async query(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: QueryPatternDto) {
    const result = await this.klinePatternService.queryPatterns(
      query.indexId,
      query.startDate,
      query.endDate,
      query.isRealtime,
      query.trendState,
      query.patternName,
      query.signal,
      query.page || 1,
      query.pageSize || 20
    );

    return {
      success: true,
      ...result
    };
  }

  /**
   * 批量计算K线形态（用于验证计算准确性）
   * @param dto 计算参数
   */
  @Post('calculate-verify')
  async calculateVerify(@Body(new ValidationPipe({ whitelist: true })) dto: CalculateKLinePatternDto) {
    const tradeDate = dto.tradeDate ? new Date(dto.tradeDate) : new Date();
    
    // 设置时间为当天0点
    tradeDate.setHours(0, 0, 0, 0);

    let indexIds: string[] = [];

    // 确定要计算的指数ID列表
    if (dto.indexId) {
      indexIds = [dto.indexId];
    } else if (dto.indexIds && dto.indexIds.length > 0) {
      indexIds = dto.indexIds;
    } else {
      // 如果没有指定指数，获取所有参与K线形态计算的指数
      const indices = await this.klinePatternService.getParticipatingIndices();
      indexIds = indices.map(idx => idx.id);
    }

    if (indexIds.length === 0) {
      return {
        success: false,
        message: '没有找到需要计算的指数',
        data: []
      };
    }

    // 批量计算
    const results = await this.klinePatternService.batchCalculateForVerification(
      indexIds,
      tradeDate
    );

    return {
      success: true,
      message: `成功计算 ${results.length} 个指数的K线形态`,
      data: results,
      total: results.length
    };
  }
}
