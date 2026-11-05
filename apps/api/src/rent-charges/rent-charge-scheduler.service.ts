import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { rentChargesQueue } from './rent-charges.constants.js';

@Injectable()
export class RentChargeScheduler implements OnModuleInit {
  constructor(@InjectQueue(rentChargesQueue) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      'monthly-rent-charges',
      { pattern: '0 0 1 * *' },
      { name: 'generate-monthly-rent-charges', data: {} },
    );
    await this.queue.upsertJobScheduler(
      'daily-rent-follow-up',
      { pattern: '0 7 * * *' },
      { name: 'daily-rent-follow-up', data: {} },
    );
  }
}
