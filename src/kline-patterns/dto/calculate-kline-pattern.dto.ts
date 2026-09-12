import { IsUUID, IsOptional, IsDateString, IsArray, ArrayNotEmpty } from 'class-validator';

export class CalculateKLinePatternDto {
  @IsOptional()
  @IsDateString()
  tradeDate?: string;

  @IsOptional()
  @IsUUID()
  indexId?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  indexIds?: string[];
}
