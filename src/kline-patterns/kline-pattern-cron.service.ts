import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { KLinePatternService } from './kline-pattern.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Index } from '../indices/entities/index.entity';

/**
 * K线形态分析定时任务服务
 * 
 * 1. 收盘后批量计算（工作日16:00执行）
 * 2. 盘中实时计算（工作日上午9:30-15:00，每分钟执行）
 */
@Injectable()
export class KLinePatternCronService {
  private readonly logger = new Logger(KLinePatternCronService.name);
  private isRealtimeRunning = false;

  constructor(
    private klinePatternService: KLinePatternService,
    @InjectRepository(Index)
    private indexRepo: Repository<Index>,
  ) {}

  /**
   * 收盘后批量计算K线形态
   * 每个交易日16:00执行，计算当日所有指数的静态K线形态
   */
  @Cron(CronExpression.EVERY_DAY_AT_4PM)
  async handleDailyBatchAnalysis() {
    this.logger.log('触发收盘后批量K线形态分析');

    try {
      // 获取所有启用自动同步的指数
      const indices = await this.indexRepo.find({
        where: { 
          isActive: true
        }
      });

      // 过滤出 metadata.participateInKlinePattern 为 true 的指数
      const participatingIndices = indices.filter(index => 
        index.metadata?.participateInKlinePattern === true
      );

      if (participatingIndices.length === 0) {
        this.logger.warn('没有需要分析的指数');
        return;
      }

      const indexIds = participatingIndices.map(i => i.id);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await this.klinePatternService.batchAnalyzePatterns(indexIds, today);
      
      this.logger.log(`批量分析完成，共分析 ${indexIds.length} 个指数`);
    } catch (error) {
      this.logger.error(`批量分析失败: ${error.message}`, error.stack);
    }
  }

  /**
   * 盘中实时计算K线形态
   * 工作日上午9:30-15:00，每分钟执行一次
   */
  @Cron('0 * 9-15 * * 1-5') // 工作日 9:00-15:59
  async handleRealtimeAnalysis() {
    // 防止重复执行
    if (this.isRealtimeRunning) {
      this.logger.warn('实时分析仍在运行，跳过本次执行');
      return;
    }

    this.isRealtimeRunning = true;

    try {
      this.logger.debug('触发盘中实时K线形态分析');
      
      await this.klinePatternService.realtimeAnalyzeAll();
      
      this.logger.debug('实时分析完成');
    } catch (error) {
      this.logger.error(`实时分析失败: ${error.message}`, error.stack);
    } finally {
      this.isRealtimeRunning = false;
    }
  }

  /**
   * 手动触发批量分析（用于测试或补算）
   */
  async triggerManualBatchAnalysis(tradeDate?: Date): Promise<void> {
    const date = tradeDate || new Date();
    
    const indices = await this.indexRepo.find({
      where: { isActive: true }
    });

    const indexIds = indices.map(i => i.id);
    
    this.logger.log(`手动触发批量分析，日期: ${date}, 指数数量: ${indexIds.length}`);
    
    await this.klinePatternService.batchAnalyzePatterns(indexIds, date);
  }

  /**
   * 手动触发明细分析（用于测试）
   */
  async triggerManualRealtimeAnalysis(): Promise<void> {
    this.logger.log('手动触发实时分析');
    
    await this.klinePatternService.realtimeAnalyzeAll();
  }
}
