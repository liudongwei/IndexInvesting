import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MacroSeries } from './entities/macro-series.entity';
import { MacroConfig } from './entities/macro-config.entity';
import { MacroController } from './macro.controller';
import { MacroService } from './macro.service';
import { MacroCollectorService } from './macro-collector.service';

@Module({
  imports: [TypeOrmModule.forFeature([MacroSeries, MacroConfig])],
  controllers: [MacroController],
  providers: [MacroService, MacroCollectorService],
  exports: [MacroCollectorService],
})
export class MacroModule {}
