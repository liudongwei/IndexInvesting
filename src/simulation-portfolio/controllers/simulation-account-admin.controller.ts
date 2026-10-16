import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  ValidationPipe,
} from '@nestjs/common';
import { SimulationAccountService } from '../services/simulation-account.service';
import { CreateAccountDto } from '../dto/create-account.dto';
import { UpdateAccountDto } from '../dto/update-account.dto';
import { AccountStatus } from '../entities/simulation-account.entity';

/**
 * 交易账户管理 Controller（Admin）
 */
@Controller('admin/simulation-accounts')
export class SimulationAccountAdminController {
  constructor(private accountService: SimulationAccountService) {}

  /**
   * 分页查询交易账户
   * GET /admin/simulation-accounts?page=1&limit=20&status=active
   */
  @Get()
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: AccountStatus,
  ) {
    const accounts = await this.accountService.findAll(status);
    
    // 简单分页处理
    const total = accounts.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const data = accounts.slice(start, end);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 查询账户详情
   * GET /admin/simulation-accounts/:id
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.accountService.findOne(id);
  }

  /**
   * 创建交易账户
   * POST /admin/simulation-accounts
   */
  @Post()
  async create(@Body(new ValidationPipe()) createAccountDto: CreateAccountDto) {
    return this.accountService.createAccount(
      createAccountDto.name,
      createAccountDto.strategyType,
      createAccountDto.description,
      createAccountDto.initialCapital || 20000,
    );
  }

  /**
   * 更新交易账户
   * PUT /admin/simulation-accounts/:id
   */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body(new ValidationPipe()) updateAccountDto: UpdateAccountDto,
  ) {
    return this.accountService.updateAccount(id, updateAccountDto);
  }

  /**
   * 删除交易账户
   * DELETE /admin/simulation-accounts/:id
   */
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const account = await this.accountService.findOne(id);
    // 软删除：将状态设置为 closed
    await this.accountService.updateAccount(id, { status: AccountStatus.CLOSED });
    return { message: '账户已删除', id: account.id };
  }
}
