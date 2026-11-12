import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { GridBacktestController } from './grid-backtest.controller';
import { GridBacktestService } from './grid-backtest.service';
import { GridBacktestRun } from './entities/grid-backtest-run.entity';
import { InstrumentHistory } from './entities/instrument-history.entity';
import { TradingInstrument } from '../simulation-portfolio/entities/trading-instrument.entity';
import { Index } from '../indices/entities/index.entity';
import { IndexHistory } from '../indices/entities/index-history.entity';
import { KLinePattern } from '../kline-patterns/entities/kline-pattern.entity';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([
      GridBacktestRun,
      InstrumentHistory,
      TradingInstrument,
      Index,
      IndexHistory,
      KLinePattern,
    ]),
  ],
  controllers: [GridBacktestController],
  providers: [GridBacktestService],
})
export class GridBacktestModule {}
