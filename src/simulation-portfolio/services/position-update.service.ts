import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { SimulationPosition } from '../entities/simulation-position.entity';
import { SimulationAccount } from '../entities/simulation-account.entity';
import { SimulationDailySnapshot } from '../entities/simulation-daily-snapshot.entity';
import { SimulationTaskLog } from '../entities/simulation-task-log.entity';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class PositionUpdateService {
  private readonly logger = new Logger(PositionUpdateService.name);

  constructor(
    @InjectRepository(SimulationPosition)
    private positionRepository: Repository<SimulationPosition>,
    @InjectRepository(SimulationAccount)
    private accountRepository: Repository<SimulationAccount>,
    @InjectRepository(SimulationDailySnapshot)
    private snapshotRepository: Repository<SimulationDailySnapshot>,
    @InjectRepository(SimulationTaskLog)
    private taskLogRepository: Repository<SimulationTaskLog>,
    private httpService: HttpService,
  ) {}

  /**
   * 定时更新持仓盈亏（每5分钟）
   */
  async updatePositionsRealTime(): Promise<void> {
    const startTime = Date.now();
    this.logger.log('开始更新持仓实时盈亏...');

    try {
      // 1. 获取所有活跃持仓
      const positions = await this.positionRepository.find({
        where: { quantity: MoreThan(0) },
        relations: ['instrument'] as any,
      });

      if (positions.length === 0) {
        this.logger.log('无持仓需要更新');
        return;
      }

      let updatedCount = 0;

      // 2. 批量获取腾讯API价格
      const instrumentCodes = [
        ...new Set(positions.map((p) => p.instrument.tencentCode)),
      ];

      for (const tencentCode of instrumentCodes) {
        try {
          // 调用腾讯API
          const quote = await this.getTencentRealTimeQuote(tencentCode);

          // 3. 更新所有相关持仓
          const relatedPositions = positions.filter(
            (p) => p.instrument.tencentCode === tencentCode,
          );

          for (const position of relatedPositions) {
            position.currentPrice = quote.currentPrice;
            position.marketValue = quote.currentPrice * Number(position.quantity);
            position.floatProfit =
              (quote.currentPrice - Number(position.avgCost)) *
              Number(position.quantity);
            position.floatProfitRate =
              Number(position.avgCost) > 0
                ? ((quote.currentPrice - Number(position.avgCost)) /
                    Number(position.avgCost)) *
                  100
                : 0;
            position.lastUpdateTime = new Date();

            await this.positionRepository.save(position);
            updatedCount++;
          }

          // 延迟100ms，避免请求过快
          await new Promise((r) => setTimeout(r, 100));
        } catch (error) {
          this.logger.error(`获取 ${tencentCode} 价格失败: ${error.message}`);
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(`更新完成：更新${updatedCount}条持仓，耗时${duration}ms`);

      // 4. 记录任务日志
      await this.taskLogRepository.save({
        taskType: 'position_update_5min',
        executeTime: new Date(),
        positionsUpdated: updatedCount,
        status: 'success',
        durationMs: duration,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`更新持仓失败: ${error.message}`, error.stack);

      // 记录错误日志
      await this.taskLogRepository.save({
        taskType: 'position_update_5min',
        executeTime: new Date(),
        status: 'failed',
        errorMessage: error.message,
        durationMs: duration,
      });
    }
  }

  /**
   * 收盘后计算当日盈亏（15:30）
   */
  async calculateTodayProfit(): Promise<void> {
    const startTime = Date.now();
    this.logger.log('开始计算当日盈亏...');

    try {
      // 1. 获取所有活跃账户
      const accounts = await this.accountRepository.find({
        where: { status: 'active' as any },
      });

      let processedAccounts = 0;

      for (const account of accounts) {
        try {
          // 2. 获取持仓
          const positions = await this.positionRepository.find({
            where: { accountId: account.id, quantity: MoreThan(0) },
            relations: ['instrument'] as any,
          });

          let totalPositionValue = 0;
          let todayProfit = 0;

          // 3. 计算每个持仓的盈亏
          for (const position of positions) {
            // 获取收盘价
            const quote = await this.getTencentRealTimeQuote(
              position.instrument.tencentCode,
            );
            const closePrice = quote.currentPrice;

            // 市值
            const marketValue = closePrice * Number(position.quantity);
            totalPositionValue += marketValue;

            // 今日盈亏（基于上次更新的价格）
            const yesterdayClose = Number(position.currentPrice);
            const todayPnL =
              (closePrice - yesterdayClose) * Number(position.quantity);
            todayProfit += todayPnL;

            // 更新持仓价格
            position.currentPrice = closePrice;
            position.marketValue = marketValue;
            await this.positionRepository.save(position);
          }

          // 4. 更新账户总资产
          account.positionValue = totalPositionValue;
          account.totalAssets = account.currentBalance + totalPositionValue;
          account.totalProfit = account.totalAssets - account.initialCapital;
          account.totalProfitRate =
            account.initialCapital > 0
              ? (account.totalProfit / account.initialCapital) * 100
              : 0;
          account.todayProfit = todayProfit;
          account.todayProfitRate =
            account.totalAssets - todayProfit > 0
              ? (todayProfit / (account.totalAssets - todayProfit)) * 100
              : 0;

          await this.accountRepository.save(account);

          // 5. 生成每日快照
          const snapshot = this.snapshotRepository.create({
            accountId: account.id,
            snapshotDate: new Date(),
            cashBalance: account.currentBalance,
            positionValue: totalPositionValue,
            totalAssets: account.totalAssets,
            totalProfit: account.totalProfit,
            profitRate: account.totalProfitRate,
            todayProfit,
            todayProfitRate: account.todayProfitRate,
          });
          await this.snapshotRepository.save(snapshot);

          processedAccounts++;
        } catch (error) {
          this.logger.error(
            `处理账户 ${account.id} 失败: ${error.message}`,
            error.stack,
          );
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `当日盈亏计算完成：处理${processedAccounts}个账户，耗时${duration}ms`,
      );

      // 6. 记录任务日志
      await this.taskLogRepository.save({
        taskType: 'daily_profit_calculation',
        executeTime: new Date(),
        accountsProcessed: processedAccounts,
        status: 'success',
        durationMs: duration,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`计算当日盈亏失败: ${error.message}`, error.stack);

      await this.taskLogRepository.save({
        taskType: 'daily_profit_calculation',
        executeTime: new Date(),
        status: 'failed',
        errorMessage: error.message,
        durationMs: duration,
      });
    }
  }

  /**
   * 获取腾讯API实时行情
   */
  private async getTencentRealTimeQuote(symbol: string): Promise<any> {
    try {
      const url = `https://qt.gtimg.cn/q=${symbol}`;
      const response = await firstValueFrom(
        this.httpService.get(url, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            Referer: 'https://gu.qq.com/',
          },
        }),
      );

      const text = response.data as string;
      const match = text.match(/="([^"]+)"/);
      if (!match) {
        throw new Error('解析腾讯API数据失败');
      }

      const fields = match[1].split('~');

      return {
        symbol,
        name: fields[1],
        currentPrice: parseFloat(fields[3]),
        open: parseFloat(fields[5]),
        high: parseFloat(fields[30]),
        low: parseFloat(fields[31]),
        close: parseFloat(fields[4]),
        volume: parseFloat(fields[6]),
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`获取腾讯API数据失败: ${symbol}, ${error.message}`);
      throw error;
    }
  }
}
