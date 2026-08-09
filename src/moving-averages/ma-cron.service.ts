import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MovingAveragesService } from './moving-averages.service';
import { IndicesService } from '../indices/indices.service';

@Injectable()
export class MACronService {
  private readonly logger = new Logger(MACronService.name);

  constructor(
    private readonly maService: MovingAveragesService,
    private readonly indicesService: IndicesService,
  ) {}

  /**
   * 定时任务：每天下午4点30分计算MA数据（收盘后）
   */
  @Cron('30 16 * * *')
  async handleDailyMACalculation() {
    this.logger.log('执行定时MA计算任务...');
    try {
      const indices = await this.indicesService.findAll();
      const activeIndices = indices.filter((i) => i.isActive);

      const result = await this.maService.calculateMAForAllIndices(activeIndices);
      this.logger.log(`定时MA计算完成: ${result.total} 条数据`);
    } catch (error) {
      this.logger.error(`定时MA计算失败: ${error.message}`);
    }
  }

  /**
   * 定时任务：每周日凌晨2点全量重新计算（清理历史数据后重新计算）
   */
  @Cron(CronExpression.EVERY_WEEKEND)
  async handleWeeklyFullCalculation() {
    this.logger.log('执行每周全量MA计算任务...');
    try {
      const indices = await this.indicesService.findAll();
      const result = await this.maService.calculateMAForAllIndices(indices);
      this.logger.log(`每周全量MA计算完成: ${result.total} 条数据`);
    } catch (error) {
      this.logger.error(`每周全量MA计算失败: ${error.message}`);
    }
  }
}
