import {
  DepositTransactionType,
  MembershipRole,
  PaymentMethod,
  Prisma,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { LandlordService } from './landlord.service.js';

const futureDate = new Date(Date.now() + 86400000);

function makeTransaction() {
  return {
    tenant: { findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1' }) },
    rentCharge: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'charge-1',
          balance: new Prisma.Decimal('100.00'),
          dueDate: futureDate,
        },
      ]),
      update: vi.fn().mockResolvedValue({}),
    },
    payment: {
      create: vi.fn().mockResolvedValue({ id: 'payment-1' }),
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({ id: 'payment-1' }),
    },
    paymentAllocation: { create: vi.fn().mockResolvedValue({}) },
    deposit: { findFirst: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    depositTransaction: { create: vi.fn().mockResolvedValue({ id: 'deposit-transaction-1' }) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
}

function serviceFor(transaction: ReturnType<typeof makeTransaction>) {
  const prisma = {
    $transaction: vi.fn(
      async (callback: (value: never) => Promise<unknown>) =>
        callback(transaction as never),
    ),
  };
  return {
    landlord: new LandlordService(prisma as unknown as PrismaService),
    prisma,
  };
}

describe('LandlordService payment ledger', () => {
  let tx: ReturnType<typeof makeTransaction>;

  beforeEach(() => {
    tx = makeTransaction();
  });

  it('rejects allocations greater than the recorded payment', async () => {
    const { landlord, prisma } = serviceFor(tx);
    await expect(
      landlord.createPayment(
        'organisation-1',
        'user-1',
        MembershipRole.OWNER,
        {
          tenantId: 'tenant-1',
          amount: '50.00',
          method: PaymentMethod.CASH,
          receivedAt: new Date().toISOString(),
          allocations: [{ rentChargeId: 'charge-1', amount: '51.00' }],
        },
      ),
    ).rejects.toThrow('Payment allocations cannot exceed the payment amount');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('scopes rent charges to the organisation tenant and applies partial allocations', async () => {
    const { landlord } = serviceFor(tx);
    await landlord.createPayment(
      'organisation-1',
      'user-1',
      MembershipRole.OWNER,
      {
        tenantId: 'tenant-1',
        amount: '60.00',
        method: PaymentMethod.MOBILE_MONEY,
        receivedAt: new Date().toISOString(),
        allocations: [{ rentChargeId: 'charge-1', amount: '60.00' }],
      },
    );

    expect(tx.rentCharge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenancy: expect.objectContaining({
            tenantId: 'tenant-1',
            unit: { property: { organisationId: 'organisation-1' } },
          }),
        }),
      }),
    );
    expect(tx.rentCharge.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          balance: new Prisma.Decimal('40.00'),
          status: 'PARTIALLY_PAID',
        }),
      }),
    );
  });

  it('refuses to record a payment against another tenant’s charge', async () => {
    tx.rentCharge.findMany.mockResolvedValue([]);
    const { landlord } = serviceFor(tx);
    await expect(
      landlord.createPayment(
        'organisation-1',
        'user-1',
        MembershipRole.OWNER,
        {
          tenantId: 'tenant-1',
          amount: '25.00',
          method: PaymentMethod.CASH,
          receivedAt: new Date().toISOString(),
          allocations: [{ rentChargeId: 'other-tenant-charge', amount: '25.00' }],
        },
      ),
    ).rejects.toThrow('One or more rent charges do not belong to this tenant');
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('reverses an allocated payment and restores the rent charge balance', async () => {
    tx.payment.findFirst.mockResolvedValue({
      id: 'payment-1',
      reversedAt: null,
      allocations: [
        {
          rentChargeId: 'charge-1',
          allocatedAmount: new Prisma.Decimal('60.00'),
          rentCharge: {
            balance: new Prisma.Decimal('40.00'),
            status: 'PARTIALLY_PAID',
            amount: new Prisma.Decimal('100.00'),
            dueDate: futureDate,
          },
        },
      ],
    });
    const { landlord } = serviceFor(tx);

    await landlord.reversePayment(
      'organisation-1',
      'user-1',
      MembershipRole.OWNER,
      'payment-1',
      { reason: 'Duplicate entry' },
    );

    expect(tx.rentCharge.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'charge-1' },
        data: expect.objectContaining({
          balance: new Prisma.Decimal('100.00'),
          status: 'PENDING',
        }),
      }),
    );
    expect(tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'payment-1' },
        data: expect.objectContaining({
          reversedBy: 'user-1',
          reversalReason: 'Duplicate entry',
        }),
      }),
    );
  });

  it('records a deposit receipt in the deposit ledger without changing rent', async () => {
    tx.deposit.findFirst.mockResolvedValue({
      id: 'deposit-1',
      requiredAmount: new Prisma.Decimal('500.00'),
      receivedAmount: new Prisma.Decimal('0.00'),
      heldBalance: new Prisma.Decimal('0.00'),
    });
    const { landlord } = serviceFor(tx);

    await landlord.addDepositTransaction(
      'organisation-1',
      'user-1',
      MembershipRole.OWNER,
      'deposit-1',
      {
        type: DepositTransactionType.RECEIPT,
        amount: '100.00',
        date: new Date().toISOString(),
        reason: 'Move-in deposit',
      },
    );

    expect(tx.deposit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'deposit-1' },
        data: expect.objectContaining({
          receivedAmount: new Prisma.Decimal('100.00'),
          heldBalance: new Prisma.Decimal('100.00'),
        }),
      }),
    );
    expect(tx.depositTransaction.create).toHaveBeenCalled();
    expect(tx.rentCharge.update).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
  });
});
