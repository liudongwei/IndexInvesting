import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { SimulationPosition } from '../entities/simulation-position.entity';
import { SimulationAccount } from '../entities/simulation-account.entity';
import { SimulationDailySnapshot } from '../entities/simulation-daily-snapshot.entity';
import { SimulationTaskLog } from '../entities/simulation-task-log.entity';
import { AccountAssetsService } from './account-assets.service';

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
    private readonly accountAssets: AccountAssetsService,
  ) {}

  /**
   * 定时更新持仓盈亏（每5分钟）
   * 行情只拉一次，随后按账户统一重算资产与今日盈亏（与买卖交易使用同一口径）
   */
  async updatePositionsRealTime(): Promise<void> {
    const startTime = Date.now();
    this.logger.log('开始更新持仓实时盈亏...');

    try {
      // 1. 获取所有活跃持仓
      const positions = await this.positionRepository.find({
        where: { quantity: MoreThan(0) },
        relations: { instrument: true },
      });

      if (positions.length === 0) {
        this.logger.log('无持仓需要更新');
        return;
      }

      // 2. 批量获取腾讯行情（一次请求拿到现价 + 昨收）
      const tencentCodes = [
        ...new Set(
          positions
            .map((p) => p.instrument?.tencentCode)
            .filter((code): code is string => !!code),
        ),
      ];
      const quotes = await this.accountAssets.fetchQuotes(tencentCodes);

      // 3. 按账户重算（内部会更新持仓现价/市值/浮动盈亏/今日盈亏）
      const affectedAccountIds = [...new Set(positions.map((p) => p.accountId))];
      let updatedAccounts = 0;
      let updatedCount = 0;

      for (const accountId of affectedAccountIds) {
        try {
          const account = await this.accountRepository.findOne({
            where: { id: accountId },
          });
          if (!account) {
            this.logger.warn(`账户 ${accountId} 不存在`);
            continue;
          }
          await this.accountAssets.recalcAccount(
            this.accountRepository.manager,
            account,
            quotes,
          );
          updatedAccounts++;
          updatedCount += positions.filter(
            (p) => p.accountId === accountId,
          ).length;
        } catch (error) {
          this.logger.error(
            `更新账户 ${accountId} 统计失败: ${(error as Error).message}`,
          );
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `更新完成：更新${updatedCount}条持仓、${updatedAccounts}个账户，耗时${duration}ms`,
      );

      // 4. 记录任务日志
      await this.taskLogRepository.save({
        taskType: 'position_update_5min',
        executeTime: new Date(),
        positionsUpdated: updatedCount,
        accountsProcessed: updatedAccounts,
        status: 'success',
        durationMs: duration,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        `更新持仓失败: ${(error as Error).message}`,
        (error as Error).stack,
      );

      await this.taskLogRepository.save({
        taskType: 'position_update_5min',
        executeTime: new Date(),
        status: 'failed',
        errorMessage: (error as Error).message,
        durationMs: duration,
      });
    }
  }

  /**
   * 收盘后计算当日盈亏（15:30）并生成每日快照
   *
   * 今日盈亏不再用「收盘价 − 上次更新的价格」（那是 5 分钟一档的短线差值），
   * 而是与买卖交易完全一致的昨收基准口径。
   */
  async calculateTodayProfit(): Promise<void> {
    const startTime = Date.now();
    this.logger.log('开始计算当日盈亏...');

    try {
      // 1. 获取所有活跃账户
      const accounts = await this.accountRepository.find({
        where: { status: 'active' as any },
      });

      if (accounts.length === 0) {
        this.logger.log('无活跃账户需要结算');
        return;
      }

      // 2. 一次性拉取所有相关标的的收盘行情
      const positions = await this.positionRepository.find({
        where: { quantity: MoreThan(0) },
        relations: { instrument: true },
      });
      const tencentCodes = [
        ...new Set(
          positions
            .map((p) => p.instrument?.tencentCode)
            .filter((code): code is string => !!code),
        ),
      ];
      const quotes = await this.accountAssets.fetchQuotes(tencentCodes);

      let processedAccounts = 0;

      for (const account of accounts) {
        try {
          // 3. 统一重算资产与今日盈亏
          const stats = await this.accountAssets.recalcAccount(
            this.accountRepository.manager,
            account,
            quotes,
          );

          // 4. 生成每日快照（作为历史曲线与次日的对账依据）
          const snapshot = this.snapshotRepository.create({
            accountId: account.id,
            snapshotDate: new Date(),
            cashBalance: account.currentBalance,
            positionValue: stats.positionValue,
            totalAssets: stats.totalAssets,
            totalProfit: stats.totalProfit,
            profitRate: stats.totalProfitRate,
            todayProfit: stats.todayProfit,
            todayProfitRate: stats.todayProfitRate,
          });
          await this.snapshotRepository.save(snapshot);

          processedAccounts++;
        } catch (error) {
          this.logger.error(
            `处理账户 ${account.id} 失败: ${(error as Error).message}`,
            (error as Error).stack,
          );
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `当日盈亏计算完成：处理${processedAccounts}个账户，耗时${duration}ms`,
      );

      // 5. 记录任务日志
      await this.taskLogRepository.save({
        taskType: 'daily_profit_calculation',
        executeTime: new Date(),
        accountsProcessed: processedAccounts,
        status: 'success',
        durationMs: duration,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        `计算当日盈亏失败: ${(error as Error).message}`,
        (error as Error).stack,
      );

      await this.taskLogRepository.save({
        taskType: 'daily_profit_calculation',
        executeTime: new Date(),
        status: 'failed',
        errorMessage: (error as Error).message,
        durationMs: duration,
      });
    }
  }
}
