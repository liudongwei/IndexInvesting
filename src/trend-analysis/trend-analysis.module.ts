import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { TrendAnalysisService } from './trend-analysis.service';
import { TrendAnalysisController } from './trend-analysis.controller';
import { TrendCronService } from './trend-cron.service';
import { TrendAnalysis } from './entities/trend-analysis.entity';
import { MovingAverage } from '../moving-averages/entities/moving-average.entity';
import { IndexHistory } from '../indices/entities/index-history.entity';
import { IndicesModule } from '../indices/indices.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TrendAnalysis, MovingAverage, IndexHistory]),
    ScheduleModule.forRoot(),
    IndicesModule,
  ],
  controllers: [TrendAnalysisController],
  providers: [TrendAnalysisService, TrendCronService],
  exports: [TrendAnalysisService],
})
export class TrendAnalysisModule {}
