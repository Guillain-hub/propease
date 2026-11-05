import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { validateEnvironment } from './config/validate-environment.js';
import { PrismaModule } from './database/prisma.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './auth/auth.module.js';
import { OrganisationsModule } from './organisations/organisations.module.js';
import { PropertiesModule } from './properties/properties.module.js';
import { FilesModule } from './files/files.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { RentChargesModule } from './rent-charges/rent-charges.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = new URL(config.getOrThrow<string>('REDIS_URL'));
        const database = redisUrl.pathname.slice(1);
        const db = database ? Number(database) : 0;
        if (!Number.isInteger(db) || db < 0) {
          throw new Error('REDIS_URL must contain a valid database number');
        }
        return {
          connection: {
            host: redisUrl.hostname,
            port: Number(redisUrl.port || 6379),
            username: redisUrl.username
              ? decodeURIComponent(redisUrl.username)
              : undefined,
            password: redisUrl.password
              ? decodeURIComponent(redisUrl.password)
              : undefined,
            db,
            ...(redisUrl.protocol === 'rediss:' ? { tls: {} } : {}),
          },
          defaultJobOptions: {
            attempts: 5,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: 1000,
            removeOnFail: 5000,
          },
        };
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    HealthModule,
    AuthModule,
    OrganisationsModule,
    PropertiesModule,
    FilesModule,
    NotificationsModule,
    DocumentsModule,
    RentChargesModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
