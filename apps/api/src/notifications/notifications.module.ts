import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module.js';
import { RedisConnectionCheck } from '../config/redis-connection-check.service.js';
import { notificationsQueue } from './notifications.constants.js';
import { NotificationProcessor } from './notification.processor.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: notificationsQueue }),
    EmailModule,
  ],
  providers: [NotificationProcessor, NotificationsService, RedisConnectionCheck],
  exports: [NotificationsService, RedisConnectionCheck],
})
export class NotificationsModule {}
