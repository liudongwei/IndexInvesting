import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 网格回测记录表
 * 每次运行保存参数 + 结果快照（指标/权益曲线/成交明细），用于回看与参数对比。
 * K线数据不落库，读取详情时按参数重新解析（来自 instrument_histories / index_histories 缓存）。
 */
@Entity('grid_backtest_runs')
export class GridBacktestRun {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'varchar', length: 20, nullable: true, comment: '标的代码（trading_instruments.code）' })
  instrumentCode: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true, comment: '指数代码（indices.code）' })
  indexCode: string | null;

  @Column({ length: 20, default: 'instrument', comment: '目标类型 instrument/index' })
  targetType: string;

  @Column({ length: 100, comment: '目标展示名，如 沪深300ETF华夏(510330)' })
  targetLabel: string;

  @Column({ type: 'jsonb', comment: '回测参数（含解析后的默认值）' })
  params: Record<string, any>;

  @Column({ type: 'jsonb', comment: '指标汇总' })
  metrics: Record<string, any>;

  @Column({ type: 'jsonb', comment: '权益曲线 [{date,equity,cash,positionValue,benchmark}]' })
  curve: any[];

  @Column({ type: 'jsonb', comment: '成交明细 [{date,side,price,quantity,amount,commission,level}]' })
  trades: any[];

  @Column({ type: 'jsonb', nullable: true, comment: '适配性分析（趋势分布/波动率等）' })
  adaptivity: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true, comment: '数据源警告（如东财降级为缓存）' })
  warnings: string[] | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
