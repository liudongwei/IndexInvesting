import { IsString, IsNotEmpty, Matches, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RecalculateTrendDto {
  @ApiProperty({
    description: '开始日期，格式：YYYY-MM-DD',
    example: '2024-01-01',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: '日期格式错误，请使用 YYYY-MM-DD 格式',
  })
  startDate: string;

  @ApiProperty({
    description: '结束日期，格式：YYYY-MM-DD',
    example: '2024-12-31',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: '日期格式错误，请使用 YYYY-MM-DD 格式',
  })
  endDate: string;

  @ApiProperty({
    description: '指数类型：indices（大盘指数）或 sectors（行业指数），不传或传空则处理所有',
    example: 'indices',
    required: false,
  })
  @IsOptional()
  type?: string;
}
