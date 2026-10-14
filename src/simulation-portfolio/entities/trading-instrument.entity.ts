import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Index } from '../../indices/entities/index.entity';

/**
 * 交易标的类型枚举
 */
export enum InstrumentType {
  ETF = 'ETF',
  STOCK = 'STOCK',
  CONVERTIBLE_BOND = 'CONVERTIBLE_BOND', // 可转债
}

/**
 * 交易规则枚举
 */
export enum TradingRule {
  T_PLUS_1 = 'T+1',
  T_PLUS_0 = 'T+0',
}

/**
 * 交易标的池实体
 * 支持 ETF、股票、可转债等多种交易品种
 */
@Entity('trading_instruments')
export class TradingInstrument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 10, unique: true })
  code: string;

  @Column({ length: 50 })
  name: string;

  @Column({ length: 100, nullable: true })
  fullName: string;

  @Column({ type: 'enum', enum: InstrumentType, default: InstrumentType.ETF })
  type: InstrumentType;

  @Column({ length: 20 })
  exchange: string;

  @Column({ length: 20, name: 'tencent_code' })
  tencentCode: string;

  @ManyToOne(() => Index, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'index_id' })
  index?: Index;

  @Column({ length: 20, name: 'index_code', nullable: true })
  indexCode: string;

  @Column({ length: 50, name: 'index_name', nullable: true })
  indexName: string;

  @Column({ type: 'int', default: 100, name: 'lot_size' })
  lotSize: number;

  @Column({
    type: 'enum',
    enum: TradingRule,
    default: TradingRule.T_PLUS_1,
    name: 'trading_rule',
  })
  tradingRule: TradingRule;

  @Column({ length: 10, default: 'CNY' })
  currency: string;

  @Column({ length: 50, nullable: true })
  issuer: string;

  @Column({ length: 20, default: 'active' })
  status: string;

  @Column({ type: 'date', name: 'listing_date', nullable: true })
  listingDate: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata: any;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
