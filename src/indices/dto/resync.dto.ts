import {
  IsString,
  IsOptional,
  Matches,
  IsBooleanString,
  IsIn,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { INDEX_TYPE } from '../../common/constants/index-type.constants';

export class ResyncDto {
  @ApiProperty({
    description: '开始日期，格式 YYYY-MM-DD',
    example: '2026-08-10',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: '开始日期格式错误，请使用 YYYY-MM-DD 格式',
  })
  startDate: string;

  @ApiProperty({
    description: '结束日期，格式 YYYY-MM-DD',
    example: '2026-08-10',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: '结束日期格式错误，请使用 YYYY-MM-DD 格式',
  })
  endDate: string;
}

export class BulkResyncDto extends ResyncDto {
  @ApiProperty({
    description: '是否只同步启用的指数（isActive=true）',
    example: 'true',
    required: false,
  })
  @IsOptional()
  @IsBooleanString()
  onlyActive?: string = 'true';

  @ApiProperty({
    description: '指数类型：indices（大盘指数）或 sectors（行业指数），不传或传空则同步所有',
    example: 'indices',
    required: false,
  })
  @IsOptional()
  type?: string;
}
