export interface CronConfig {
  taskName: string;
  cronExpression: string;
  displayName: string;
  description?: string;
  isEnabled: boolean;
  category?: string;
  lastExecutedAt?: string;
  executionCount: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}
