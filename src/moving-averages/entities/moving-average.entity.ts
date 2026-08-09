import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Index as IndexEntity } from '../../indices/entities/index.entity';

/**
 * 移动平均线数据表
 * 存储各指数的MA5、MA10、MA20、MA60数据
 */
@Entity('moving_averages')
@Index(['indexId', 'tradeDate'], { unique: true })
export class MovingAverage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', comment: '关联的指数ID' })
  indexId: string;

  @ManyToOne(() => IndexEntity, { eager: true })
  @JoinColumn({ name: 'indexId' })
  index: IndexEntity;

  @Column({ type: 'date', comment: '交易日期' })
  tradeDate: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2, comment: '收盘价（现价）' })
  closePrice: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, comment: '5日均线' })
  ma5: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, comment: '10日均线' })
  ma10: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, comment: '20日均线' })
  ma20: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, comment: '60日均线' })
  ma60: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true, comment: '偏离率（现价相对MA20）' })
  deviationRate: number | null;

  @Column({ type: 'int', default: 0, comment: 'MA5计算样本数' })
  ma5SampleCount: number;

  @Column({ type: 'int', default: 0, comment: 'MA10计算样本数' })
  ma10SampleCount: number;

  @Column({ type: 'int', default: 0, comment: 'MA20计算样本数' })
  ma20SampleCount: number;

  @Column({ type: 'int', default: 0, comment: 'MA60计算样本数' })
  ma60SampleCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
