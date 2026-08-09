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
}
