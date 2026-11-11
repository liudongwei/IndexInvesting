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
import { AccountAssetsService } from './account-assets.service';

@Injectable()
export class SimulationTradeService {
  private readonly logger = new Logger(SimulationTradeService.name);

  constructor(
    @InjectRepository(SimulationPosition)
    private positionRepository: Repository<SimulationPosition>,
    @InjectRepository(SimulationTrade)
    private tradeRepository: Repository<SimulationTrade>,
    private dataSource: DataSource,
    private accountService: SimulationAccountService,
    private instrumentService: TradingInstrumentService,
    private accountAssets: AccountAssetsService,
  ) {}

  /**
   * 买入股票
   */
  async buyStock(dto: BuyStockDto): Promise<any> {
    const { accountId, instrumentCode, quantity } = dto;

    // 1. 查询标的信息
    const instrument = await this.instrumentService.findByCode(instrumentCode);

    // 2. 获取实时价格（腾讯 API）；同时缓存行情，供今日盈亏计算复用（含昨收）
    const quotes = await this.accountAssets.fetchQuotes([instrument.tencentCode]);
    const currentPrice = quotes.get(instrument.tencentCode)?.price;

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
        // 已有持仓：成本动态累加（券商口径）
        // 总成本含买入佣金，总卖出所得含已扣卖出佣金的净回款
        const currentTotalCost = typeof position.totalCost === 'string' ? parseFloat(position.totalCost) : position.totalCost;
        const currentTotalSell = typeof position.totalSell === 'string' ? parseFloat(position.totalSell) : position.totalSell;
        const newQty = Number(position.quantity) + quantity;
        position.totalCost = currentTotalCost + amount + commission; // 总成本包含佣金
        position.quantity = newQty;
        // 动态成本价 = (累计买入 − 累计卖出所得) / 当前持股，盈利卖出后摊低，亏损卖出后抬高
        position.avgCost = (position.totalCost - currentTotalSell) / newQty;
        
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
          totalSell: 0,
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

      // 10.1 统一重算资产与今日盈亏
      // 以昨收为基准，今日买入份额按成交价计入，并扣除当日费用，
      // 因此买入瞬间不会出现「持仓市值被当成盈利」的假盈利。
      await this.accountAssets.recalcAccount(queryRunner.manager, account, quotes);

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

    // 3. 获取实时价格（含昨收，用于今日盈亏）
    const quotes = await this.accountAssets.fetchQuotes([instrument.tencentCode]);
    const currentPrice = quotes.get(instrument.tencentCode)?.price;

    if (!currentPrice || currentPrice <= 0) {
      throw new Error('无法获取实时价格');
    }

    // 4. 查询账户
    const account = await this.accountService.findOne(accountId);

    // 5. 计算可用数量（考虑 T+1 规则）
    let availableQty = Number(position.availableQuantity);
    
    if (instrument.tradingRule === 'T+1') {
      // 查询今日买入的数量
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
      // T+1 规则：可用数量 = 总持仓 - 今日买入
      availableQty = Number(position.quantity) - boughtToday;
    }

    // 6. 检查可用数量
    if (availableQty < quantity) {
      throw new Error(
        `可用持仓不足：可用${availableQty}股，卖出${quantity}股${instrument.tradingRule === 'T+1' ? '（受T+1限制）' : ''}`,
      );
    }

    // 7. 计算金额和手续费（确保数值类型）
    const amount = currentPrice * quantity;
    const commissionRate = typeof account.commissionRate === 'string' ? parseFloat(account.commissionRate) : account.commissionRate;
    const minCommission = typeof account.minCommission === 'string' ? parseFloat(account.minCommission) : account.minCommission;
    const commission = Math.max(amount * commissionRate, minCommission);
    const netProceeds = amount - commission;

    // 8. 计算盈亏（avgCost已包含买入佣金，这里只扣除卖出佣金）
    const profit = (currentPrice - Number(position.avgCost)) * quantity - commission;

    // 9. 开启事务
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const currentBalance = typeof account.currentBalance === 'string' ? parseFloat(account.currentBalance) : account.currentBalance;
      const balanceBefore = currentBalance;

      // 10. 更新持仓
      position.quantity = Number(position.quantity) - quantity;

      // 券商式动态成本：累计卖出所得（净回款 = 成交金额 − 卖出佣金）
      // 浮盈卖出 → 成本下降；亏损止损卖出 → 成本上升
      position.totalSell = (Number(position.totalSell) || 0) + netProceeds;
      
      // 对于 T+1 标的，availableQuantity 应该等于 quantity（因为当日买入的会被冻结）
      // 但对于非 T+1 标的，availableQuantity 直接减少
      if (instrument.tradingRule === 'T+1') {
        // T+1: availableQuantity 保持与 quantity 一致（简化处理）
        // 实际可用数量在卖出时通过查询今日买入来动态计算
        position.availableQuantity = position.quantity;
      } else {
        // 非 T+1: 直接减少可用数量
        position.availableQuantity = Number(position.availableQuantity) - quantity;
      }

      if (position.quantity === 0) {
        // 清仓（position 行删除；重新买入时按新仓位重新计成本）
        await queryRunner.manager.remove(position);
      } else {
        // 动态成本价 = (累计买入 − 累计卖出所得) / 剩余持股
        const totalCost = Number(position.totalCost);
        position.avgCost = (totalCost - Number(position.totalSell)) / position.quantity;
        position.lastSellDate = new Date();
        await queryRunner.manager.save(position);
      }

      // 11. 增加现金（确保数值运算）
      account.currentBalance = currentBalance + netProceeds;
      account.totalSellCount += 1;
      const currentCommission = typeof account.totalCommission === 'string' ? parseFloat(account.totalCommission) : account.totalCommission;
      account.totalCommission = currentCommission + commission;

      // 12. 记录交易
      // 必须早于资产重算：今日盈亏要读取当日成交流水（卖出均价、当日费用）
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

      // 13. 统一重算资产与今日盈亏
      // 卖出份额按「卖出均价 − 昨收」计入今日已实现盈亏，费用从今日盈亏中扣除。
      await this.accountAssets.recalcAccount(queryRunner.manager, account, quotes);

      // 14. 提交事务
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
   * 获取实时行情（公开方法）
   */
  async getRealTimePrice(tencentCode: string): Promise<{ price: number; name: string }> {
    const quotes = await this.accountAssets.fetchQuotes([tencentCode]);
    const quote = quotes.get(tencentCode);
    if (!quote) {
      throw new Error(`无法获取实时价格: ${tencentCode}`);
    }
    return {
      price: quote.price,
      name: quote.name,
    };
  }

  /**
   * 获取账户持仓列表
   *
   * 对 T+1 品种的 availableQuantity 做实时重算（总持仓 − 今日买入）：
   * 库中的 availableQuantity 在 T+1 解冻后可能长期停在 0，
   * 卖出页据此过滤会误判"无可用持仓"，故在读取时按真实口径刷新。
   */
  async getPositionList(accountId: string): Promise<SimulationPosition[]> {
    const positions = await this.positionRepository.find({
      where: { accountId },
      relations: { instrument: true },
      order: { createdAt: 'DESC' },
    });

    const today = new Date().toISOString().slice(0, 10);
    const boughtToday = await this.tradeRepository
      .createQueryBuilder('t')
      .andWhere('t.account_id = :acc', { acc: accountId })
      .andWhere('DATE(t.trade_date) = :td', { td: today })
      .andWhere('t.trade_type = :tradeType', { tradeType: TradeType.BUY })
      .getMany();
    const boughtTodayMap = new Map<string, number>();
    for (const t of boughtToday) {
      boughtTodayMap.set(t.instrumentId, (boughtTodayMap.get(t.instrumentId) || 0) + Number(t.quantity));
    }

    for (const p of positions) {
      if (p.instrument?.tradingRule === 'T+1') {
        const frozen = boughtTodayMap.get(p.instrumentId) || 0;
        p.availableQuantity = Math.max(0, Number(p.quantity) - frozen);
        p.frozenQuantity = frozen;
      } else {
        p.availableQuantity = Number(p.quantity);
        p.frozenQuantity = 0;
      }
    }
    return positions;
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
   * 手动重算指定账户的资产与今日盈亏（用于前端刷新 / 排障）
   */
  async recalculateAccount(accountId: string): Promise<any> {
    const account = await this.accountService.findOne(accountId);
    const stats = await this.accountAssets.recalcAccount(
      this.dataSource.manager,
      account,
    );
    return {
      success: true,
      message: '账户资产已重算',
      data: {
        positionValue: stats.positionValue,
        totalAssets: stats.totalAssets,
        totalProfit: stats.totalProfit,
        totalProfitRate: stats.totalProfitRate,
        todayProfit: stats.todayProfit,
        todayProfitRate: stats.todayProfitRate,
        startAssets: stats.startAssets,
      },
    };
  }
}
