import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

/**
 * 定时任务日志实体
 */
@Entity('simulation_task_logs')
export class SimulationTaskLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 30, name: 'task_type' })
  taskType: string;

  @Column({ type: 'timestamp', name: 'execute_time' })
  executeTime: Date;

  @Column({
    type: 'int',
    default: 0,
    name: 'accounts_processed',
  })
  accountsProcessed: number;

  @Column({
    type: 'int',
    default: 0,
    name: 'positions_updated',
  })
  positionsUpdated: number;

  @Column({ length: 20, default: 'success' })
  status: string;

  @Column({ type: 'text', nullable: true, name: 'error_message' })
  errorMessage: string;

  @Column({ type: 'int', nullable: true, name: 'duration_ms' })
  durationMs: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
