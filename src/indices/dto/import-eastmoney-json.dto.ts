import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 人工导入东财JSON数据DTO
 * 使用宽松验证，接受任意东财JSON格式
 */
export class ImportEastmoneyJsonDto {
  @ApiProperty({
    description: '东财JSON数据对象（接受任意格式）',
    example: {
      rc: 0,
      rt: 17,
      svr: 181669690,
      lt: 1,
      full: 0,
      dlmkts: '',
      dsc: '0',
      data: {
        code: '932000',
        market: 2,
        name: '中证2000',
        decimal: 2,
        dktotal: 3066,
        preKPrice: 2920.82,
        klines: [
          '2026-08-05,2917.80,3000.29,3006.64,2917.50,294193994,406909826043.00,3.05',
        ],
      },
    },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;

  @ApiProperty({
    description: '可选：指定指数ID，如果不传则自动根据code查找',
    required: false,
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsString()
  indexId?: string;
}

/**
 * 东财K线数据项（接口类型）
 */
export interface EastmoneyKlineData {
  code: string;
  market: number;
  name: string;
  decimal: number;
  dktotal: number;
  preKPrice: number;
  klines: string[];
}

/**
 * 东财JSON数据结构（接口类型）
 */
export interface EastmoneyJsonData {
  rc: number;
  rt: number;
  svr: number;
  lt: number;
  full: number;
  dlmkts: string;
  dsc: string;
  data: EastmoneyKlineData;
}

/**
 * 导入结果
 */
export interface ImportJsonResult {
  success: boolean;
  message: string;
  indexId?: string;
  indexName?: string;
  indexCode?: string;
  total: number;
  imported: number;
  skipped: number;
  dateRange?: {
    start: string;
    end: string;
  };
}
