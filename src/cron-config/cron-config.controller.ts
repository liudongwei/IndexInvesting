import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Patch,
} from '@nestjs/common';
import { CronConfigService } from './cron-config.service';
import { CreateCronConfigDto } from './dto/create-cron-config.dto';
import { UpdateCronConfigDto } from './dto/update-cron-config.dto';
import { CronConfig } from './entities/cron-config.entity';

@Controller('admin/cron-configs')
export class CronConfigController {
  constructor(private readonly cronConfigService: CronConfigService) {}

  /**
   * 获取所有 Cron 配置
   */
  @Get()
  async findAll(): Promise<CronConfig[]> {
    return this.cronConfigService.findAll();
  }

  /**
   * 获取单个 Cron 配置
   */
  @Get(':taskName')
  async findOne(@Param('taskName') taskName: string): Promise<CronConfig | null> {
    return this.cronConfigService.findOne(taskName);
  }

  /**
   * 创建 Cron 配置
   */
  @Post()
  async create(@Body() dto: CreateCronConfigDto): Promise<CronConfig> {
    return this.cronConfigService.create(dto);
  }

  /**
   * 更新 Cron 配置
   */
  @Put(':taskName')
  async update(
    @Param('taskName') taskName: string,
    @Body() dto: UpdateCronConfigDto,
  ): Promise<CronConfig> {
    return this.cronConfigService.update(taskName, dto);
  }

  /**
   * 切换任务启用状态
   */
  @Patch(':taskName/toggle')
  async toggle(@Param('taskName') taskName: string): Promise<CronConfig> {
    return this.cronConfigService.toggle(taskName);
  }

  /**
   * 立即执行一次任务
   */
  @Post(':taskName/run')
  async runOnce(
    @Param('taskName') taskName: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.cronConfigService.runOnce(taskName);
  }

  /**
   * 获取任务运行状态
   */
  @Get(':taskName/status')
  getStatus(@Param('taskName') taskName: string): { running: boolean; nextRun?: Date } {
    return this.cronConfigService.getJobStatus(taskName);
  }

  /**
   * 删除 Cron 配置
   */
  @Delete(':taskName')
  async remove(@Param('taskName') taskName: string): Promise<void> {
    return this.cronConfigService.remove(taskName);
  }
}
