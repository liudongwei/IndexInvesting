import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  IsBoolean,
  IsIn,
  IsDateString,
  Min,
  Max,
  IsArray,
  ArrayNotEmpty,
  ArrayMaxSize,
} from 'class-validator';

const DEFAULT_COMMISSION_RATE = 0.00006; // 万0.6（与模拟账户默认一致）
const DEFAULT_MIN_COMMISSION = 0.2;

/** 网格回测运行参数 */
export class RunGridBacktestDto {
  @IsOptional() @IsString()
  instrumentCode?: string;

  @IsOptional() @IsString()
  indexCode?: string;

  @IsDateString() startDate: string;

  @IsDateString() endDate: string;

  /** 网格基准价（默认=区间首日收盘价） */
  @IsOptional() @IsNumber() @Min(0.0001)
  basePrice?: number;

  /** 上界相对基准价的上偏比例，如 0.15 = +15% */
  @IsNumber() @Min(0.001) @Max(10)
  upperPct: number;

  /** 下界相对基准价的下偏比例，如 0.15 = -15% */
  @IsNumber() @Min(0.001) @Max(0.95)
  lowerPct: number;

  @IsIn(['arithmetic', 'geometric'])
  gridMode: 'arithmetic' | 'geometric';

  @IsInt() @Min(1) @Max(200)
  gridCount: number;

  /** 每格买入份额（按 lotSize 取整） */
  @IsInt() @Min(1)
  quantityPerGrid: number;

  @IsNumber() @Min(1)
  initialCapital: number;

  @IsOptional() @IsNumber() @Min(0) @Max(0.01)
  commissionRate?: number;

  @IsOptional() @IsNumber() @Min(0)
  minCommission?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(1000)
  slippageBps?: number;

  @IsOptional() @IsInt() @Min(1) @Max(10000)
  lotSize?: number;

  /** T+1（当日买入不可当日卖出）；默认取标的交易规则 */
  @IsOptional() @IsBoolean()
  applyTPlus1?: boolean;

  /** 适配性分析参照指数（可选；标的未关联指数时手动指定） */
  @IsOptional() @IsString()
  adaptivityIndexCode?: string;
}

/** 参数自动建议 */
export class SuggestParamsDto {
  @IsOptional() @IsString()
  instrumentCode?: string;

  @IsOptional() @IsString()
  indexCode?: string;

  @IsDateString() startDate: string;

  @IsDateString() endDate: string;

  @IsOptional() @IsNumber() @Min(1)
  initialCapital?: number;

  @IsOptional() @IsInt() @Min(1) @Max(200)
  gridCount?: number;
}

/** 参数敏感性扫描（网格数 × 上界比例 矩阵，下界与上界对称） */
export class ScanGridDto {
  @IsOptional() @IsString()
  instrumentCode?: string;

  @IsOptional() @IsString()
  indexCode?: string;

  @IsDateString() startDate: string;

  @IsDateString() endDate: string;

  @IsOptional() @IsNumber() @Min(0.0001)
  basePrice?: number;

  @IsIn(['arithmetic', 'geometric'])
  gridMode: 'arithmetic' | 'geometric';

  @IsInt() @Min(1) @Max(200000)
  quantityPerGrid: number;

  @IsNumber() @Min(1)
  initialCapital: number;

  @IsOptional() @IsNumber() @Min(0) @Max(0.01)
  commissionRate?: number;

  @IsOptional() @IsNumber() @Min(0)
  minCommission?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(1000)
  slippageBps?: number;

  @IsOptional() @IsInt() @Min(1) @Max(10000)
  lotSize?: number;

  @IsOptional() @IsBoolean()
  applyTPlus1?: boolean;

  @IsOptional() @IsString()
  adaptivityIndexCode?: string;

  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(10)
  @IsInt({ each: true }) @Min(1, { each: true }) @Max(200, { each: true })
  gridCounts: number[];

  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(10)
  @IsNumber({}, { each: true }) @Min(0.001, { each: true }) @Max(10, { each: true })
  upperPcts: number[];
}

export const DEFAULTS = {
  COMMISSION_RATE: DEFAULT_COMMISSION_RATE,
  MIN_COMMISSION: DEFAULT_MIN_COMMISSION,
};
