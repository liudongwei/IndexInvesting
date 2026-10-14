import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { SimulationPosition } from './simulation-position.entity';
import { SimulationTrade } from './simulation-trade.entity';

/**
 * 策略类型枚举
 */
export enum StrategyType {
  GRID = 'grid', // 网格交易
  TREND_RIGHT = 'trend_right', // 右侧趋势交易
  TREND_LEFT = 'trend_left', // 左侧逆向交易
  CUSTOM = 'custom', // 自定义策略
}

/**
 * 账户状态枚举
 */
export enum AccountStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  CLOSED = 'closed',
}

/**
 * 模拟账户实体
 * 支持多策略独立核算
 */
@Entity('simulation_accounts')
export class SimulationAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50 })
  name: string;

  @Column({ length: 30 })
  strategyType: StrategyType;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 20000,
    name: 'initial_capital',
  })
  initialCapital: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 20000,
    name: 'current_balance',
  })
  currentBalance: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    name: 'frozen_balance',
  })
  frozenBalance: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    name: 'position_value',
  })
  positionValue: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    name: 'total_assets',
  })
  totalAssets: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    name: 'total_profit',
  })
  totalProfit: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    default: 0,
    name: 'total_profit_rate',
  })
  totalProfitRate: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    name: 'today_profit',
  })
  todayProfit: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    default: 0,
    name: 'today_profit_rate',
  })
  todayProfitRate: number;

  @Column({
    type: 'int',
    default: 0,
    name: 'total_buy_count',
  })
  totalBuyCount: number;

  @Column({
    type: 'int',
    default: 0,
    name: 'total_sell_count',
  })
  totalSellCount: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    name: 'total_commission',
  })
  totalCommission: number;

  // ========== 费率配置（账户级别）==========
  @Column({
    type: 'decimal',
    precision: 8,
    scale: 6,
    default: 0.00006,
    name: 'commission_rate',
  })
  commissionRate: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0.2,
    name: 'min_commission',
  })
  minCommission: number;

  @Column({
    type: 'enum',
    enum: AccountStatus,
    default: AccountStatus.ACTIVE,
  })
  status: AccountStatus;

  @Column({ type: 'date', name: 'start_date' })
  startDate: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata: any;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => SimulationPosition, (position) => position.account)
  positions?: SimulationPosition[];

  @OneToMany(() => SimulationTrade, (trade) => trade.account)
  trades?: SimulationTrade[];
}
