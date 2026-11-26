import { createHash } from 'node:crypto';
import { LeaseStatus, MembershipRole, TenancyStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { LeaseTerminationService } from './lease-termination.service.js';

function createService(
  prisma: Record<string, unknown>,
  transaction: Record<string, unknown>,
) {
  const email = { send: vi.fn().mockResolvedValue(undefined) };
  const config = {
    getOrThrow: vi.fn().mockReturnValue('https://app.example.test/'),
  };
  const database = {
    $transaction: vi.fn((callback: (tx: never) => Promise<unknown>) =>
      callback(transaction as never),
    ),
    ...prisma,
  };
  return {
    service: new LeaseTerminationService(
      database as unknown as PrismaService,
      email as unknown as EmailService,
      config as unknown as ConfigService,
    ),
    database,
    email,
  };
}

describe('LeaseTerminationService', () => {
  it('emails the tenant a secure confirmation link and stores only the token hash', async () => {
    const lease = {
      id: 'lease-1',
      status: LeaseStatus.ACTIVE,
      tenancy: {
        tenant: { legalName: 'Alex Tenant', email: 'alex@example.test' },
        property: { name: 'Main Property' },
        unit: { unitNumber: '4' },
      },
    };
    const transaction = {
      leaseTerminationRequest: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'termination-1', expiresAt: data.expiresAt }),
        ),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const { service, email } = createService(
      { lease: { findFirst: vi.fn().mockResolvedValue(lease) } },
      transaction,
    );

    await expect(
      service.request('organisation-1', 'manager-1', MembershipRole.MANAGER, 'lease-1', {
        reason: 'The property is needed for renovation.',
      }),
    ).resolves.toMatchObject({
      request: { id: 'termination-1', status: 'PENDING', expiresAt: expect.any(Date) },
    });

    const tokenHash = transaction.leaseTerminationRequest.create.mock.calls[0][0].data.tokenHash;
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(email.send).toHaveBeenCalledWith(
      'alex@example.test',
      'Please confirm your lease termination',
      expect.stringContaining('/lease-termination-review?token='),
    );
    expect(email.send.mock.calls[0][2]).not.toContain(tokenHash);
  });

  it('ends the lease and tenancy only after the tenant accepts', async () => {
    const token = 'tenant-secret';
    const transaction = {
      leaseTerminationRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'termination-1',
          leaseId: 'lease-1',
          requestedByUserId: 'manager-1',
          reason: 'The property is needed for renovation.',
          expiresAt: new Date(Date.now() + 60_000),
          respondedAt: null,
          lease: {
            id: 'lease-1',
            status: LeaseStatus.ACTIVE,
            tenancyId: 'tenancy-1',
            tenancy: { property: { organisationId: 'organisation-1' } },
          },
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      lease: { update: vi.fn().mockResolvedValue({}) },
      tenancy: { update: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const { service } = createService({}, transaction);

    await expect(service.respond(token, { accepted: true })).resolves.toMatchObject({
      status: 'ACCEPTED',
      respondedAt: expect.any(Date),
    });
    expect(transaction.leaseTerminationRequest.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tokenHash: createHash('sha256').update(token, 'utf8').digest('hex'),
        },
      }),
    );
    expect(transaction.lease.update).toHaveBeenCalledWith({
      where: { id: 'lease-1' },
      data: expect.objectContaining({
        status: LeaseStatus.TERMINATED,
        terminationReason: 'The property is needed for renovation.',
      }),
    });
    expect(transaction.tenancy.update).toHaveBeenCalledWith({
      where: { id: 'tenancy-1' },
      data: expect.objectContaining({ status: TenancyStatus.ENDED }),
    });
  });

  it('leaves the lease active when the tenant declines', async () => {
    const transaction = {
      leaseTerminationRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'termination-1',
          leaseId: 'lease-1',
          requestedByUserId: 'manager-1',
          expiresAt: new Date(Date.now() + 60_000),
          respondedAt: null,
          lease: {
            id: 'lease-1',
            status: LeaseStatus.ACTIVE,
            tenancyId: 'tenancy-1',
            tenancy: { property: { organisationId: 'organisation-1' } },
          },
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      lease: { update: vi.fn() },
      tenancy: { update: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const { service } = createService({}, transaction);

    await expect(service.respond('tenant-secret', { accepted: false })).resolves.toMatchObject({
      status: 'DECLINED',
      respondedAt: expect.any(Date),
    });
    expect(transaction.lease.update).not.toHaveBeenCalled();
    expect(transaction.tenancy.update).not.toHaveBeenCalled();
  });
});
