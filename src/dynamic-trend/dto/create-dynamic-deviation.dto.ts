export class CreateDynamicDeviationDto {
  indexId: string;
  calculationTime: Date;
  tradeDate: Date;
  currentPrice: number;
  ma20: number;
  changePercent: number;
  deviationRate?: number | null;
  statusChangeDate?: Date | null;
  intervalChangePercent?: number | null;
  rank: number;
  rankChange: number;
  totalRankCount: number;
  indexType?: string | null;
}
