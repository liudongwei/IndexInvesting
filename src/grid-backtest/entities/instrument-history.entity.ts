import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 标的历史日K缓存表（网格回测数据源）
 * 数据来自东方财富 push2his 接口（前复权），按 symbol 缓存全量日线，
 * 用于避免每次回测都请求外网，并在东财接口不可用时兜底。
 */
@Entity('instrument_histories')
@Index(['symbol', 'tradeDate'], { unique: true })
export class InstrumentHistory {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ length: 20, comment: '标的 symbol，如 sh510330 / sz159915' })
  symbol: string;

  @Column({ type: 'date', comment: '交易日期' }) tradeDate: Date;

  @Column({ type: 'decimal', precision: 12, scale: 4, comment: '开盘价' })
  openPrice: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, comment: '最高价' })
  highPrice: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, comment: '最低价' })
  lowPrice: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, comment: '收盘价' })
  closePrice: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true, comment: '成交量' })
  volume: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true, comment: '成交额' })
  turnover: number | null;

  @Column({ length: 20, default: 'eastmoney', comment: '数据来源' })
  dataSource: string;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
