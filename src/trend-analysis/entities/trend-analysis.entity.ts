import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Index as IndexEntity } from '../../indices/entities/index.entity';

/**
 * 趋势分析表
 * 存储指数的趋势状态、排名、区间涨幅等分析数据
 */
@Entity('trend_analysis')
@Index(['indexId', 'tradeDate'], { unique: true })
@Index(['tradeDate']) // 【性能优化】加速按日期查询和排序
export class TrendAnalysis {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', comment: '关联的指数ID' })
  indexId: string;

  @ManyToOne(() => IndexEntity, { eager: true })
  @JoinColumn({ name: 'indexId' })
  index: IndexEntity;

  @Column({ type: 'date', comment: '交易日期' })
  tradeDate: Date;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    comment: '收盘价（现价）',
  })
  closePrice: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, comment: '20日均线' })
  ma20: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    comment: '涨幅%（相对上一交易日）',
  })
  changePercent: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
    comment: '偏离率（现价相对MA20）',
  })
  deviationRate: number | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    comment: '量比',
  })
  volumeRatio: number | null;

  @Column({ length: 10, comment: '趋势状态: above(高于MA20)/below(低于MA20)' })
  trendStatus: 'above' | 'below';

  @Column({
    type: 'date',
    nullable: true,
    comment: '状态转变日期（现价超过或低于MA20的日期）',
  })
  statusChangeDate: Date | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
    comment: '区间涨幅%（从状态转变日到当前）',
  })
  intervalChangePercent: number | null;

  @Column({ type: 'int', comment: '当日排名（基于偏离率）' })
  rank: number;

  @Column({ type: 'int', default: 0, comment: '排序变化（相对上一交易日）' })
  rankChange: number;

  @Column({ type: 'int', comment: '参与排名的指数总数' })
  totalRankCount: number;

  @Column({
    name: 'type',
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: '指数类型，来自indices.metadata.type',
  })
  indexType: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
