import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { Index as IndexEntity } from '../../indices/entities/index.entity';

/**
 * 趋势状态枚举
 */
export enum TrendState {
  UPTREND = 'uptrend',      // 上升趋势
  DOWNTREND = 'downtrend',  // 下降趋势
  SIDEWAYS = 'sideways'     // 横盘趋势
}

/**
 * K线形态信号类型
 */
export enum PatternSignal {
  BUY = 'buy',        // 看涨信号
  SELL = 'sell',      // 看跌信号
  NEUTRAL = 'neutral' // 中性信号
}

/**
 * K线形态数据表
 * 存储指数的K线形态分析结果
 */
@Entity('kline_patterns')
@Index(['indexId', 'tradeDate', 'isRealtime'], { unique: true })
export class KLinePattern {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', comment: '关联的指数ID' })
  indexId: string;

  @ManyToOne(() => IndexEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'indexId' })
  index: IndexEntity;

  @Column({ type: 'date', comment: '交易日期' })
  tradeDate: Date;

  @Column({
    type: 'enum',
    enum: TrendState,
    comment: '趋势状态'
  })
  trendState: TrendState;

  @Column({ length: 50, comment: 'K线形态类型，如 hammer, bullish_engulfing' })
  patternType: string;

  @Column({ length: 100, comment: 'K线形态名称，如 锤子线、看涨吞没' })
  patternName: string;

  @Column({ type: 'decimal', precision: 5, scale: 4, comment: '置信度 (0-1)' })
  confidence: number;

  @Column({
    type: 'enum',
    enum: PatternSignal,
    comment: '信号类型'
  })
  signal: PatternSignal;

  @Column({ type: 'jsonb', nullable: true, comment: '原始K线数据 [当前, 前1日, 前2日...]' })
  candleData: any;

  @Column({ type: 'jsonb', nullable: true, comment: '扩展信息（成交量、均线等）' })
  metadata: Record<string, any> | null;

  @Column({ default: false, comment: '是否实时计算（true=盘中动态计算，false=收盘后静态计算）' })
  isRealtime: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
