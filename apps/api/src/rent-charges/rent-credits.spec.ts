import { Prisma, RentChargeStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { applyUnallocatedPaymentCredits } from './rent-credits.js';

describe('applyUnallocatedPaymentCredits', () => {
  it('applies unused payment balances oldest-first and settles the charge', async () => {
    const transaction = {
      rentCharge: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          balance: new Prisma.Decimal('80'),
          dueDate: new Date('2027-01-01T00:00:00.000Z'),
          status: RentChargeStatus.PENDING,
          tenancy: { id: 'tenancy-1', tenantId: 'tenant-1' },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      payment: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'payment-1',
            amount: new Prisma.Decimal('100'),
            allocations: [{ allocatedAmount: new Prisma.Decimal('70') }],
          },
          {
            id: 'payment-2',
            amount: new Prisma.Decimal('50'),
            allocations: [],
          },
        ]),
      },
      paymentAllocation: { create: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      notification: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };

    const applied = await applyUnallocatedPaymentCredits(
      transaction as unknown as Prisma.TransactionClient,
      'charge-1',
      'organisation-1',
      'user-1',
    );

    expect(applied).toEqual(new Prisma.Decimal('80'));
    expect(transaction.paymentAllocation.create).toHaveBeenNthCalledWith(1, {
      data: {
        paymentId: 'payment-1',
        rentChargeId: 'charge-1',
        allocatedAmount: new Prisma.Decimal('30'),
      },
    });
    expect(transaction.paymentAllocation.create).toHaveBeenNthCalledWith(2, {
      data: {
        paymentId: 'payment-2',
        rentChargeId: 'charge-1',
        allocatedAmount: new Prisma.Decimal('50'),
      },
    });
    expect(transaction.rentCharge.update).toHaveBeenCalledWith({
      where: { id: 'charge-1' },
      data: { balance: new Prisma.Decimal('0'), status: RentChargeStatus.PAID },
    });
    expect(transaction.notification.updateMany).toHaveBeenCalledWith({
      where: {
        deduplicationKey: { startsWith: 'rent-reminder:charge-1:' },
        status: 'QUEUED',
      },
      data: { status: 'CANCELLED' },
    });
  });

  it('does not apply credit to void or already-settled charges', async () => {
    const transaction = {
      rentCharge: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          balance: new Prisma.Decimal('0'),
          dueDate: new Date('2027-01-01T00:00:00.000Z'),
          status: RentChargeStatus.VOID,
          tenancy: { id: 'tenancy-1', tenantId: 'tenant-1' },
        }),
      },
      payment: { findMany: vi.fn() },
    };

    const applied = await applyUnallocatedPaymentCredits(
      transaction as unknown as Prisma.TransactionClient,
      'charge-1',
      'organisation-1',
    );

    expect(applied).toEqual(new Prisma.Decimal('0'));
    expect(transaction.payment.findMany).not.toHaveBeenCalled();
  });
});
