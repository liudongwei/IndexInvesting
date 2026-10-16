import { IsString, IsOptional, IsEnum, IsNumber, Min } from 'class-validator';
import { StrategyType, AccountStatus } from '../entities/simulation-account.entity';

/**
 * 更新交易账户 DTO
 */
export class UpdateAccountDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(StrategyType, { message: '策略类型必须是 GRID_TRADING、TREND_RIGHT 或 TREND_LEFT' })
  @IsOptional()
  strategyType?: StrategyType;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0, { message: '初始资金必须大于等于0' })
  @IsOptional()
  initialCapital?: number;

  @IsNumber()
  @Min(0, { message: '佣金率必须大于等于0' })
  @IsOptional()
  commissionRate?: number;

  @IsNumber()
  @Min(0, { message: '最低佣金必须大于等于0' })
  @IsOptional()
  minCommission?: number;

  @IsEnum(AccountStatus, { message: '状态必须是 active 或 inactive' })
  @IsOptional()
  status?: AccountStatus;
}
