import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** 通知渠道配置（当前仅飞书群机器人；单行配置，面板可改） */
@Entity()
export class NotificationConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', default: 'feishu_bot' })
  channel: string;

  @Column({ type: 'varchar' })
  webhookUrl: string;

  /** 飞书自定义机器人签名校验密钥（可选） */
  @Column({ type: 'varchar', nullable: true })
  signSecret: string | null;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
