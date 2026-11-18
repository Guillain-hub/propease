import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { assertWholeFrancsIfRwf } from './financial-amount.js';

function transactionWithCurrency(currency: string) {
  const findUnique = vi.fn().mockResolvedValue({ currency });
  return {
    transaction: {
      organisation: { findUnique },
    } as unknown as Pick<Prisma.TransactionClient, 'organisation'>,
    findUnique,
  };
}

describe('assertWholeFrancsIfRwf', () => {
  it('rejects fractional values for RWF organisations', async () => {
    const { transaction, findUnique } = transactionWithCurrency('RWF');

    await expect(
      assertWholeFrancsIfRwf(transaction, 'organisation-1', ['10.50']),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findUnique).toHaveBeenCalledOnce();
  });

  it('allows whole RWF values and fractional values in other currencies', async () => {
    const { transaction: rwfTransaction, findUnique: rwfLookup } =
      transactionWithCurrency('RWF');
    await expect(
      assertWholeFrancsIfRwf(rwfTransaction, 'organisation-1', ['10', '0']),
    ).resolves.toBeUndefined();
    expect(rwfLookup).not.toHaveBeenCalled();

    const { transaction: usdTransaction } = transactionWithCurrency('USD');
    await expect(
      assertWholeFrancsIfRwf(usdTransaction, 'organisation-1', ['10.50']),
    ).resolves.toBeUndefined();
  });
});
