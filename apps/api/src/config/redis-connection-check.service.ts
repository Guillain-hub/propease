import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { notificationsQueue } from '../notifications/notifications.constants.js';

const connectionTimeoutMs = 5_000;

@Injectable()
export class RedisConnectionCheck {
  private readonly logger = new Logger(RedisConnectionCheck.name);
  private readonly redisEndpoint: string;

  constructor(
    @InjectQueue(notificationsQueue) private readonly queue: Queue,
    config: ConfigService,
  ) {
    const redisUrl = new URL(config.getOrThrow<string>('REDIS_URL'));
    this.redisEndpoint = `${redisUrl.hostname}:${redisUrl.port || 6379}`;
  }

  async check(): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([
        this.queue.waitUntilReady(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Redis connection timed out')),
            connectionTimeoutMs,
          );
        }),
      ]);
      this.logger.log(`Connected to Redis at ${this.redisEndpoint}`);
    } catch (error) {
      throw new Error(
        `Unable to connect to Redis at ${this.redisEndpoint} within ${connectionTimeoutMs / 1000} seconds. ` +
          'Check that Redis is running and that REDIS_URL is configured correctly.',
        { cause: error },
      );
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
}
