import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { CronConfigService } from './cron-config.service';
import { CronConfigController } from './cron-config.controller';
import { CronConfig } from './entities/cron-config.entity';
import { IndicesModule } from '../indices/indices.module';
import { MovingAveragesModule } from '../moving-averages/moving-averages.module';
import { TrendAnalysisModule } from '../trend-analysis/trend-analysis.module';
import { DynamicTrendModule } from '../dynamic-trend/dynamic-trend.module';
import { KLinePatternsModule } from '../kline-patterns/kline-patterns.module';
import { KLinePatternCronService } from '../kline-patterns/kline-pattern-cron.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CronConfig]),
    ScheduleModule.forRoot(),
    forwardRef(() => IndicesModule),
    forwardRef(() => MovingAveragesModule),
    forwardRef(() => TrendAnalysisModule),
    forwardRef(() => DynamicTrendModule),
    forwardRef(() => KLinePatternsModule),
  ],
  controllers: [CronConfigController],
  providers: [CronConfigService],
  exports: [CronConfigService],
})
export class CronConfigModule {}
