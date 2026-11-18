import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

/**
 * 宏观看板配置（单行键值）
 * unified_start = 统一历史起点（回填脚本按“各指标最早日期中的最晚者”计算后写入）
 */
@Entity('macro_config')
export class MacroConfig {
  @PrimaryColumn({ length: 50 })
  key: string;

  @Column({ length: 200 })
  value: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
