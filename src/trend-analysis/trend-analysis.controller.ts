import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TrendAnalysisService } from './trend-analysis.service';
import { IndicesService } from '../indices/indices.service';

@ApiTags('趋势分析')
@Controller('trend-analysis')
export class TrendAnalysisController {
  constructor(
    private readonly trendService: TrendAnalysisService,
    private readonly indicesService: IndicesService,
  ) {}

  @Post('analyze-all')
  @ApiOperation({ summary: '执行全量趋势分析' })
  async analyzeAll() {
    const indices = await this.indicesService.findAll();
    const result = await this.trendService.performFullAnalysis(indices);
    return {
      success: true,
      ...result,
    };
  }

  @Get('ranking/latest')
  @ApiOperation({ summary: '获取最新趋势排名（类似图中表格）' })
  async getLatestRanking() {
    const data = await this.trendService.getLatestTrendRanking();
    
    // 格式化为表格形式
    const formatted = data.map((item) => ({
      rank: item.rank,
      code: item.index?.code,
      name: item.index?.name,
      changePercent: item.changePercent,
      closePrice: item.closePrice,
      ma20: item.ma20,
      deviationRate: item.deviationRate,
      volumeRatio: item.volumeRatio,
      statusChangeDate: item.statusChangeDate,
      intervalChangePercent: item.intervalChangePercent,
      rankChange: item.rankChange,
    }));

    return {
      success: true,
      tradeDate: data[0]?.tradeDate,
      totalCount: formatted.length,
      data: formatted,
    };
  }

  @Get(':indexId')
  @ApiOperation({ summary: '获取指定指数的趋势分析历史' })
  async getTrendHistory(
    @Param('indexId') indexId: string,
    @Query('limit') limit: string = '100',
  ) {
    const data = await this.trendService.getTrendAnalysisByIndexId(
      indexId,
      parseInt(limit, 10),
    );
    return {
      success: true,
      count: data.length,
      data,
    };
  }
}
