import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KLinePattern } from './entities/kline-pattern.entity';
import { IndexHistory } from '../indices/entities/index-history.entity';
import { Index } from '../indices/entities/index.entity';
import { KLinePatternService } from './kline-pattern.service';
import { KLinePatternController } from './kline-pattern.controller';
import { KLinePatternCronService } from './kline-pattern-cron.service';
import { TrendDetectorService } from './patterns/trend-detector.service';
import { SingleCandlePatterns } from './patterns/single-candle.pattern';
import { TwoCandlePatterns } from './patterns/two-candle.pattern';
import { ThreeCandlePatterns } from './patterns/three-candle.pattern';
import { HaramiPatterns } from './patterns/harami.pattern';

@Module({
  imports: [
    TypeOrmModule.forFeature([KLinePattern, IndexHistory, Index])
  ],
  controllers: [KLinePatternController],
  providers: [
    KLinePatternService,
    KLinePatternCronService,
    TrendDetectorService,
    SingleCandlePatterns,
    TwoCandlePatterns,
    ThreeCandlePatterns,
    HaramiPatterns
  ],
  exports: [KLinePatternService, KLinePatternCronService]
})
export class KLinePatternsModule {}
