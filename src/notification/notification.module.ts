import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationConfig } from './entities/notification-config.entity';
import { NotificationService } from './notification.service';
import { NotificationConfigController } from './notification-config.controller';
import { MacroModule } from '../macro/macro.module';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationConfig]), MacroModule],
  controllers: [NotificationConfigController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
