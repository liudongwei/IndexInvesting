import { IsUUID, IsOptional, IsBoolean, IsInt, Min, IsDateString } from 'class-validator';
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
