import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { rentChargesQueue } from './rent-charges.constants.js';
import { RentChargeScheduler } from './rent-charge-scheduler.service.js';
import { RentChargesProcessor } from './rent-charges.processor.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: rentChargesQueue }),
    NotificationsModule,
  ],
  providers: [RentChargeScheduler, RentChargesProcessor],
})
export class RentChargesModule {}
