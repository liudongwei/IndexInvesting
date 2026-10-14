import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SimulationAccount } from './simulation-account.entity';
import { TradingInstrument } from './trading-instrument.entity';

/**
 * 交易类型枚举
 */
export enum TradeType {
  BUY = 'BUY',
  SELL = 'SELL',
}

/**
 * 交易记录实体
 */
@Entity('simulation_trades')
export class SimulationTrade {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => SimulationAccount, (account) => account.trades, {
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

  @Column({ type: 'enum', enum: TradeType, name: 'trade_type' })
  tradeType: TradeType;

  @Column({ type: 'date', name: 'trade_date' })
  tradeDate: Date;

  @Column({ type: 'time', nullable: true, name: 'trade_time' })
  tradeTime: Date;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  price: number;

  @Column({ type: 'decimal', precision: 12, scale: 0 })
  quantity: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  commission: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    name: 'balance_before',
  })
  balanceBefore: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    name: 'balance_after',
  })
  balanceAfter: number;

  @Column({ length: 50, nullable: true, name: 'order_id' })
  orderId: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
