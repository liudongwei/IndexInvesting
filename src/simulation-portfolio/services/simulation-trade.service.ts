import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SimulationPosition } from '../entities/simulation-position.entity';
import { SimulationTrade, TradeType } from '../entities/simulation-trade.entity';
import { TradingInstrument } from '../entities/trading-instrument.entity';
import { SimulationAccount } from '../entities/simulation-account.entity';
import { BuyStockDto, SellStockDto } from '../dto/trade-stock.dto';
import { SimulationAccountService } from './simulation-account.service';
import { TradingInstrumentService } from './trading-instrument.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { SimulationDailySnapshot } from '../entities/simulation-daily-snapshot.entity';

@Injectable()
export class SimulationTradeService {
  private readonly logger = new Logger(SimulationTradeService.name);

  constructor(
    @InjectRepository(SimulationPosition)
    private positionRepository: Repository<SimulationPosition>,
    @InjectRepository(SimulationTrade)
    private tradeRepository: Repository<SimulationTrade>,
    @InjectRepository(SimulationDailySnapshot)
    private snapshotRepository: Repository<SimulationDailySnapshot>,
    private dataSource: DataSource,
    private accountService: SimulationAccountService,
    private instrumentService: TradingInstrumentService,
    private httpService: HttpService,
  ) {}

  /**
   * 买入股票
   */
  async buyStock(dto: BuyStockDto): Promise<any> {
    const { accountId, instrumentCode, quantity } = dto;

    // 1. 查询标的信息
    const instrument = await this.instrumentService.findByCode(instrumentCode);

    // 2. 获取实时价格（腾讯 API）
    const realTimeData = await this.getTencentRealTimeQuote(instrument.tencentCode);
    const currentPrice = realTimeData.currentPrice;

    if (!currentPrice || currentPrice <= 0) {
      throw new Error('无法获取实时价格');
    }

    // 3. 查询账户信息
    const account = await this.accountService.findOne(accountId);

    // 4. 计算交易金额和手续费（确保数值类型）
    const amount = currentPrice * quantity;
    const commissionRate = typeof account.commissionRate === 'string' ? parseFloat(account.commissionRate) : account.commissionRate;
    const minCommission = typeof account.minCommission === 'string' ? parseFloat(account.minCommission) : account.minCommission;
    const commission = Math.max(amount * commissionRate, minCommission);
    const totalCost = amount + commission;

    // 5. 检查余额（确保数值类型）
    const currentBalance = typeof account.currentBalance === 'string' ? parseFloat(account.currentBalance) : account.currentBalance;
    if (currentBalance < totalCost) {
      throw new Error(
        `余额不足：需要${totalCost.toFixed(2)}元，可用${currentBalance.toFixed(2)}元`,
      );
    }

    // 6. 开启事务
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 7. 扣减现金（确保数值运算）
      account.currentBalance = currentBalance - totalCost;
      await queryRunner.manager.save(account);

      // 8. 更新或创建持仓
      let position = await queryRunner.manager.findOne(SimulationPosition, {
        where: { accountId, instrumentId: instrument.id },
      });

      const balanceBefore = currentBalance + totalCost;

      if (position) {
        // 已有持仓：加权平均成本（确保数值运算）
        const oldAvgCost = typeof position.avgCost === 'string' ? parseFloat(position.avgCost) : position.avgCost;
        const oldQty = Number(position.quantity);
        const oldCost = oldAvgCost * oldQty;
        const newCost = amount + commission; // 新成本包含佣金
        const newQty = oldQty + quantity;
        position.avgCost = (oldCost + newCost) / newQty; // 成本价包含佣金
        position.quantity = newQty;
        
        const currentTotalCost = typeof position.totalCost === 'string' ? parseFloat(position.totalCost) : position.totalCost;
        position.totalCost = currentTotalCost + amount + commission; // 总成本包含佣金
        
        // T+1规则：当日买入的份额不可用
        if (instrument.tradingRule === 'T+1') {
          // 可用数量不变，今日买入的部分被冻结
          // availableQuantity 保持不变
        } else {
          // 非T+1标的：全部可用
          position.availableQuantity = Number(position.availableQuantity) + quantity;
        }
        position.lastBuyDate = new Date();
      } else {
        // 新建持仓
        position = queryRunner.manager.create(SimulationPosition, {
          accountId,
          instrumentId: instrument.id,
          quantity,
          availableQuantity: instrument.tradingRule === 'T+1' ? 0 : quantity, // T+1当日不可用
          avgCost: (amount + commission) / quantity, // 成本价包含佣金
          totalCost: amount + commission, // 总成本包含佣金
          currentPrice,
          marketValue: amount,
          lastBuyDate: new Date(),
        });
      }

      await queryRunner.manager.save(position);

      // 9. 记录交易
      const trade = queryRunner.manager.create(SimulationTrade, {
        accountId,
        instrumentId: instrument.id,
        tradeType: TradeType.BUY,
        tradeDate: new Date(),
        tradeTime: new Date(),
        price: currentPrice,
        quantity,
        amount,
        commission,
        balanceBefore,
        balanceAfter: account.currentBalance,
      });
      await queryRunner.manager.save(trade);

      // 10. 更新账户统计（确保数值运算）
      account.totalBuyCount += 1;
      const currentCommission = typeof account.totalCommission === 'string' ? parseFloat(account.totalCommission) : account.totalCommission;
      account.totalCommission = currentCommission + commission;
      
      // 10.1 重新计算账户资产统计 - 查询所有持仓的总市值
      const updatedBalance = typeof account.currentBalance === 'string' ? parseFloat(String(account.currentBalance)) : account.currentBalance;
      
      // 查询该账户所有持仓，计算总市值
      const allPositions = await queryRunner.manager.find(SimulationPosition, {
        where: { accountId },
      });
      
      let totalPositionValue = 0;
      for (const pos of allPositions) {
        const posQty = typeof pos.quantity === 'string' ? parseFloat(pos.quantity) : pos.quantity;
        const posPrice = typeof pos.currentPrice === 'string' ? parseFloat(pos.currentPrice) : pos.currentPrice;
        totalPositionValue += posQty * posPrice;
      }
      
      account.positionValue = totalPositionValue;
      account.totalAssets = updatedBalance + totalPositionValue;
      account.totalProfit = account.totalAssets - (typeof account.initialCapital === 'string' ? parseFloat(account.initialCapital) : account.initialCapital);
      const initialCapital = typeof account.initialCapital === 'string' ? parseFloat(account.initialCapital) : account.initialCapital;
      account.totalProfitRate = initialCapital > 0 ? (account.totalProfit / initialCapital) * 100 : 0;
      
      // 计算今日盈亏
      const todayProfit = await this.calculateTodayProfit(queryRunner, accountId, updatedBalance, totalPositionValue);
      account.todayProfit = todayProfit;
      const assetsBeforeTodayProfit = updatedBalance + totalPositionValue - todayProfit;
      account.todayProfitRate = assetsBeforeTodayProfit > 0 ? (todayProfit / assetsBeforeTodayProfit) * 100 : 0;
      
      await queryRunner.manager.save(account);

      // 11. 提交事务
      await queryRunner.commitTransaction();

      return {
        success: true,
        message: '买入成功',
        data: {
          price: currentPrice,
          quantity,
          amount,
          commission,
          totalCost,
          remainingBalance: account.currentBalance,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`买入失败: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * 卖出股票
   */
  async sellStock(dto: SellStockDto): Promise<any> {
    const { accountId, instrumentCode, quantity } = dto;

    // 1. 查询标的信息
    const instrument = await this.instrumentService.findByCode(instrumentCode);

    // 2. 查询持仓
    const position = await this.positionRepository.findOne({
      where: { accountId, instrumentId: instrument.id },
      relations: { instrument: true },
    });

    if (!position) {
      throw new Error('持仓不存在');
    }

    // 3. 检查可用数量
    let availableQty = Number(position.availableQuantity);

    if (availableQty < quantity) {
      throw new Error(
        `可用持仓不足：可用${availableQty}股，卖出${quantity}股${instrument.tradingRule === 'T+1' ? '（受T+1限制）' : ''}`,
      );
    }

    // 4. 获取实时价格
    const realTimeData = await this.getTencentRealTimeQuote(instrument.tencentCode);
    const currentPrice = realTimeData.currentPrice;

    if (!currentPrice || currentPrice <= 0) {
      throw new Error('无法获取实时价格');
    }

    // 5. 查询账户
    const account = await this.accountService.findOne(accountId);

    // 6. 计算金额和手续费（确保数值类型）
    const amount = currentPrice * quantity;
    const commissionRate = typeof account.commissionRate === 'string' ? parseFloat(account.commissionRate) : account.commissionRate;
    const minCommission = typeof account.minCommission === 'string' ? parseFloat(account.minCommission) : account.minCommission;
    const commission = Math.max(amount * commissionRate, minCommission);
    const netProceeds = amount - commission;

    // 7. 计算盈亏（avgCost已包含买入佣金，这里只扣除卖出佣金）
    const profit = (currentPrice - Number(position.avgCost)) * quantity - commission;

    // 8. T+1规则检查（在事务外）
    if (instrument.tradingRule === 'T+1') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todayBuys = await this.tradeRepository
        .createQueryBuilder('trade')
        .select('SUM(trade.quantity)', 'total')
        .where('trade.account_id = :accountId', { accountId })
        .andWhere('trade.instrument_id = :instrumentId', { instrumentId: instrument.id })
        .andWhere('trade.trade_type = :tradeType', { tradeType: TradeType.BUY })
        .andWhere('DATE(trade.trade_date) = :today', { today })
        .getRawOne();

      const boughtToday = Number(todayBuys?.total || 0);
      availableQty = Number(position.quantity) - boughtToday;
    }

    // 9. 开启事务
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const currentBalance = typeof account.currentBalance === 'string' ? parseFloat(account.currentBalance) : account.currentBalance;
      const balanceBefore = currentBalance;

      // 10. 更新持仓
      position.quantity = Number(position.quantity) - quantity;
      position.availableQuantity = Number(position.availableQuantity) - quantity;

      if (position.quantity === 0) {
        // 清仓
        await queryRunner.manager.remove(position);
      } else {
        position.lastSellDate = new Date();
        await queryRunner.manager.save(position);
      }

      // 11. 增加现金（确保数值运算）
      account.currentBalance = currentBalance + netProceeds;
      account.totalSellCount += 1;
      const currentCommission = typeof account.totalCommission === 'string' ? parseFloat(account.totalCommission) : account.totalCommission;
      account.totalCommission = currentCommission + commission;
      
      // 11.1 重新计算账户资产统计 - 查询所有持仓的总市值
      const updatedBalance = typeof account.currentBalance === 'string' ? parseFloat(String(account.currentBalance)) : account.currentBalance;
      
      // 查询该账户所有持仓，计算总市值
      const allPositions = await queryRunner.manager.find(SimulationPosition, {
        where: { accountId },
      });
      
      let totalPositionValue = 0;
      for (const pos of allPositions) {
        const posQty = typeof pos.quantity === 'string' ? parseFloat(pos.quantity) : pos.quantity;
        const posPrice = typeof pos.currentPrice === 'string' ? parseFloat(pos.currentPrice) : pos.currentPrice;
        totalPositionValue += posQty * posPrice;
      }
      
      account.positionValue = totalPositionValue;
      account.totalAssets = updatedBalance + account.positionValue;
      account.totalProfit = account.totalAssets - (typeof account.initialCapital === 'string' ? parseFloat(account.initialCapital) : account.initialCapital);
      const initialCapital = typeof account.initialCapital === 'string' ? parseFloat(account.initialCapital) : account.initialCapital;
      account.totalProfitRate = initialCapital > 0 ? (account.totalProfit / initialCapital) * 100 : 0;
      
      // 计算今日盈亏
      const todayProfit = await this.calculateTodayProfit(queryRunner, accountId, updatedBalance, totalPositionValue);
      account.todayProfit = todayProfit;
      const assetsBeforeTodayProfit = updatedBalance + totalPositionValue - todayProfit;
      account.todayProfitRate = assetsBeforeTodayProfit > 0 ? (todayProfit / assetsBeforeTodayProfit) * 100 : 0;
      
      await queryRunner.manager.save(account);

      // 12. 记录交易
      const trade = queryRunner.manager.create(SimulationTrade, {
        accountId,
        instrumentId: instrument.id,
        tradeType: TradeType.SELL,
        tradeDate: new Date(),
        tradeTime: new Date(),
        price: currentPrice,
        quantity,
        amount,
        commission,
        balanceBefore,
        balanceAfter: account.currentBalance,
      });
      await queryRunner.manager.save(trade);

      // 13. 提交事务
      await queryRunner.commitTransaction();

      return {
        success: true,
        message: '卖出成功',
        data: {
          price: currentPrice,
          quantity,
          amount,
          commission,
          netProceeds,
          profit,
          remainingBalance: account.currentBalance,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`卖出失败: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
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

  /**
   * 获取实时行情（公开方法）
   */
  async getRealTimePrice(tencentCode: string): Promise<{ price: number; name: string }> {
    const data = await this.getTencentRealTimeQuote(tencentCode);
    return {
      price: data.currentPrice,
      name: data.name,
    };
  }

  /**
   * 查询账户持仓列表
   */
  async getPositionList(accountId: string): Promise<SimulationPosition[]> {
    return await this.positionRepository.find({
      where: { accountId },
      relations: { instrument: true },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 查询交易记录
   */
  async getTradeHistory(accountId: string, limit: number = 50): Promise<SimulationTrade[]> {
    return await this.tradeRepository.find({
      where: { accountId },
      relations: { instrument: true },
      order: { tradeDate: 'DESC', tradeTime: 'DESC' },
      take: limit,
    });
  }

  /**
   * 计算今日盈亏（私有方法）
   * 今日盈亏 = 当前总资产 - 上次快照时的总资产
   */
  private async calculateTodayProfit(
    queryRunner: any,
    accountId: string,
    currentBalance: number,
    totalPositionValue: number,
  ): Promise<number> {
    try {
      // 查询最新的快照
      const latestSnapshot = await queryRunner.manager.findOne(SimulationDailySnapshot, {
        where: { accountId },
        order: { snapshotDate: 'DESC' },
      });

      if (latestSnapshot) {
        // 今日盈亏 = 当前总资产 - 快照总资产
        const currentTotalAssets = currentBalance + totalPositionValue;
        const snapshotTotalAssets = typeof latestSnapshot.totalAssets === 'string'
          ? parseFloat(latestSnapshot.totalAssets)
          : latestSnapshot.totalAssets;
        return currentTotalAssets - snapshotTotalAssets;
      } else {
        // 如果没有快照，今日盈亏为 0
        return 0;
      }
    } catch (error) {
      this.logger.error(`计算今日盈亏失败: ${error.message}`);
      return 0;
    }
  }
}
