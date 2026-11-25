import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Index as IndexEntity } from '../../indices/entities/index.entity';

/**
 * 指标状态机逐日状态表(10 态)。basis 是全库唯一允许 jsonb 的地方(文本数组)。
 */
@Entity('indicator_states')
@Index(['indexId', 'tradeDate'], { unique: true })
export class IndicatorState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', comment: '关联的指数ID' })
  indexId: string;

  @ManyToOne(() => IndexEntity, { eager: false })
  @JoinColumn({ name: 'indexId' })
  index: IndexEntity;

  @Column({ type: 'date', comment: '交易日期' })
  tradeDate: Date;

  @Column({ type: 'varchar', length: 32, comment: '状态键:trendHealthy/topWarning/trendStart/rangebound/bottomZone/bearWeak/bullPullback/bearRebound/breakdownConfirmed/wait' })
  stateKey: string;

  @Column({ type: 'jsonb', comment: '判定依据(文本数组)' })
  basis: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
