import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TrendAnalysisService } from './trend-analysis.service';
import { IndicesService } from '../indices/indices.service';

@Injectable()
export class TrendCronService {
  private readonly logger = new Logger(TrendCronService.name);

  constructor(
    private readonly trendService: TrendAnalysisService,
    private readonly indicesService: IndicesService,
  ) {}

  /**
   * 定时任务：每天早上7点执行趋势分析（MA计算完成后）
   * 等MA计算完成（06:30）后再执行趋势分析
   * 使用增量计算模式，只计算新增的数据
   */
  @Cron('0 7 * * *')
  async handleDailyTrendAnalysis() {
    this.logger.log('执行定时趋势分析任务（MA计算已完成，增量模式）...');
    try {
      const indices = await this.indicesService.findAll();
      const activeIndices = indices.filter((i) => i.isActive);

      // 使用增量计算模式
      const result =
        await this.trendService.performIncrementalAnalysis(activeIndices);
      this.logger.log(
        `定时趋势分析完成: ${result.total} 条数据，增量: ${result.incrementalCalculated} 个，全量: ${result.fullCalculated} 个，跳过: ${result.skipped} 个`,
      );
    } catch (error) {
      this.logger.error(`定时趋势分析失败: ${error.message}`);
    }
  }

  /**
   * 定时任务：每周一凌晨3点执行全量趋势分析
   * 暂时注释，如需全量分析建议在MA全量计算完成后执行
   * 避免与增量分析冲突，减少系统负载
   */
  // @Cron('0 3 * * 1')
  // async handleWeeklyFullAnalysis() {
  //   this.logger.log('执行每周全量趋势分析任务...');
  //   try {
  //     const indices = await this.indicesService.findAll();
  //     const result = await this.trendService.performFullAnalysis(indices);
  //     this.logger.log(`每周全量趋势分析完成: ${result.total} 条数据`);
  //   } catch (error) {
  //     this.logger.error(`每周全量趋势分析失败: ${error.message}`);
  //   }
  // }

  /**
   * 执行全量趋势分析（供MA全量计算后调用）
   * 在每周MA全量计算完成后执行，确保数据一致性
   */
  async performFullAnalysisAfterMACalculation() {
    this.logger.log('MA全量计算完成，执行全量趋势分析...');
    try {
      const indices = await this.indicesService.findAll();
      const result = await this.trendService.performFullAnalysis(indices);
      this.logger.log(`全量趋势分析完成: ${result.total} 条数据`);
      return result;
    } catch (error) {
      this.logger.error(`全量趋势分析失败: ${error.message}`);
      throw error;
    }
  }
}
