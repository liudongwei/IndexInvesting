import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { CronConfigService } from './cron-config.service';
import { CronConfigController } from './cron-config.controller';
import { CronConfig } from './entities/cron-config.entity';
import { IndicesModule } from '../indices/indices.module';
import { MovingAveragesModule } from '../moving-averages/moving-averages.module';
import { TrendAnalysisModule } from '../trend-analysis/trend-analysis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CronConfig]),
    ScheduleModule.forRoot(),
    forwardRef(() => IndicesModule),
    forwardRef(() => MovingAveragesModule),
    forwardRef(() => TrendAnalysisModule),
  ],
  controllers: [CronConfigController],
  providers: [CronConfigService],
  exports: [CronConfigService],
})
export class CronConfigModule {}
