import {
  DepositTransactionType,
  MembershipRole,
  PaymentMethod,
  Prisma,
  PropertyType,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service.js';
import { EmailService } from '../email/email.service.js';
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
    landlord: new LandlordService(
      prisma as unknown as PrismaService,
      {} as unknown as EmailService,
      {
        get: () => undefined,
        getOrThrow: () => 'http://localhost:3000',
      } as ConfigService,
    ),
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

describe('LandlordService team invitations', () => {
  it('emails a single-use registration link to a new collaborator', async () => {
    const transaction = {
      organisationInvitation: {
        upsert: vi.fn().mockResolvedValue({ id: 'invitation-1' }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ name: 'Landlord' }),
      },
      organisation: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ name: 'North Homes' }),
      },
      $transaction: vi.fn(
        async (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const send = vi.fn().mockResolvedValue(undefined);
    const service = new LandlordService(
      prisma as unknown as PrismaService,
      { send } as unknown as EmailService,
      {
        get: (key: string) =>
          key === 'WEB_APP_URL' ? 'https://app.example.com' : undefined,
        getOrThrow: () => 'https://app.example.com',
      } as ConfigService,
    );

    await service.inviteTeamMember(
      'organisation-1',
      'user-1',
      MembershipRole.OWNER,
      {
        email: ' New.Manager@example.com ',
        role: MembershipRole.ACCOUNTANT,
      },
    );

    expect(transaction.organisationInvitation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          email: 'new.manager@example.com',
          role: MembershipRole.ACCOUNTANT,
          tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          expiresAt: expect.any(Date),
        }),
      }),
    );
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toBe('new.manager@example.com');
    expect(send.mock.calls[0][2]).toContain(
      'https://app.example.com/register?invitation=',
    );
    expect(send.mock.calls[0][2]).not.toContain(
      transaction.organisationInvitation.upsert.mock.calls[0][0].create
        .tokenHash,
    );
  });

  it('suspends a team member and removes their property assignments', async () => {
    const member = {
      role: MembershipRole.MANAGER,
      userId: 'member-1',
    };
    const transaction = {
      organisationMember: {
        findUnique: vi.fn().mockResolvedValue(member),
        update: vi.fn().mockResolvedValue({ ...member, status: 'SUSPENDED' }),
      },
      propertyAssignment: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      organisationInvitation: { findFirst: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: vi.fn(
        async (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const service = new LandlordService(
      prisma as unknown as PrismaService,
      {} as unknown as EmailService,
      {} as ConfigService,
    );

    await service.removeTeamMember(
      'organisation-1',
      'admin-1',
      MembershipRole.ADMIN,
      'member-1',
    );

    expect(transaction.organisationMember.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'SUSPENDED' },
      }),
    );
    expect(transaction.propertyAssignment.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'member-1',
        property: { organisationId: 'organisation-1' },
      },
    });
  });

  it('does not allow administrators to remove another administrator', async () => {
    const transaction = {
      organisationMember: {
        findUnique: vi.fn().mockResolvedValue({ role: MembershipRole.ADMIN }),
      },
      organisationInvitation: { findFirst: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(
        async (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const service = new LandlordService(
      prisma as unknown as PrismaService,
      {} as unknown as EmailService,
      {} as ConfigService,
    );

    await expect(
      service.removeTeamMember(
        'organisation-1',
        'admin-1',
        MembershipRole.ADMIN,
        'admin-2',
      ),
    ).rejects.toThrow('Your role cannot remove this team member');
  });
});

describe('LandlordService property photos', () => {
  it('links only an uploaded image from the same organisation to a property', async () => {
    const transaction = {
      storedFile: {
        findFirst: vi.fn().mockResolvedValue({ id: 'photo-1' }),
      },
      property: {
        create: vi.fn().mockResolvedValue({ id: 'property-1' }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: vi.fn(
        async (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const service = new LandlordService(
      prisma as unknown as PrismaService,
      {} as unknown as EmailService,
      {} as ConfigService,
    );

    await service.createProperty(
      'organisation-1',
      'owner-1',
      MembershipRole.OWNER,
      {
        name: 'Apartment building',
        type: PropertyType.APARTMENT_BUILDING,
        address: '123 Main Street',
        photoFileId: 'photo-1',
      },
    );

    expect(transaction.storedFile.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'photo-1',
        organisationId: 'organisation-1',
        uploadStatus: 'UPLOADED',
        mimeType: { startsWith: 'image/' },
      },
      select: { id: true },
    });
    expect(transaction.property.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ photoFileId: 'photo-1' }),
    });
  });

  it('rejects a photo that is not an uploaded image', async () => {
    const transaction = {
      storedFile: { findFirst: vi.fn().mockResolvedValue(null) },
      property: { create: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(
        async (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const service = new LandlordService(
      prisma as unknown as PrismaService,
      {} as unknown as EmailService,
      {} as ConfigService,
    );

    await expect(
      service.createProperty(
        'organisation-1',
        'owner-1',
        MembershipRole.OWNER,
        {
          name: 'Apartment building',
          type: PropertyType.APARTMENT_BUILDING,
          address: '123 Main Street',
          photoFileId: 'photo-1',
        },
      ),
    ).rejects.toThrow('Select a successfully uploaded image');
    expect(transaction.property.create).not.toHaveBeenCalled();
  });
});

describe('LandlordService tenancy status synchronization', () => {
  it('ends a tenancy and frees its unit when the tenant moves out early', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const transaction = {
      tenancy: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: 'tenancy-1',
            unitId: 'unit-1',
            moveInDate: new Date(`${today}T00:00:00.000Z`),
            moveOutDate: new Date(Date.now() + 10 * 86400000),
            status: 'ACTIVE',
          })
          .mockResolvedValueOnce(null),
        update: vi.fn().mockResolvedValue({ id: 'tenancy-1', status: 'ENDED' }),
      },
      lease: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      unit: { update: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: vi.fn(
        async (callback: (value: never) => Promise<unknown>) =>
          callback(transaction as never),
      ),
    };
    const landlord = new LandlordService(
      prisma as unknown as PrismaService,
      {} as unknown as EmailService,
      {} as ConfigService,
    );

    await landlord.moveOut(
      'organisation-1',
      'user-1',
      MembershipRole.OWNER,
      'tenancy-1',
      { moveOutDate: today },
    );

    expect(transaction.tenancy.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { moveOutDate: expect.any(Date), status: 'ENDED' } }),
    );
    expect(transaction.unit.update).toHaveBeenCalledWith({
      where: { id: 'unit-1' },
      data: { status: 'AVAILABLE' },
    });
  });

  describe('LandlordService record archiving', () => {
    it('lets only administrators archive a tenant', async () => {
      const prisma = { $transaction: vi.fn() };
      const landlord = new LandlordService(
        prisma as unknown as PrismaService,
        {} as unknown as EmailService,
        {} as ConfigService,
      );

      await expect(
        landlord.archiveTenant(
          'organisation-1',
          'owner-1',
          MembershipRole.OWNER,
          'tenant-1',
        ),
      ).rejects.toThrow('Only administrators can archive tenants');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('archives tenants without deleting their linked history', async () => {
      const syncTransaction = {
        tenancy: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
        lease: { updateMany: vi.fn() },
        unit: { updateMany: vi.fn() },
      };
      const archiveTransaction = {
        tenant: {
          findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1' }),
          update: vi.fn().mockResolvedValue({ id: 'tenant-1', archivedAt: new Date() }),
        },
        tenancy: { findFirst: vi.fn().mockResolvedValue(null) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      const prisma = {
        $transaction: vi
          .fn()
          .mockImplementationOnce((callback: (tx: typeof syncTransaction) => Promise<unknown>) =>
            callback(syncTransaction),
          )
          .mockImplementationOnce((callback: (tx: typeof archiveTransaction) => Promise<unknown>) =>
            callback(archiveTransaction),
          ),
      };
      const landlord = new LandlordService(
        prisma as unknown as PrismaService,
        {} as unknown as EmailService,
        {} as ConfigService,
      );

      await landlord.archiveTenant(
        'organisation-1',
        'admin-1',
        MembershipRole.ADMIN,
        'tenant-1',
      );

      expect(archiveTransaction.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tenant-1' },
          data: { archivedAt: expect.any(Date) },
        }),
      );
      expect(archiveTransaction.auditLog.create).toHaveBeenCalled();
    });

    it('archives an available unit while retaining its tenancy history', async () => {
      const syncTransaction = {
        tenancy: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
        lease: { updateMany: vi.fn() },
        unit: { updateMany: vi.fn() },
      };
      const archiveTransaction = {
        unit: {
          findFirst: vi.fn().mockResolvedValue({ id: 'unit-1', status: 'AVAILABLE' }),
          update: vi.fn().mockResolvedValue({ id: 'unit-1', status: 'ARCHIVED' }),
        },
        tenancy: { findFirst: vi.fn().mockResolvedValue(null) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      const prisma = {
        $transaction: vi
          .fn()
          .mockImplementationOnce((callback: (tx: typeof syncTransaction) => Promise<unknown>) =>
            callback(syncTransaction),
          )
          .mockImplementationOnce((callback: (tx: typeof archiveTransaction) => Promise<unknown>) =>
            callback(archiveTransaction),
          ),
      };
      const landlord = new LandlordService(
        prisma as unknown as PrismaService,
        {} as unknown as EmailService,
        {} as ConfigService,
      );

      await landlord.archiveUnit(
        'organisation-1',
        'admin-1',
        MembershipRole.ADMIN,
        'unit-1',
      );

      expect(archiveTransaction.unit.update).toHaveBeenCalledWith({
        where: { id: 'unit-1' },
        data: { status: 'ARCHIVED' },
      });
      expect(archiveTransaction.auditLog.create).toHaveBeenCalled();
    });
  });

  it('activates an upcoming tenancy once its move-in date arrives', async () => {
    const transaction = {
      tenancy: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ id: 'tenancy-1', unitId: 'unit-1' }])
          .mockResolvedValueOnce([{ unitId: 'unit-1' }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst: vi.fn().mockResolvedValue({ id: 'tenancy-1' }),
      },
      lease: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      unit: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      $transaction: vi.fn(
        async (callback: (value: never) => Promise<unknown>) =>
          callback(transaction as never),
      ),
      tenancy: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const landlord = new LandlordService(
      prisma as unknown as PrismaService,
      {} as unknown as EmailService,
      {} as ConfigService,
    );

    await Promise.all([
      landlord.listTenancies('organisation-1'),
      landlord.listTenancies('organisation-1'),
    ]);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.tenancy.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ACTIVE' } }),
    );
    expect(transaction.unit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'OCCUPIED' } }),
    );
  });
});
