import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('cron_configs')
export class CronConfig {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  taskName: string;

  @Column({ type: 'varchar', length: 100 })
  cronExpression: string;

  @Column({ type: 'varchar', length: 100 })
  displayName: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: true })
  isEnabled: boolean;

  @Column({ type: 'varchar', length: 50, nullable: true })
  category: string;

  @Column({ type: 'timestamp', nullable: true })
  lastExecutedAt: Date;

  @Column({ type: 'int', default: 0 })
  executionCount: number;

  @Column({ type: 'text', nullable: true })
  lastError: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
