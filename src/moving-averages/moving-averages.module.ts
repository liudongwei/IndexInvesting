import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { MovingAveragesService } from './moving-averages.service';
import { MovingAveragesController } from './moving-averages.controller';
import { MACronService } from './ma-cron.service';
import { MovingAverage } from './entities/moving-average.entity';
import { IndexHistory } from '../indices/entities/index-history.entity';
import { IndicesModule } from '../indices/indices.module';
import { TrendAnalysisModule } from '../trend-analysis/trend-analysis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MovingAverage, IndexHistory]),
    ScheduleModule.forRoot(),
    forwardRef(() => IndicesModule),
    forwardRef(() => TrendAnalysisModule),
  ],
  controllers: [MovingAveragesController],
  providers: [MovingAveragesService, MACronService],
  exports: [MovingAveragesService],
})
export class MovingAveragesModule {}
