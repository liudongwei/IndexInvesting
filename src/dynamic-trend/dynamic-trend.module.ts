import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { DynamicTrendData } from './entities/dynamic-trend-data.entity';
import { DynamicTrendService } from './dynamic-trend.service';
import { DynamicTrendController } from './dynamic-trend.controller';
import { DynamicTrendCronService } from './dynamic-trend-cron.service';
import { Index } from '../indices/entities/index.entity';
import { IndexHistory } from '../indices/entities/index-history.entity';
import { MovingAverage } from '../moving-averages/entities/moving-average.entity';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([DynamicTrendData, Index, IndexHistory, MovingAverage]),
  ],
  providers: [DynamicTrendService, DynamicTrendCronService],
  controllers: [DynamicTrendController],
  exports: [DynamicTrendService],
})
export class DynamicTrendModule {}
