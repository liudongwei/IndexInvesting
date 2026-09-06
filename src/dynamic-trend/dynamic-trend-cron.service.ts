import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DynamicTrendService } from './dynamic-trend.service';

@Injectable()
export class DynamicTrendCronService {
  private readonly logger = new Logger(DynamicTrendCronService.name);

  constructor(private readonly dynamicTrendService: DynamicTrendService) {}

  /**
   * 每10分钟执行一次动态趋势计算（交易时间内）
   * 周一至周五的9:30-15:00期间执行
   */
  @Cron('*/10 9-15 * * 1-5') // 每10分钟，工作日
  async handleDynamicTrendCalculation() {
    this.logger.log('开始执行动态趋势计算...');
    try {
      await this.dynamicTrendService.calculateAndRank();
      this.logger.log('动态趋势计算完成');
    } catch (error) {
      this.logger.error('动态趋势计算失败:', error);
    }
  }

  /**
   * 每天凌晨清理旧数据（保留最近10次计算的数据）
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCleanOldData() {
    this.logger.log('开始清理旧的动态趋势数据...');
    try {
      await this.dynamicTrendService.cleanOldData(10);
      this.logger.log('旧数据清理完成');
    } catch (error) {
      this.logger.error('清理旧数据失败:', error);
    }
  }
}
