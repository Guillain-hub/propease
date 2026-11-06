import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

function transientConnectionErrorCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  if (
    'errorCode' in error &&
    typeof error.errorCode === 'string' &&
    ['P1001', 'P1002', 'P1017'].includes(error.errorCode)
  ) {
    return error.errorCode;
  }
  if (/EMAXCONNSESSION|max clients reached in session mode/i.test(error.message)) {
    return 'EMAXCONNSESSION';
  }
  return undefined;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    const databaseUrl = new URL(config.getOrThrow<string>('DATABASE_URL'));
    databaseUrl.searchParams.set('connection_limit', '1');
    super({ datasources: { db: { url: databaseUrl.toString() } } });
  }

  async onModuleInit(): Promise<void> {
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.$connect();
        return;
      } catch (error) {
        const errorCode = transientConnectionErrorCode(error);
        if (!errorCode || attempt === maxAttempts) {
          throw error;
        }

        const delayMs = 1000 * 2 ** (attempt - 1);
        this.logger.warn(
          `Database connection failed (${errorCode}); retrying in ${delayMs}ms (attempt ${attempt}/${maxAttempts}).`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
