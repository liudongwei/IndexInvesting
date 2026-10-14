import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { SimulationAccount } from './simulation-account.entity';

/**
 * 每日资产快照实体
 * 用于收益曲线展示
 */
@Entity('simulation_daily_snapshots')
@Unique(['account', 'snapshotDate'])
export class SimulationDailySnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => SimulationAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  account: SimulationAccount;

  @Column({ name: 'account_id' })
  accountId: string;

  @Column({ type: 'date', name: 'snapshot_date' })
  snapshotDate: Date;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    name: 'cash_balance',
  })
  cashBalance: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    name: 'position_value',
  })
  positionValue: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    name: 'total_assets',
  })
  totalAssets: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    name: 'total_profit',
  })
  totalProfit: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    name: 'profit_rate',
  })
  profitRate: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    name: 'today_profit',
  })
  todayProfit: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
    name: 'today_profit_rate',
  })
  todayProfitRate: number;

  @Column({ type: 'jsonb', nullable: true, name: 'positions_snapshot' })
  positionsSnapshot: any;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
