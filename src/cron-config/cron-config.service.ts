import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { CronConfig } from './entities/cron-config.entity';
import { CreateCronConfigDto } from './dto/create-cron-config.dto';
import { UpdateCronConfigDto } from './dto/update-cron-config.dto';
import { IndexSyncService } from '../indices/index-sync.service';
import { MACronService } from '../moving-averages/ma-cron.service';
import { TrendCronService } from '../trend-analysis/trend-cron.service';

// 预定义的 Cron 任务配置
export const DEFAULT_CRON_CONFIGS: Partial<CronConfig>[] = [
  {
    taskName: 'aStockSync',
    cronExpression: '5 15 * * *',
    displayName: 'A股数据同步',
    description: 'A股收盘后同步数据（15:05）',
    category: '数据同步',
    isEnabled: true,
  },
  {
    taskName: 'hkStockSync',
    cronExpression: '15 16 * * *',
    displayName: '港股数据同步',
    description: '港股收盘后同步数据（16:15）',
    category: '数据同步',
    isEnabled: true,
  },
  {
    taskName: 'taiwanStockSync',
    cronExpression: '35 13 * * *',
    displayName: '台湾市场数据同步',
    description: '台湾市场收盘后同步数据（13:35）',
    category: '数据同步',
    isEnabled: true,
  },
  {
    taskName: 'japanKoreaStockSync',
    cronExpression: '35 14 * * *',
    displayName: '日韩市场数据同步',
    description: '日韩市场收盘后同步数据（14:35）',
    category: '数据同步',
    isEnabled: true,
  },
  {
    taskName: 'europeStockSync',
    cronExpression: '35 0 * * *',
    displayName: '欧洲市场数据同步',
    description: '欧洲市场收盘后同步数据（00:35）',
    category: '数据同步',
    isEnabled: true,
  },
  {
    taskName: 'usStockSync',
    cronExpression: '5 5 * * *',
    displayName: '美股数据同步',
    description: '美股收盘后同步数据（05:05）',
    category: '数据同步',
    isEnabled: true,
  },
  {
    taskName: 'preciousMetalSync',
    cronExpression: '5 7 * * *',
    displayName: '贵金属数据同步',
    description: '贵金属结算后同步数据（07:05）',
    category: '数据同步',
    isEnabled: true,
  },
  {
    taskName: 'dailyMACalculation',
    cronExpression: '30 6 * * *',
    displayName: '每日MA计算',
    description: '每天早上6:30计算移动平均线（增量模式）',
    category: '指标计算',
    isEnabled: false, // 已改为实时计算，默认禁用
  },
  {
    taskName: 'weeklyFullMACalculation',
    cronExpression: '0 2 * * 0',
    displayName: '每周全量MA计算',
    description: '每周日凌晨2:00全量重新计算MA',
    category: '指标计算',
    isEnabled: true,
  },
  {
    taskName: 'dailyTrendAnalysis',
    cronExpression: '0 7 * * *',
    displayName: '每日趋势分析',
    description: '每天早上7:00执行趋势分析（增量模式）',
    category: '趋势分析',
    isEnabled: false, // 已改为实时计算，默认禁用
  },
];

@Injectable()
export class CronConfigService implements OnModuleInit {
  private readonly logger = new Logger(CronConfigService.name);

  constructor(
    @InjectRepository(CronConfig)
    private cronConfigRepo: Repository<CronConfig>,
    private schedulerRegistry: SchedulerRegistry,
    private indexSyncService: IndexSyncService,
    private maCronService: MACronService,
    private trendCronService: TrendCronService,
  ) {}

  async onModuleInit() {
    this.logger.log('初始化 Cron 配置服务...');
    await this.initializeDefaultConfigs();
    await this.initializeCronJobs();
  }

  /**
   * 初始化默认配置（如果不存在）
   */
  private async initializeDefaultConfigs() {
    for (const config of DEFAULT_CRON_CONFIGS) {
      const exists = await this.cronConfigRepo.findOne({
        where: { taskName: config.taskName },
      });
      if (!exists) {
        await this.cronConfigRepo.save(config);
        this.logger.log(`创建默认 Cron 配置: ${config.taskName}`);
      }
    }
  }

  /**
   * 初始化所有启用的 Cron 任务
   */
  async initializeCronJobs() {
    const configs = await this.cronConfigRepo.find({
      where: { isEnabled: true },
    });

    for (const config of configs) {
      try {
        this.addCronJob(config);
        this.logger.log(`启动 Cron 任务: ${config.taskName} (${config.cronExpression})`);
      } catch (error) {
        this.logger.error(`启动 Cron 任务失败 ${config.taskName}: ${error.message}`);
      }
    }
  }

  /**
   * 添加 Cron 任务
   */
  private addCronJob(config: CronConfig) {
    // 如果已存在，先删除
    if (this.schedulerRegistry.doesExist('cron', config.taskName)) {
      this.deleteCronJob(config.taskName);
    }

    const job = new CronJob(config.cronExpression, async () => {
      this.logger.log(`执行 Cron 任务: ${config.taskName}`);
      const startTime = Date.now();
      
      try {
        await this.executeTask(config.taskName);
        
        // 更新执行记录
        await this.cronConfigRepo.update(config.taskName, {
          lastExecutedAt: new Date(),
          executionCount: () => 'executionCount + 1',
          lastError: '',
        });
        
        this.logger.log(`Cron 任务完成: ${config.taskName} (${Date.now() - startTime}ms)`);
      } catch (error) {
        this.logger.error(`Cron 任务失败 ${config.taskName}: ${error.message}`);
        await this.cronConfigRepo.update(config.taskName, {
          lastExecutedAt: new Date(),
          lastError: error.message,
        });
      }
    });

    this.schedulerRegistry.addCronJob(config.taskName, job);
    job.start();
  }

  /**
   * 执行任务映射
   */
  private async executeTask(taskName: string) {
    switch (taskName) {
      // 数据同步任务
      case 'aStockSync':
        return this.indexSyncService.handleAStockSync();
      case 'hkStockSync':
        return this.indexSyncService.handleHKStockSync();
      case 'taiwanStockSync':
        return this.indexSyncService.handleTaiwanStockSync();
      case 'japanKoreaStockSync':
        return this.indexSyncService.handleJapanKoreaStockSync();
      case 'europeStockSync':
        return this.indexSyncService.handleEuropeStockSync();
      case 'usStockSync':
        return this.indexSyncService.handleUSStockSync();
      case 'preciousMetalSync':
        return this.indexSyncService.handlePreciousMetalSync();

      // MA 计算任务
      case 'dailyMACalculation':
        return this.maCronService.handleDailyMACalculation();
      case 'weeklyFullMACalculation':
        return this.maCronService.handleWeeklyFullCalculation();

      // 趋势分析任务
      case 'dailyTrendAnalysis':
        return this.trendCronService.handleDailyTrendAnalysis();

      default:
        throw new Error(`未知的任务名称: ${taskName}`);
    }
  }

  /**
   * 删除 Cron 任务
   */
  private deleteCronJob(name: string) {
    try {
      if (this.schedulerRegistry.doesExist('cron', name)) {
        this.schedulerRegistry.deleteCronJob(name);
      }
    } catch (error) {
      this.logger.warn(`删除 Cron 任务失败 ${name}: ${error.message}`);
    }
  }

  /**
   * 获取所有配置
   */
  async findAll(): Promise<CronConfig[]> {
    return this.cronConfigRepo.find({ order: { category: 'ASC', taskName: 'ASC' } });
  }

  /**
   * 获取单个配置
   */
  async findOne(taskName: string): Promise<CronConfig | null> {
    return this.cronConfigRepo.findOne({ where: { taskName } });
  }

  /**
   * 创建配置
   */
  async create(dto: CreateCronConfigDto): Promise<CronConfig> {
    const config = this.cronConfigRepo.create(dto);
    const saved = await this.cronConfigRepo.save(config);
    
    if (saved.isEnabled) {
      this.addCronJob(saved);
    }
    
    return saved;
  }

  /**
   * 更新配置
   */
  async update(taskName: string, dto: UpdateCronConfigDto): Promise<CronConfig> {
    const config = await this.cronConfigRepo.findOne({ where: { taskName } });
    if (!config) {
      throw new Error(`配置不存在: ${taskName}`);
    }

    // 更新数据库
    await this.cronConfigRepo.update(taskName, dto);
    const updated = await this.cronConfigRepo.findOne({ where: { taskName } });
    if (!updated) {
      throw new Error(`更新后找不到配置: ${taskName}`);
    }

    // 重新调度任务
    if (this.schedulerRegistry.doesExist('cron', taskName)) {
      this.deleteCronJob(taskName);
    }
    
    if (updated.isEnabled) {
      this.addCronJob(updated);
    }

    return updated;
  }

  /**
   * 切换任务启用状态
   */
  async toggle(taskName: string): Promise<CronConfig> {
    const config = await this.cronConfigRepo.findOne({ where: { taskName } });
    if (!config) {
      throw new Error(`配置不存在: ${taskName}`);
    }

    const newStatus = !config.isEnabled;
    await this.cronConfigRepo.update(taskName, { isEnabled: newStatus });
    const updated = await this.cronConfigRepo.findOne({ where: { taskName } });
    if (!updated) {
      throw new Error(`切换状态后找不到配置: ${taskName}`);
    }

    if (newStatus) {
      this.addCronJob(updated);
      this.logger.log(`启用 Cron 任务: ${taskName}`);
    } else {
      this.deleteCronJob(taskName);
      this.logger.log(`禁用 Cron 任务: ${taskName}`);
    }

    return updated;
  }

  /**
   * 删除配置
   */
  async remove(taskName: string): Promise<void> {
    this.deleteCronJob(taskName);
    await this.cronConfigRepo.delete(taskName);
  }

  /**
   * 立即执行一次任务
   */
  async runOnce(taskName: string): Promise<{ success: boolean; message: string }> {
    const config = await this.cronConfigRepo.findOne({ where: { taskName } });
    if (!config) {
      throw new Error(`配置不存在: ${taskName}`);
    }

    try {
      this.logger.log(`手动执行 Cron 任务: ${taskName}`);
      await this.executeTask(taskName);
      
      await this.cronConfigRepo.update(taskName, {
        lastExecutedAt: new Date(),
        executionCount: () => 'executionCount + 1',
      });
      
      return { success: true, message: `任务 ${taskName} 执行成功` };
    } catch (error) {
      await this.cronConfigRepo.update(taskName, {
        lastError: error.message,
      });
      return { success: false, message: error.message };
    }
  }

  /**
   * 获取任务运行状态
   */
  getJobStatus(taskName: string): { running: boolean; nextRun?: Date } {
    try {
      const job = this.schedulerRegistry.getCronJob(taskName);
      if (!job) {
        return { running: false };
      }
      return {
        running: true,
        nextRun: job.nextDate().toJSDate(),
      };
    } catch {
      return { running: false };
    }
  }
}
