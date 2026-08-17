import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { IndicesService } from './indices.service';
import { IndicesController } from './indices.controller';
import { IndexDataService } from './index-data.service';
import { IndexSyncService } from './index-sync.service';
import { EastmoneyDataService } from './eastmoney-data.service';
import { MovingAveragesModule } from '../moving-averages/moving-averages.module';
import { TrendAnalysisModule } from '../trend-analysis/trend-analysis.module';
import { Index } from './entities/index.entity';
import { IndexHistory } from './entities/index-history.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Index, IndexHistory]),
    HttpModule,
    ScheduleModule.forRoot(),
    forwardRef(() => MovingAveragesModule),
    forwardRef(() => TrendAnalysisModule),
  ],
  controllers: [IndicesController],
  providers: [IndicesService, IndexDataService, IndexSyncService, EastmoneyDataService],
  exports: [IndicesService, IndexDataService, IndexSyncService, EastmoneyDataService],
})
export class IndicesModule {}
