import { Body, Controller, Get, HttpException, HttpStatus, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationService } from './notification.service';

@ApiTags('通知配置')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/notification-config')
export class NotificationConfigController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: '获取通知渠道配置（可能为空）' })
  async getConfig() {
    return { config: await this.notificationService.getConfig() };
  }

  @Put()
  @ApiOperation({ summary: '保存通知渠道配置（webhook/签名密钥/启停）' })
  async saveConfig(
    @Body()
    dto: { webhookUrl: string; signSecret?: string; enabled?: boolean },
  ) {
    try {
      return { config: await this.notificationService.saveConfig(dto) };
    } catch (e: any) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('test')
  @ApiOperation({ summary: '发送测试消息到飞书群（验证全链路）' })
  async sendTest() {
    try {
      return { success: true, message: await this.notificationService.sendTest() };
    } catch (e: any) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }
}
