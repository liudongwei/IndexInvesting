import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Index as IndexEntity } from '../../indices/entities/index.entity';

/**
 * 指标信号表 —— 稀疏表(只有信号日)。
 * type: macdGoldenCross/macdDeathCross/macdTopDivergence/macdBottomDivergence/obvTopDivergence/obvBottomDivergence/bollBandSqueeze/volumeSurge/volumeShrink
 */
@Entity('indicator_signals')
@Index(['indexId', 'tradeDate', 'type'], { unique: true })
export class IndicatorSignal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', comment: '关联的指数ID' })
  indexId: string;

  @ManyToOne(() => IndexEntity, { eager: false })
  @JoinColumn({ name: 'indexId' })
  index: IndexEntity;

  @Column({ type: 'date', comment: '信号日期' })
  tradeDate: Date;

  @Column({ type: 'varchar', length: 48, comment: '信号类型' })
  type: string;

  @Column({ type: 'varchar', length: 8, comment: '方向:bullish/bearish/neutral' })
  direction: string;

  @Column({ type: 'text', comment: '信号依据(引用实际读数)' })
  basis: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
