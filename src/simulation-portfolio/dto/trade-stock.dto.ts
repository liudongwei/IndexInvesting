import { IsUUID, IsString, IsInt, Min } from 'class-validator';

export class BuyStockDto {
  @IsUUID()
  accountId: string;

  @IsString()
  instrumentCode: string;

  @IsInt()
  @Min(100) // 最少1手（100股）
  quantity: number;
}

export class SellStockDto {
  @IsUUID()
  accountId: string;

  @IsString()
  instrumentCode: string;

  @IsInt()
  @Min(100) // 最少1手（100股）
  quantity: number;
}
