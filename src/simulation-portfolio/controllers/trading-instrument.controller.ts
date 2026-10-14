import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { TradingInstrumentService } from '../services/trading-instrument.service';
import { CreateInstrumentDto } from '../dto/create-instrument.dto';
import { UpdateInstrumentDto } from '../dto/update-instrument.dto';

/**
 * 交易标的管理 Controller（Admin）
 */
@Controller('admin/trading-instruments')
export class TradingInstrumentController {
  constructor(private instrumentService: TradingInstrumentService) {}

  @Post()
  async create(@Body() dto: CreateInstrumentDto) {
    return this.instrumentService.create(dto);
  }

  @Get()
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    return this.instrumentService.findAll(
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
      type,
      status,
    );
  }

  @Get('search')
  async search(@Query('keyword') keyword?: string) {
    if (!keyword) {
      return [];
    }
    return this.instrumentService.search(keyword);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.instrumentService.findOne(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateInstrumentDto) {
    return this.instrumentService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.instrumentService.remove(id);
    return { success: true, message: '删除成功' };
  }

  @Post('bulk-import')
  async bulkImport(@Body() instruments: CreateInstrumentDto[]) {
    return this.instrumentService.importBulk(instruments);
  }
}
