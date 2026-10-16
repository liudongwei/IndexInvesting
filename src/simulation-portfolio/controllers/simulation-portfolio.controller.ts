import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { SimulationAccountService } from '../services/simulation-account.service';
import { SimulationTradeService } from '../services/simulation-trade.service';
import { BuyStockDto, SellStockDto } from '../dto/trade-stock.dto';

/**
 * 模拟交易 Portfolio Controller（Web）
 */
@Controller('simulation/portfolio')
export class SimulationPortfolioController {
  constructor(
    private accountService: SimulationAccountService,
    private tradeService: SimulationTradeService,
  ) {}

  // ========== 账户管理 ==========

  @Get('accounts')
  async getAccounts() {
    return this.accountService.findAll();
  }

  @Get('accounts/:id')
  async getAccount(@Param('id') id: string) {
    return this.accountService.findOne(id);
  }

  // ========== 交易操作 ==========

  @Post('buy')
  async buyStock(@Body() dto: BuyStockDto) {
    return this.tradeService.buyStock(dto);
  }

  @Post('sell')
  async sellStock(@Body() dto: SellStockDto) {
    return this.tradeService.sellStock(dto);
  }

  // ========== 持仓查询 ==========

  @Get('positions/:accountId')
  async getPositions(@Param('accountId') accountId: string) {
    return this.tradeService.getPositionList(accountId);
  }

  // ========== 交易记录 ==========

  @Get('trades/:accountId')
  async getTrades(
    @Param('accountId') accountId: string,
    @Query('limit') limit?: number,
  ) {
    return this.tradeService.getTradeHistory(
      accountId,
      limit ? Number(limit) : 50,
    );
  }

  // ========== 资产快照 ==========

  @Get('snapshots/:accountId')
  async getSnapshots(@Param('accountId') accountId: string) {
    // TODO: 实现快照查询
    return { message: '快照功能待实现' };
  }

  // ========== 实时价格查询 ==========

  @Get('realtime-price/:tencentCode')
  async getRealTimePrice(@Param('tencentCode') tencentCode: string) {
    return this.tradeService.getRealTimePrice(tencentCode);
  }
}
