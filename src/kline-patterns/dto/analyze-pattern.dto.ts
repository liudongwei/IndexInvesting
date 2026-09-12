import { IsUUID, IsOptional, IsBoolean, IsInt, Min, IsDateString, IsIn } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class AnalyzePatternDto {
  @IsUUID()
  indexId: string;

  @IsOptional()
  tradeDate?: Date;

  @IsOptional()
  @IsBoolean()
  isRealtime?: boolean;
}

export class GetPatternHistoryDto {
  @IsUUID()
  indexId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isRealtime?: boolean;
}

export class QueryPatternDto {
  @IsOptional()
  @IsUUID()
  indexId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isRealtime?: boolean;

  @IsOptional()
  @IsIn(['uptrend', 'downtrend', 'sideways'], { message: '趋势状态必须是 uptrend、downtrend 或 sideways' })
  trendState?: string;

  @IsOptional()
  patternName?: string;

  @IsOptional()
  @IsIn(['buy', 'sell', 'neutral'], { message: '信号必须是 buy、sell 或 neutral' })
  signal?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;
}
