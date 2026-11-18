import { LeaseStatus, TenancyStatus, UnitStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import { PrismaService } from '../database/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  RentChargesProcessor,
  getRentChargePeriod,
  getRentDueDate,
} from './rent-charges.processor.js';

describe('rent charge date helpers', () => {
  it('formats the rent period in UTC', () => {
    expect(getRentChargePeriod(new Date('2026-01-31T23:30:00.000Z'))).toBe(
      '2026-01',
    );
    expect(getRentChargePeriod(new Date('2026-02-01T00:30:00.000Z'))).toBe(
      '2026-02',
    );
  });

  it('clamps a due day to the last day of the month', () => {
    expect(getRentDueDate(new Date('2026-02-01T00:00:00.000Z'), 31)).toEqual(
      new Date('2026-02-28T00:00:00.000Z'),
    );
  });

  it('keeps valid due days within the rent month', () => {
    expect(getRentDueDate(new Date('2024-02-01T00:00:00.000Z'), 29)).toEqual(
      new Date('2024-02-29T00:00:00.000Z'),
    );
  });

  it('activates an accepted lease and tenancy when their effective dates arrive', async () => {
    const now = new Date();
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const transaction = {
      lease: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      tenancy: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      unit: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    const prisma = {
      lease: {
        findMany: vi.fn().mockResolvedValue([{
          id: 'lease-1',
          tenancy: {
            id: 'tenancy-1',
            unitId: 'unit-1',
            moveInDate: today,
            property: { organisationId: 'organisation-1' },
          },
        }]),
      },
      tenancy: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
      rentCharge: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const processor = new RentChargesProcessor(
      prisma as unknown as PrismaService,
      { enqueueEmail: vi.fn() } as unknown as NotificationsService,
    );

    await processor.process({ name: 'daily-rent-follow-up' } as Job);

    expect(prisma.lease.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: LeaseStatus.TENANT_ACCEPTED }),
      }),
    );
    expect(transaction.lease.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: LeaseStatus.ACTIVE },
      }),
    );
    expect(transaction.tenancy.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: TenancyStatus.ACTIVE },
      }),
    );
    expect(transaction.unit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: UnitStatus.OCCUPIED },
      }),
    );
  });
});
