import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { notificationsQueue } from './notifications.constants.js';
import { NotificationProcessor } from './notification.processor.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  imports: [BullModule.registerQueue({ name: notificationsQueue })],
  providers: [NotificationProcessor, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
