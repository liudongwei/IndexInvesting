import { IsUUID, IsOptional, IsBoolean, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

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
  @IsBoolean()
  isRealtime?: boolean;
}
