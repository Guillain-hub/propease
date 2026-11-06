import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

function isTransientConnectionError(
  error: unknown,
): error is Error & { errorCode: string } {
  if (!(error instanceof Error) || !('errorCode' in error)) return false;
  const errorCode = error.errorCode;
  return (
    typeof errorCode === 'string' &&
    ['P1001', 'P1002', 'P1017'].includes(errorCode)
  );
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.$connect();
        return;
      } catch (error) {
        if (!isTransientConnectionError(error) || attempt === maxAttempts) {
          throw error;
        }

        const delayMs = 1000 * 2 ** (attempt - 1);
        this.logger.warn(
          `Database connection failed (${error.errorCode}); retrying in ${delayMs}ms (attempt ${attempt}/${maxAttempts}).`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
