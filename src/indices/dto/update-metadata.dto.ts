import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateMetadataDto {
  @ApiProperty({
    description: '要更新的元数据对象，会与现有metadata合并',
    example: { sync_mode: 'api', firstTradingDay: '2005-04-08' },
  })
  @IsObject()
  metadata: Record<string, any>;

  @ApiProperty({
    description: '是否完全替换现有metadata（默认false为合并模式）',
    required: false,
    default: false,
  })
  @IsOptional()
  replace?: boolean;
}

export class BulkUpdateMetadataDto {
  @ApiProperty({
    description: '要更新的指数ID列表',
    example: ['uuid1', 'uuid2'],
    type: [String],
  })
  @IsString({ each: true })
  indexIds: string[];

  @ApiProperty({
    description: '要更新的元数据对象，会与现有metadata合并',
    example: { sync_mode: 'api', data_source: 'tushare' },
  })
  @IsObject()
  metadata: Record<string, any>;

  @ApiProperty({
    description: '是否完全替换现有metadata（默认false为合并模式）',
    required: false,
    default: false,
  })
  @IsOptional()
  replace?: boolean;
}
