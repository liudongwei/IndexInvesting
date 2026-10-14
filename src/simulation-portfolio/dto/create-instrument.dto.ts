import { IsString, IsNotEmpty, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { InstrumentType, TradingRule } from '../entities/trading-instrument.entity';

export class CreateInstrumentDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  fullName?: string;

  @IsEnum(InstrumentType)
  @IsNotEmpty()
  type: InstrumentType;

  @IsString()
  @IsNotEmpty()
  exchange: string;

  @IsString()
  @IsNotEmpty()
  tencentCode: string;

  @IsUUID()
  @IsOptional()
  indexId?: string;

  @IsString()
  @IsOptional()
  indexCode?: string;

  @IsString()
  @IsOptional()
  indexName?: string;

  @IsOptional()
  lotSize?: number;

  @IsEnum(TradingRule)
  @IsOptional()
  tradingRule?: TradingRule;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  issuer?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsOptional()
  listingDate?: Date;

  @IsOptional()
  metadata?: any;
}
