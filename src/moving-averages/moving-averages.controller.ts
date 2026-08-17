import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { MovingAveragesService } from './moving-averages.service';
import { IndicesService } from '../indices/indices.service';

@ApiTags('移动平均线(MA)计算')
@Controller('moving-averages')
export class MovingAveragesController {
  constructor(
    private readonly maService: MovingAveragesService,
    private readonly indicesService: IndicesService,
  ) {}

  @Post('calculate/:indexId')
  @ApiOperation({ summary: '计算单个指数的MA数据' })
  async calculateForIndex(@Param('indexId') indexId: string) {
    const index = await this.indicesService.findOne(indexId);
    const result = await this.maService.calculateAndSaveMAForIndex(index);
    return {
      success: true,
      ...result,
    };
  }

  @Post('recalculate-recent/:indexId')
  @ApiOperation({
    summary: '重新计算最近N个交易日的MA数据',
    description: '根据历史记录重新计算最近N个交易日的移动均线，默认5个交易日。会先删除旧数据再重新计算。',
  })
  async recalculateRecent(
    @Param('indexId') indexId: string,
    @Query('days') days: string = '5',
  ) {
    const index = await this.indicesService.findOne(indexId);
    const tradingDays = parseInt(days, 10);

    if (isNaN(tradingDays) || tradingDays < 1 || tradingDays > 100) {
      return {
        success: false,
        message: 'days参数错误，请输入1-100之间的整数',
      };
    }

    const result = await this.maService.recalculateMAForRecentTradingDays(
      index,
      tradingDays,
    );
    return {
      success: true,
      ...result,
    };
  }

  @Post('calculate-all')
  @ApiOperation({ summary: '批量计算所有指数的MA数据' })
  async calculateForAllIndices() {
    const indices = await this.indicesService.findAll();
    const result = await this.maService.calculateMAForAllIndices(indices);
    return {
      success: true,
      ...result,
    };
  }

  @Post('recalculate-recent-all')
  @ApiOperation({
    summary: '批量重新计算所有指数的最近N个交易日MA数据',
    description: '针对所有指数，根据历史记录重新计算最近N个交易日的移动均线，默认5个交易日。',
  })
  async recalculateRecentForAllIndices(@Query('days') days: string = '5') {
    const indices = await this.indicesService.findAll();
    const tradingDays = parseInt(days, 10);

    if (isNaN(tradingDays) || tradingDays < 1 || tradingDays > 100) {
      return {
        success: false,
        message: 'days参数错误，请输入1-100之间的整数',
      };
    }

    const result = await this.maService.recalculateMAForAllIndices(
      indices,
      tradingDays,
    );
    return {
      success: true,
      total: result.total,
      successCount: result.success,
      failedCount: result.failed,
      results: result.results,
    };
  }

  @Get('ranking/latest')
  @ApiOperation({ summary: '获取所有指数最新MA排名（按偏离率）' })
  async getLatestRanking() {
    const data = await this.maService.getAllLatestMAData();

    // 按偏离率降序排列
    const sortedData = data
      .filter((item) => item.deviationRate !== null)
      .sort((a, b) => (b.deviationRate || 0) - (a.deviationRate || 0))
      .map((item, index) => ({
        rank: index + 1,
        indexCode: item.index?.code,
        indexName: item.index?.name,
        tradeDate: item.tradeDate,
        closePrice: item.closePrice,
        ma20: item.ma20,
        deviationRate: item.deviationRate,
        ma5: item.ma5,
        ma10: item.ma10,
        ma60: item.ma60,
      }));

    return {
      success: true,
      count: sortedData.length,
      data: sortedData,
    };
  }

  @Get(':indexId/latest')
  @ApiOperation({ summary: '获取指定指数的最新MA数据' })
  async getLatestMA(@Param('indexId') indexId: string) {
    const data = await this.maService.getLatestMAData(indexId);
    if (!data) {
      return {
        success: false,
        message: '暂无MA数据',
      };
    }
    return {
      success: true,
      data,
    };
  }

  @Get(':indexId')
  @ApiOperation({ summary: '获取指定指数的MA数据' })
  async getMAData(
    @Param('indexId') indexId: string,
    @Query('limit') limit: string = '100',
  ) {
    const data = await this.maService.getMADataByIndexId(
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
