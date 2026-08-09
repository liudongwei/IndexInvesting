import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, Index as IndexDecorator } from 'typeorm';
import { IndexHistory } from './index-history.entity';

/**
 * 大盘指数表
 * 存储各大盘指数的基本信息
 */
@Entity('indices')
@IndexDecorator(['officialCode'], { unique: true })
export class Index {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 20, comment: '指数代码，如 sh000300，用于API请求' })
  code: string;

  @Column({ unique: true, length: 20, nullable: true, comment: '官方标准代码，如 000300.SH' })
  officialCode?: string;

  @Column({ length: 50, comment: '指数名称，如 沪深300' })
  name: string;

  @Column({ length: 20, nullable: true, comment: '交易所，如 上交所、深交所' })
  exchange: string;

  @Column({ type: 'text', nullable: true, comment: '指数描述' })
  description: string;

  @Column({ default: true, comment: '是否启用自动同步' })
  isActive: boolean;

  @Column({ type: 'date', nullable: true, comment: '数据同步起始日期' })
  syncStartDate: Date | null;

  @Column({ type: 'date', nullable: true, comment: '最后同步日期' })
  lastSyncDate: Date | null;

  @Column({ type: 'int', default: 0, comment: '历史数据条数' })
  historyCount: number;

  @Column({ type: 'json', nullable: true, comment: '扩展元数据，用于存储自定义字段' })
  metadata: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => IndexHistory, history => history.index)
  histories: IndexHistory[];
}
