import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Index as IndexEntity } from '../../indices/entities/index.entity';

/**
 * 技术指标逐日宽表(与 moving_averages 同构)
 * MA5/10/20/60/120/250 不在此列 —— MA 单一来源是 moving_averages 表。
 * 列规格钉死:references/technical-indicators-spec.md §4.1。
 */
@Entity('indicator_values')
@Index(['indexId', 'tradeDate'], { unique: true })
export class IndicatorValue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', comment: '关联的指数ID' })
  indexId: string;

  @ManyToOne(() => IndexEntity, { eager: false })
  @JoinColumn({ name: 'indexId' })
  index: IndexEntity;

  @Column({ type: 'date', comment: '交易日期' })
  tradeDate: Date;

  // ---- MACD (12,26,9) ----
  @Column({ type: 'decimal', precision: 20, scale: 4, nullable: true, comment: 'MACD DIF' })
  macdDif: number | null;

  @Column({ type: 'decimal', precision: 20, scale: 4, nullable: true, comment: 'MACD DEA' })
  macdDea: number | null;

  @Column({ type: 'decimal', precision: 20, scale: 4, nullable: true, comment: 'MACD 柱体=(DIF−DEA)×2' })
  macdHist: number | null;

  // ---- BOLL (20,2) ----
  @Column({ type: 'decimal', precision: 20, scale: 4, nullable: true, comment: 'BOLL 中轨 MA20' })
  bollMid: number | null;

  @Column({ type: 'decimal', precision: 20, scale: 4, nullable: true, comment: 'BOLL 上轨' })
  bollUpper: number | null;

  @Column({ type: 'decimal', precision: 20, scale: 4, nullable: true, comment: 'BOLL 下轨' })
  bollLower: number | null;

  // ---- ADX (14) ----
  @Column({ type: 'decimal', precision: 20, scale: 4, nullable: true, comment: 'ADX' })
  adx: number | null;

  @Column({ type: 'decimal', precision: 20, scale: 4, nullable: true, comment: '+DI' })
  pdi: number | null;

  @Column({ type: 'decimal', precision: 20, scale: 4, nullable: true, comment: '−DI' })
  mdi: number | null;

  // ---- OBV ----
  @Column({ type: 'decimal', precision: 20, scale: 4, nullable: true, comment: 'OBV 累积能量潮' })
  obv: number | null;

  @Column({ type: 'decimal', precision: 20, scale: 4, nullable: true, comment: 'OBV 的 20 日 EMA' })
  obvEma20: number | null;

  // ---- 量能 ----
  @Column({ type: 'decimal', precision: 20, scale: 4, nullable: true, comment: '量比=当日量÷前5日均量' })
  volumeRatio: number | null;

  @Column({ type: 'decimal', precision: 20, scale: 4, nullable: true, comment: '5日均量' })
  vma5: number | null;

  @Column({ type: 'decimal', precision: 20, scale: 4, nullable: true, comment: '10日均量' })
  vma10: number | null;

  // ---- RSI (14) / BIAS / CMF / ATR / HV ----
  @Column({ type: 'decimal', precision: 20, scale: 4, nullable: true, comment: 'RSI(14) Wilder' })
  rsi: number | null;

  @Column({ type: 'decimal', precision: 20, scale: 4, nullable: true, comment: 'CMF(20) 资金流' })
  cmf: number | null;

  @Column({ type: 'decimal', precision: 20, scale: 4, nullable: true, comment: 'BIAS20' })
  bias20: number | null;

  @Column({ type: 'decimal', precision: 20, scale: 4, nullable: true, comment: 'BIAS60' })
  bias60: number | null;

  @Column({ type: 'decimal', precision: 20, scale: 4, nullable: true, comment: 'ATR(14)' })
  atr14: number | null;

  @Column({ type: 'decimal', precision: 20, scale: 4, nullable: true, comment: 'HV(20) 年化历史波动率' })
  hv20: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
