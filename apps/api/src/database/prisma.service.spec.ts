import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from './prisma.service.js';

describe('PrismaService connection initialization', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries when the Supabase session pooler is temporarily full', async () => {
    const config = {
      getOrThrow: () =>
        'postgresql://user:password@localhost:5432/propease?schema=public',
    } as ConfigService;
    const prisma = new PrismaService(config);
    const connect = vi
      .spyOn(prisma, '$connect')
      .mockRejectedValueOnce(
        new Error('FATAL: (EMAXCONNSESSION) max clients reached in session mode'),
      )
      .mockResolvedValueOnce(undefined);
    vi.useFakeTimers();

    const initialization = prisma.onModuleInit();
    await vi.advanceTimersByTimeAsync(1000);
    await expect(initialization).resolves.toBeUndefined();
    expect(connect).toHaveBeenCalledTimes(2);
  });
});
