import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { Index as IndexEntity } from './index.entity';

/**
 * 指数历史数据表
 * 存储各指数的日K线数据
 */
@Entity('index_histories')
@Index(['indexId', 'tradeDate'], { unique: true })
export class IndexHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', comment: '关联的指数ID' })
  indexId: string;

  @ManyToOne(() => IndexEntity, index => index.histories)
  @JoinColumn({ name: 'indexId' })
  index: IndexEntity;

  @Column({ type: 'date', comment: '交易日期' })
  tradeDate: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2, comment: '开盘价' })
  openPrice: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, comment: '最高价' })
  highPrice: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, comment: '最低价' })
  lowPrice: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, comment: '收盘价' })
  closePrice: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true, comment: '成交量（手）' })
  volume: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true, comment: '成交额（元）' })
  turnover: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true, comment: '涨跌幅(%)' })
  changePercent: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true, comment: '涨跌额' })
  changeAmount: number | null;

  @Column({ length: 20, nullable: true, comment: '数据来源：tencent/sina' })
  dataSource: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
