import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { RedisConnectionCheck } from './config/redis-connection-check.service.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  try {
    await app.get(RedisConnectionCheck).check();
  } catch (error) {
    await app.close();
    throw error;
  }
  const config = app.get(ConfigService);
  const origins = config
    .getOrThrow<string>('APP_ORIGINS')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: origins, credentials: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
  await app.listen(config.getOrThrow<number>('PORT'), '0.0.0.0');
}
await bootstrap();
