import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SimulationAccount, StrategyType, AccountStatus } from '../entities/simulation-account.entity';

@Injectable()
export class SimulationAccountService {
  constructor(
    @InjectRepository(SimulationAccount)
    private accountRepository: Repository<SimulationAccount>,
  ) {}

  /**
   * 查询所有账户
   */
  async findAll(status?: AccountStatus): Promise<SimulationAccount[]> {
    const queryBuilder = this.accountRepository.createQueryBuilder('account');

    if (status) {
      queryBuilder.andWhere('account.status = :status', { status });
    }

    return await queryBuilder.orderBy('account.created_at', 'DESC').getMany();
  }

  /**
   * 根据ID查询账户
   */
  async findOne(id: string): Promise<SimulationAccount> {
    const account = await this.accountRepository.findOne({
      where: { id },
      relations: ['positions'] as any,
    });
    if (!account) {
      throw new Error(`账户 ${id} 不存在`);
    }
    return account;
  }

  /**
   * 创建账户
   */
  async createAccount(
    name: string,
    strategyType: StrategyType,
    description?: string,
    initialCapital: number = 20000,
  ): Promise<SimulationAccount> {
    const account = this.accountRepository.create({
      name,
      strategyType,
      description,
      initialCapital,
      currentBalance: initialCapital,
      startDate: new Date(),
    });
    return await this.accountRepository.save(account);
  }

  /**
   * 更新账户信息
   */
  async updateAccount(id: string, data: Partial<SimulationAccount>): Promise<SimulationAccount> {
    const account = await this.findOne(id);
    Object.assign(account, data);
    return await this.accountRepository.save(account);
  }

  /**
   * 更新账户资产统计
   */
  async updateAccountStats(
    accountId: string,
    positionValue: number,
    todayProfit: number,
  ): Promise<void> {
    const account = await this.findOne(accountId);

    account.positionValue = positionValue;
    account.totalAssets = account.currentBalance + positionValue;
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
  }

  /**
   * 扣减账户余额
   */
  async deductBalance(accountId: string, amount: number): Promise<void> {
    const account = await this.findOne(accountId);

    if (account.currentBalance < amount) {
      throw new Error(`余额不足：需要${amount.toFixed(2)}元，可用${account.currentBalance.toFixed(2)}元`);
    }

    account.currentBalance -= amount;
    await this.accountRepository.save(account);
  }

  /**
   * 增加账户余额
   */
  async addBalance(accountId: string, amount: number): Promise<void> {
    const account = await this.findOne(accountId);
    account.currentBalance += amount;
    await this.accountRepository.save(account);
  }

  /**
   * 增加交易次数统计
   */
  async incrementBuyCount(accountId: string, commission: number): Promise<void> {
    const account = await this.findOne(accountId);
    account.totalBuyCount += 1;
    account.totalCommission += commission;
    await this.accountRepository.save(account);
  }

  async incrementSellCount(accountId: string, commission: number): Promise<void> {
    const account = await this.findOne(accountId);
    account.totalSellCount += 1;
    account.totalCommission += commission;
    await this.accountRepository.save(account);
  }
}
