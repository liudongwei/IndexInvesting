import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
import { DynamicTrendService } from './dynamic-trend.service';
import { Index } from '../indices/entities/index.entity';

@Controller('dynamic-trend')
export class DynamicTrendController {
  constructor(private readonly dynamicTrendService: DynamicTrendService) {}

  /**
   * 获取参与动态趋势计算的指数列表
   */
  @Get('participating-indices')
  async getParticipatingIndices(@Query('type') indexType?: string): Promise<Index[]> {
    return this.dynamicTrendService.getParticipatingIndices(indexType);
  }

  /**
   * 获取最新动态趋势数据
   */
  @Get('latest')
  async getLatestData(@Query('type') indexType?: string) {
    const data = await this.dynamicTrendService.getLatestData(indexType);
    
    // 获取最新的计算时间
    const latestTime = data.length > 0 ? data[0].calculationTime : null;
    
    return {
      success: true,
      calculationTime: latestTime,
      totalCount: data.length,
      data,
    };
  }

  /**
   * 获取指定计算时间的数据
   */
  @Get('by-time/:calculationTime')
  async getDataByCalculationTime(
    @Param('calculationTime') calculationTime: string,
    @Query('type') indexType?: string,
  ) {
    const data = await this.dynamicTrendService.getDataByCalculationTime(
      new Date(calculationTime),
      indexType,
    );
    
    return {
      success: true,
      calculationTime,
      totalCount: data.length,
      data,
    };
  }

  /**
   * 手动触发动态趋势计算
   */
  @Post('calculate')
  async calculateAndRank() {
    try {
      await this.dynamicTrendService.calculateAndRank();
      return {
        success: true,
        message: '动态趋势计算完成',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || '计算失败',
      };
    }
  }

  /**
   * 清理旧数据
   */
  @Post('clean-old-data')
  async cleanOldData(@Body('keepCount') keepCount?: number) {
    try {
      await this.dynamicTrendService.cleanOldData(keepCount || 10);
      return {
        success: true,
        message: '清理完成',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || '清理失败',
      };
    }
  }
}
