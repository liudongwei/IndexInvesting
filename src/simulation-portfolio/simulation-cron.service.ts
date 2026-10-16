import { Injectable, Logger } from '@nestjs/common';

/**
 * 模拟交易定时任务服务
 * 
 * 注意：所有定时任务已迁移到 cron-config 模块统一管理
 * 可以通过 admin 后台灵活配置和触发
 * 
 * @deprecated 此类保留仅作为兼容，实际功能由 CronConfigService 提供
 */
@Injectable()
export class SimulationCronService {
  private readonly logger = new Logger(SimulationCronService.name);

  constructor() {
    this.logger.warn('SimulationCronService 已弃用，请使用 CronConfigService');
  }
}
