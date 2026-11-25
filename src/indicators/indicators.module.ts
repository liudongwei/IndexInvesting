import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Index } from '../indices/entities/index.entity';
import { IndexHistory } from '../indices/entities/index-history.entity';
import { MovingAverage } from '../moving-averages/entities/moving-average.entity';
import { KLinePattern } from '../kline-patterns/entities/kline-pattern.entity';
import { IndicatorValue } from './entities/indicator-value.entity';
import { IndicatorState } from './entities/indicator-state.entity';
import { IndicatorSignal } from './entities/indicator-signal.entity';
import { IndicatorsService } from './indicators.service';
import { IndicatorsCronService } from './indicators-cron.service';
import { IndicatorsController } from './indicators.controller';

/**
 * 技术指标模块(P1 计算层+存储层 + P2 读表接口)。
 * cron 任务走 cron-config 面板(indicatorBatchAStock / indicatorBatchHkStock / indicatorBatchUsPrecious)。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      IndicatorValue,
      IndicatorState,
      IndicatorSignal,
      Index,
      IndexHistory,
      MovingAverage,
      KLinePattern,
    ]),
  ],
  controllers: [IndicatorsController],
  providers: [IndicatorsService, IndicatorsCronService],
  exports: [IndicatorsService, IndicatorsCronService],
})
export class IndicatorsModule {}
