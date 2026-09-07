import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { DynamicTrendData } from './entities/dynamic-trend-data.entity';
import { DynamicTrendService } from './dynamic-trend.service';
import { DynamicTrendController } from './dynamic-trend.controller';
import { DynamicTrendCronService } from './dynamic-trend-cron.service';
import { Index } from '../indices/entities/index.entity';
import { IndexHistory } from '../indices/entities/index-history.entity';
import { MovingAverage } from '../moving-averages/entities/moving-average.entity';
import { TrendAnalysis } from '../trend-analysis/entities/trend-analysis.entity';
import { IndicesModule } from '../indices/indices.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([DynamicTrendData, Index, IndexHistory, MovingAverage, TrendAnalysis]),
    forwardRef(() => IndicesModule),
  ],
  providers: [DynamicTrendService, DynamicTrendCronService],
  controllers: [DynamicTrendController],
  exports: [DynamicTrendService],
})
export class DynamicTrendModule {}
