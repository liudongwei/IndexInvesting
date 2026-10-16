import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { TradingInstrument } from './entities/trading-instrument.entity';
import { SimulationAccount } from './entities/simulation-account.entity';
import { SimulationPosition } from './entities/simulation-position.entity';
import { SimulationTrade } from './entities/simulation-trade.entity';
import { SimulationDailySnapshot } from './entities/simulation-daily-snapshot.entity';
import { SimulationTaskLog } from './entities/simulation-task-log.entity';
import { TradingInstrumentService } from './services/trading-instrument.service';
import { SimulationAccountService } from './services/simulation-account.service';
import { SimulationTradeService } from './services/simulation-trade.service';
import { PositionUpdateService } from './services/position-update.service';
import { TradingInstrumentController } from './controllers/trading-instrument.controller';
import { SimulationPortfolioController } from './controllers/simulation-portfolio.controller';
import { SimulationAccountAdminController } from './controllers/simulation-account-admin.controller';
import { SimulationCronService } from './simulation-cron.service';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([
      TradingInstrument,
      SimulationAccount,
      SimulationPosition,
      SimulationTrade,
      SimulationDailySnapshot,
      SimulationTaskLog,
    ]),
  ],
  providers: [
    TradingInstrumentService,
    SimulationAccountService,
    SimulationTradeService,
    PositionUpdateService,
    SimulationCronService,
  ],
  controllers: [
    TradingInstrumentController,
    SimulationPortfolioController,
    SimulationAccountAdminController,
  ],
  exports: [
    TradingInstrumentService,
    SimulationAccountService,
    SimulationTradeService,
    PositionUpdateService,
  ],
})
export class SimulationPortfolioModule {}
