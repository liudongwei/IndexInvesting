import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TrendAnalysisService } from './trend-analysis.service';
import { IndicesService } from '../indices/indices.service';
import { RecalculateTrendDto } from './dto/recalculate-trend.dto';

@ApiTags('趋势分析')
@Controller('trend-analysis')
export class TrendAnalysisController {
  constructor(
    private readonly trendService: TrendAnalysisService,
    private readonly indicesService: IndicesService,
  ) {}

  @Post('analyze-incremental')
  @ApiOperation({
    summary: '执行增量趋势分析',
    description: '只计算最新趋势日期之后的新增数据，适用于每日定时任务场景',
  })
  async analyzeIncremental() {
    const indices = await this.indicesService.findAll();
    const activeIndices = indices.filter((i) => i.isActive);

    const result =
      await this.trendService.performIncrementalAnalysis(activeIndices);
    return {
      success: true,
      ...result,
    };
  }

  @Post('analyze-all')
  @ApiOperation({
    summary: '执行全量趋势分析',
    description:
      '可指定年份范围进行分段计算，如startYear=1900&endYear=2000计算1900-2000年的数据',
  })
  async analyzeAll(
    @Query('startYear') startYear?: string,
    @Query('endYear') endYear?: string,
  ) {
    const indices = await this.indicesService.findAll();

    const startYearNum = startYear ? parseInt(startYear, 10) : undefined;
    const endYearNum = endYear ? parseInt(endYear, 10) : undefined;

    // 验证年份参数（支持从1900年开始，兼容日经225、标普等早期指数）
    if (
      startYear &&
      (isNaN(startYearNum!) || startYearNum! < 1900 || startYearNum! > 2100)
    ) {
      return {
        success: false,
        message: '开始年份格式错误，请输入 1900-2100 之间的年份',
      };
    }
    if (
      endYear &&
      (isNaN(endYearNum!) || endYearNum! < 1900 || endYearNum! > 2100)
    ) {
      return {
        success: false,
        message: '结束年份格式错误，请输入 1900-2100 之间的年份',
      };
    }

    const result = await this.trendService.performFullAnalysis(
      indices,
      startYearNum,
      endYearNum,
    );
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
      code: item.index?.officialCode,
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

  @Get('ranking/by-date')
  @ApiOperation({ summary: '获取指定日期的趋势排名' })
  async getRankingByDate(@Query('date') date: string) {
    if (!date) {
      return {
        success: false,
        message: '请提供日期参数（格式：YYYY-MM-DD）',
      };
    }

    try {
      const data = await this.trendService.getTrendRankingByDate(date);

      if (data.length === 0) {
        return {
          success: false,
          message: `未找到 ${date} 的趋势数据`,
        };
      }

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
        tradeDate: date,
        totalCount: formatted.length,
        data: formatted,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
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

  @Post('recalculate')
  @ApiOperation({
    summary: '按日期范围重新计算趋势分析',
    description:
      '删除指定日期范围内的旧数据，然后重新计算趋势分析。用于补数据后重新计算。请求体：{ startDate: "2024-01-01", endDate: "2024-12-31" }',
  })
  async recalculateTrendAnalysis(@Body() dto: RecalculateTrendDto) {
    // 验证日期参数
    if (!dto.startDate || !dto.endDate) {
      return {
        success: false,
        message: '请提供 startDate 和 endDate 参数（格式：YYYY-MM-DD）',
      };
    }

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return {
        success: false,
        message: '日期格式错误，请使用 YYYY-MM-DD 格式',
      };
    }

    if (startDate > endDate) {
      return {
        success: false,
        message: '开始日期不能大于结束日期',
      };
    }

    const indices = await this.indicesService.findAll();

    const result = await this.trendService.recalculateTrendAnalysis(
      indices,
      startDate,
      endDate,
    );

    return {
      success: true,
      ...result,
    };
  }
}
