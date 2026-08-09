import { Module } from '@nestjs/common';
import { TushareService } from './tushare.service';

@Module({
  providers: [TushareService],
  exports: [TushareService],
})
export class TushareModule {}
