import { IsString, IsOptional, IsBoolean, IsDateString, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateIndexDto {
  @ApiProperty({ description: '指数代码（用于API请求）', example: 'sh000300' })
  @IsString()
  code: string;

  @ApiProperty({ description: '官方标准代码', example: '000300.SH', required: false })
  @IsString()
  @IsOptional()
  officialCode?: string;

  @ApiProperty({ description: '指数名称', example: '沪深300' })
  @IsString()
  name: string;

  @ApiProperty({ description: '交易所', example: '上交所', required: false })
  @IsString()
  @IsOptional()
  exchange?: string;

  @ApiProperty({ description: '指数描述', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: '是否启用自动同步', default: true, required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({ description: '数据同步起始日期', example: '2020-01-01', required: false })
  @IsDateString()
  @IsOptional()
  syncStartDate?: string;

  @ApiProperty({ description: '扩展元数据', example: { category: '规模指数', publisher: '中证指数' }, required: false })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
