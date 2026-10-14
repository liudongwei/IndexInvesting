import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { SimulationAccount } from './simulation-account.entity';
import { TradingInstrument } from './trading-instrument.entity';

/**
 * 持仓实体
 * 支持 T+1 和实时盈亏
 */
@Entity('simulation_positions')
@Unique(['account', 'instrument'])
export class SimulationPosition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => SimulationAccount, (account) => account.positions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'account_id' })
  account: SimulationAccount;

  @Column({ name: 'account_id' })
  accountId: string;

  @ManyToOne(() => TradingInstrument, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'instrument_id' })
  instrument: TradingInstrument;

  @Column({ name: 'instrument_id' })
  instrumentId: string;

  @Column({ type: 'decimal', precision: 12, scale: 0, default: 0 })
  quantity: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 0,
    default: 0,
    name: 'available_quantity',
  })
  availableQuantity: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 0,
    default: 0,
    name: 'frozen_quantity',
  })
  frozenQuantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0, name: 'avg_cost' })
  avgCost: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    name: 'total_cost',
  })
  totalCost: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    default: 0,
    name: 'current_price',
  })
  currentPrice: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    name: 'market_value',
  })
  marketValue: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    name: 'float_profit',
  })
  floatProfit: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    default: 0,
    name: 'float_profit_rate',
  })
  floatProfitRate: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    name: 'today_profit',
  })
  todayProfit: number;

  @Column({ type: 'date', name: 'last_buy_date', nullable: true })
  lastBuyDate: Date;

  @Column({ type: 'date', name: 'last_sell_date', nullable: true })
  lastSellDate: Date;

  @Column({ type: 'timestamp', name: 'last_update_time', nullable: true })
  lastUpdateTime: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
