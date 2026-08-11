import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MovingAveragesService } from './moving-averages.service';
import { IndicesService } from '../indices/indices.service';
import { TrendCronService } from '../trend-analysis/trend-cron.service';

@Injectable()
export class MACronService {
  private readonly logger = new Logger(MACronService.name);

  constructor(
    private readonly maService: MovingAveragesService,
    private readonly indicesService: IndicesService,
    private readonly trendCronService: TrendCronService,
  ) {}

  /**
   * 定时任务：每天早上6点30分计算MA数据（所有市场收盘后）
   * 等所有市场数据同步完成（贵金属06:00最后）后再计算
   * 使用增量计算模式，只计算新增的数据
   */
  @Cron('30 6 * * *')
  async handleDailyMACalculation() {
    this.logger.log('执行定时MA计算任务（所有市场数据已同步，增量模式）...');
    try {
      const indices = await this.indicesService.findAll();
      const activeIndices = indices.filter((i) => i.isActive);

      // 使用增量计算模式
      const result = await this.maService.calculateMAForAllIndices(
        activeIndices,
        true,
      );
      this.logger.log(
        `定时MA计算完成: ${result.total} 条数据，全量: ${result.fullCalculated} 个，增量: ${result.incrementalCalculated} 个，跳过: ${result.skipped} 个`,
      );
    } catch (error) {
      this.logger.error(`定时MA计算失败: ${error.message}`);
    }
  }

  /**
   * 定时任务：每周日凌晨2点全量重新计算（清理历史数据后重新计算）
   * 使用全量计算模式，重新计算所有数据
   * MA计算完成后自动触发全量趋势分析
   */
  @Cron('0 2 * * 0') // 每周日 02:00
  async handleWeeklyFullCalculation() {
    this.logger.log('执行每周全量MA计算任务...');
    try {
      const indices = await this.indicesService.findAll();
      // 使用全量计算模式（incremental=false）
      const result = await this.maService.calculateMAForAllIndices(
        indices,
        false,
      );
      this.logger.log(
        `每周全量MA计算完成: ${result.total} 条数据，全量: ${result.fullCalculated} 个，增量: ${result.incrementalCalculated} 个`,
      );

      // MA全量计算完成后，执行全量趋势分析
      this.logger.log('MA全量计算完成，开始执行全量趋势分析...');
      await this.trendCronService.performFullAnalysisAfterMACalculation();
    } catch (error) {
      this.logger.error(`每周全量MA计算失败: ${error.message}`);
    }
  }
}