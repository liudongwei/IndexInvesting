import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * 宏观看板数据表
 * 存储各宏观指标（汇率/黄金/国债收益率/股指/可转债ETF）的日度序列
 * 一个指标一行序列：(metric, dataDate) 唯一
 */
@Entity('macro_series')
@Index('uq_macro_metric_date', ['metric', 'dataDate'], { unique: true })
export class MacroSeries {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 40, comment: '指标代码，如 usdcnh / dxy / us_10y_yield' })
  metric: string;

  @Column({ type: 'date', comment: '数据所属交易日（以数据源自己的 session 日期为准）' })
  dataDate: Date;

  @Column({ type: 'decimal', precision: 18, scale: 6, comment: '数值（价格/收益率%/指数点位）' })
  value: number;

  @Column({ length: 40, nullable: true, comment: '数据来源：sina/tencent/chinabond/treasury/eastmoney' })
  source?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
