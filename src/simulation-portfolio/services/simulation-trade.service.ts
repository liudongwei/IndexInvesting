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

    // 4. 计算交易金额和手续费
    const amount = currentPrice * quantity;
    const commission = Math.max(amount * account.commissionRate, account.minCommission);
    const totalCost = amount + commission;

    // 5. 检查余额
    if (account.currentBalance < totalCost) {
      throw new Error(
        `余额不足：需要${totalCost.toFixed(2)}元，可用${account.currentBalance.toFixed(2)}元`,
      );
    }

    // 6. 开启事务
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 7. 扣减现金
      account.currentBalance -= totalCost;
      await queryRunner.manager.save(account);

      // 8. 更新或创建持仓
      let position = await queryRunner.manager.findOne(SimulationPosition, {
        where: { accountId, instrumentId: instrument.id },
      });

      const balanceBefore = account.currentBalance + totalCost;

      if (position) {
        // 已有持仓：加权平均成本
        const oldCost = position.avgCost * Number(position.quantity);
        const newCost = amount;
        const newQty = Number(position.quantity) + quantity;
        position.avgCost = (oldCost + newCost) / newQty;
        position.quantity = newQty;
        position.totalCost += amount;
        position.availableQuantity = Number(position.availableQuantity) + quantity;
        position.lastBuyDate = new Date();
      } else {
        // 新建持仓
        position = queryRunner.manager.create(SimulationPosition, {
          accountId,
          instrumentId: instrument.id,
          quantity,
          availableQuantity: instrument.tradingRule === 'T+1' ? 0 : quantity, // T+1当日不可用
          avgCost: currentPrice,
          totalCost: amount,
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

      // 10. 更新账户统计
      account.totalBuyCount += 1;
      account.totalCommission += commission;
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

    // 1. 查询持仓
    const position = await this.positionRepository.findOne({
      where: { accountId },
      relations: ['instrument'] as any,
    });

    if (!position) {
      throw new Error('持仓不存在');
    }

    // 验证是否是目标标的
    if (position.instrument.code !== instrumentCode) {
      throw new Error(`持仓标的不匹配：当前持有${position.instrument.code}，尝试卖出${instrumentCode}`);
    }

    // 2. 检查可用数量
    const instrument = position.instrument;
    let availableQty = Number(position.availableQuantity);

    if (availableQty < quantity) {
      throw new Error(
        `可用持仓不足：可用${availableQty}股，卖出${quantity}股${instrument.tradingRule === 'T+1' ? '（受T+1限制）' : ''}`,
      );
    }

    // 3. 获取实时价格
    const realTimeData = await this.getTencentRealTimeQuote(instrument.tencentCode);
    const currentPrice = realTimeData.currentPrice;

    if (!currentPrice || currentPrice <= 0) {
      throw new Error('无法获取实时价格');
    }

    // 4. 查询账户
    const account = await this.accountService.findOne(accountId);

    // 5. 计算金额和手续费
    const amount = currentPrice * quantity;
    const commission = Math.max(amount * account.commissionRate, account.minCommission);
    const netProceeds = amount - commission;

    // 6. 计算盈亏
    const profit = (currentPrice - Number(position.avgCost)) * quantity;

    // 7. T+1规则检查（在事务外）
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

    // 8. 开启事务
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const balanceBefore = account.currentBalance;

      // 9. 更新持仓
      position.quantity = Number(position.quantity) - quantity;
      position.availableQuantity = availableQty - quantity;

      if (position.quantity === 0) {
        // 清仓
        await queryRunner.manager.remove(position);
      } else {
        position.lastSellDate = new Date();
        await queryRunner.manager.save(position);
      }

      // 10. 增加现金
      account.currentBalance += netProceeds;
      account.totalSellCount += 1;
      account.totalCommission += commission;
      await queryRunner.manager.save(account);

      // 11. 记录交易
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

      // 12. 提交事务
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
   * 查询账户持仓列表
   */
  async getPositionList(accountId: string): Promise<SimulationPosition[]> {
    return await this.positionRepository.find({
      where: { accountId },
      relations: ['instrument'] as any,
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 查询交易记录
   */
  async getTradeHistory(accountId: string, limit: number = 50): Promise<SimulationTrade[]> {
    return await this.tradeRepository.find({
      where: { accountId },
      relations: ['instrument'] as any,
      order: { tradeDate: 'DESC', tradeTime: 'DESC' },
      take: limit,
    });
  }
}
