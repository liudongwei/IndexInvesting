import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PositionUpdateService } from './services/position-update.service';

/**
 * 模拟交易定时任务服务
 * 
 * 注意：这些任务也可以通过 cron-config 模块动态管理
 * 这里提供硬编码的默认配置作为备份
 */
@Injectable()
export class SimulationCronService {
  private readonly logger = new Logger(SimulationCronService.name);

  constructor(private positionUpdateService: PositionUpdateService) {}

  /**
   * 每5分钟更新持仓盈亏
   * 交易时段：9:30-11:30, 13:00-15:00
   */
  @Cron('*/5 9-11 * * 1-5') // 上午 9-11点，每5分钟，周一至周五
  async updatePositionsMorning() {
    this.logger.debug('执行早盘持仓更新任务...');
    await this.positionUpdateService.updatePositionsRealTime();
  }

  @Cron('*/5 13-15 * * 1-5') // 下午 13-15点，每5分钟，周一至周五
  async updatePositionsAfternoon() {
    this.logger.debug('执行午盘持仓更新任务...');
    await this.positionUpdateService.updatePositionsRealTime();
  }

  /**
   * 收盘后计算当日盈亏
   * 每个交易日 15:30 执行
   */
  @Cron('30 15 * * 1-5') // 周一至周五 15:30
  async calculateDailyProfit() {
    this.logger.debug('执行日终盈亏计算任务...');
    await this.positionUpdateService.calculateTodayProfit();
  }
}
