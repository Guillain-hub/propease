import {
  DepositStatus,
  LeaseStatus,
  MembershipRole,
  Prisma,
  TenantLeaseReviewAction,
  TenancyStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { PdfService } from '../documents/pdf.service.js';
import {
  CreateTenantLeaseOnboardingInput,
  LeaseAgreementFieldsInput,
} from './dto/tenant-lease-onboarding.dto.js';
import { TenantLeaseOnboardingService } from './tenant-lease-onboarding.service.js';

function serviceWith(
  transaction: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) {
  const prisma = {
    $transaction: vi.fn(async (callback: (tx: never) => Promise<unknown>) =>
      callback(transaction as never),
    ),
    ...overrides,
  };
  const email = { send: vi.fn().mockResolvedValue(undefined) };
  const config = {
    get: (key: string) =>
      key === 'WEB_APP_URL' ? 'https://app.example.test' : undefined,
    getOrThrow: () => 'https://app.example.test',
  };
  const pdf = { renderDocument: vi.fn().mockResolvedValue(Buffer.from('pdf')) };
  return {
    service: new TenantLeaseOnboardingService(
      prisma as unknown as PrismaService,
      email as unknown as EmailService,
      config as unknown as ConfigService,
      pdf as unknown as PdfService,
    ),
    prisma,
    email,
    pdf,
  };
}

function completeAgreementFields(): LeaseAgreementFieldsInput {
  return {
    landlordName: 'Alex Landlord',
    landlordId: 'ID-100',
    landlordIdPlace: 'Kigali',
    landlordTel: '+250700000000',
    tenantId: 'ID-200',
    tenantIdPlace: 'Kigali',
    currency: 'RWF',
    renewalNoticeDays: 30,
    holdoverNoticeDays: 30,
    paymentMethod: 'CASH',
    advancePaid: false,
    lateFeeEnabled: false,
    depositPaid: false,
    depositPaidDate: '2027-01-01',
    depositReturnDays: 30,
    utilities: {
      water: 'TENANT',
      garbage: 'TENANT',
      electricity: 'TENANT',
      security: 'TENANT',
      internet: 'TENANT',
      serviceCharges: 'TENANT',
    },
    inspectionNoticeHours: 48,
    subletAllowed: false,
    tenantExitNoticeDays: 30,
    breachFixDays: 14,
    rentFixedMonths: 12,
    increaseNoticeDays: 60,
    witnessRequired: false,
  };
}

describe('TenantLeaseOnboardingService', () => {
  it('renders the latest generated agreement for a manager to view', async () => {
    const snapshot = {
      version: 2,
      agreement: {
        tenant: { legalName: 'Alex Tenant', phone: '+250711111111' },
        property: { name: 'Main Property', address: '1 Main Street' },
        rentalSpace: { label: 'Unit 4' },
        lease: {
          startDate: '2027-01-01',
          endDate: '2027-12-31',
          rentAmount: '1200',
          depositAmount: '1200',
          dueDay: 1,
          agreement: completeAgreementFields(),
        },
      },
    };
    const findFirst = vi.fn().mockResolvedValue({ snapshots: [snapshot] });
    const { service, pdf } = serviceWith({}, {
      tenantLeaseOnboarding: { findFirst },
    });

    await expect(
      service.getManagerAgreementDocument(
        'organisation-1',
        'manager-1',
        MembershipRole.OWNER,
        'lease-1',
      ),
    ).resolves.toEqual(Buffer.from('pdf'));

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          leaseId: 'lease-1',
          lease: {
            tenancy: {
              property: { organisationId: 'organisation-1' },
            },
          },
        }),
        include: {
          snapshots: { orderBy: { version: 'desc' }, take: 1 },
        },
      }),
    );
    expect(pdf.renderDocument).toHaveBeenCalledWith(
      'Lease agreement — version 2',
      expect.any(Array),
    );
  });

  it('validates conditional fields and renders a read-only agreement preview', async () => {
    const property = {
      id: 'property-1',
      name: 'Standalone house',
      address: '1 Main Street',
    };
    const propertyModel = {
      findFirst: vi.fn().mockResolvedValue(property),
    };
    const { service, pdf } = serviceWith({}, {
      organisation: {
        findUnique: vi.fn().mockResolvedValue({ currency: 'RWF' }),
      },
      property: propertyModel,
    });
    const input: CreateTenantLeaseOnboardingInput = {
      propertyId: 'property-1',
      moveInDate: '2027-01-01',
      tenant: {
        legalName: 'Alex Tenant',
        email: 'alex@example.test',
        phone: '+250711111111',
      },
      lease: {
        startDate: '2027-01-01',
        endDate: '2027-12-31',
        rentAmount: '1200.00',
        depositAmount: '1200.00',
        dueDay: 1,
        paymentFrequency: 'MONTHLY',
        agreement: completeAgreementFields(),
      },
    };

    await expect(
      service.preview('organisation-1', 'manager-1', MembershipRole.OWNER, {
        ...input,
        lease: {
          ...input.lease,
          agreement: { ...completeAgreementFields(), advancePaid: true },
        },
      }),
    ).rejects.toThrow('Complete all required lease agreement fields');
    expect(propertyModel.findFirst).not.toHaveBeenCalled();

    await expect(
      service.preview('organisation-1', 'manager-1', MembershipRole.OWNER, {
        ...input,
        lease: {
          ...input.lease,
          agreement: {
            ...completeAgreementFields(),
            utilities: {
              water: 'TENANT',
              garbage: 'LANDLORD',
              electricity: 'TENANT',
              security: 'TENANT',
              internet: 'TENANT',
              serviceCharges: 'TENANT',
            },
          },
        },
      }),
    ).rejects.toThrow('Choose Landlord or Tenant once');
    expect(propertyModel.findFirst).not.toHaveBeenCalled();

    await expect(
      service.preview('organisation-1', 'manager-1', MembershipRole.OWNER, input),
    ).resolves.toEqual(Buffer.from('pdf'));
    expect(pdf.renderDocument).toHaveBeenCalledWith(
      'Residential Rental Agreement — Draft Preview',
      expect.arrayContaining([
        expect.objectContaining({ heading: '1. Term of lease' }),
        expect.objectContaining({ heading: 'Legal review notice' }),
      ]),
    );
    expect(propertyModel.findFirst).toHaveBeenCalledTimes(1);
  });

  it('creates a property-level offer without a synthetic unit and stores only a token hash', async () => {
    const tx = {
      property: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'property-1',
          name: 'Standalone house',
          address: '1 Main Street',
        }),
      },
      unit: { findFirst: vi.fn() },
      tenancy: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'tenancy-1',
          moveInDate: new Date('2027-01-01T00:00:00.000Z'),
          moveOutDate: null,
          rentalSpaceLabel: 'Standalone house',
        }),
      },
      tenant: {
        create: vi.fn().mockResolvedValue({
          id: 'tenant-1',
          legalName: 'Alex Tenant',
          email: 'alex@example.test',
          phone: null,
          emergencyContactName: null,
          emergencyContactPhone: null,
        }),
      },
      lease: {
        create: vi.fn().mockResolvedValue({
          id: 'lease-1',
          status: LeaseStatus.PENDING_TENANT_REVIEW,
          startDate: new Date('2027-01-01T00:00:00.000Z'),
          endDate: new Date('2027-12-31T00:00:00.000Z'),
          rentAmount: new Prisma.Decimal('1200.00'),
          dueDay: 1,
          paymentFrequency: 'MONTHLY',
          terms: {},
        }),
      },
      tenantLeaseOnboarding: {
        create: vi.fn().mockResolvedValue({ id: 'onboarding-1' }),
      },
      deposit: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'deposit-1',
          requiredAmount: new Prisma.Decimal('1200.00'),
          receivedAmount: new Prisma.Decimal(0),
          heldBalance: new Prisma.Decimal(0),
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      depositTransaction: { create: vi.fn().mockResolvedValue({}) },
      leaseAgreementSnapshot: { create: vi.fn().mockResolvedValue({}) },
    };
    const { service, email } = serviceWith(tx, {
      organisation: {
        findUnique: vi.fn().mockResolvedValue({ currency: 'RWF' }),
      },
    });

    const result = await service.create(
      'organisation-1',
      'manager-1',
      MembershipRole.OWNER,
      {
        propertyId: 'property-1',
        unitId: null,
        moveInDate: '2027-01-01',
        tenant: {
          legalName: 'Alex Tenant',
          email: 'alex@example.test',
          phone: '+250711111111',
        },
        lease: {
          startDate: '2027-01-01',
          endDate: '2027-12-31',
          rentAmount: '1200.00',
          depositAmount: '1200.00',
          dueDay: 1,
          paymentFrequency: 'MONTHLY',
          agreement: {
            ...completeAgreementFields(),
            depositPaid: true,
          },
        },
      } as CreateTenantLeaseOnboardingInput,
    );

    expect(result).toMatchObject({
      tenantId: 'tenant-1',
      tenancyId: 'tenancy-1',
      leaseId: 'lease-1',
      onboardingId: 'onboarding-1',
      status: LeaseStatus.PENDING_TENANT_REVIEW,
      emailSent: true,
    });
    expect(tx.unit.findFirst).not.toHaveBeenCalled();
    expect(tx.tenancy.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          propertyId: 'property-1',
          unitId: null,
          rentalSpaceLabel: 'Standalone house',
          deposit: {
            create: {
              requiredAmount: '1200.00',
              receivedAmount: new Prisma.Decimal(0),
              heldBalance: new Prisma.Decimal(0),
              status: DepositStatus.NOT_RECEIVED,
            },
          },
        }),
      }),
    );
    expect(tx.deposit.update).toHaveBeenCalledWith({
      where: { tenancyId: 'tenancy-1' },
      data: {
        receivedAmount: new Prisma.Decimal('1200.00'),
        heldBalance: new Prisma.Decimal('1200.00'),
        status: DepositStatus.HELD,
      },
    });
    expect(tx.depositTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        depositId: 'deposit-1',
        type: 'RECEIPT',
        amount: new Prisma.Decimal('1200.00'),
        reason: 'Deposit recorded as paid in the lease agreement',
        recordedBy: 'manager-1',
      }),
    });
    expect(tx.lease.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: LeaseStatus.PENDING_TENANT_REVIEW,
          paymentFrequency: 'MONTHLY',
        }),
      }),
    );
    const savedHash = (
      tx.tenantLeaseOnboarding.create.mock.calls[0][0] as {
        data: { tokenHash: string };
      }
    ).data.tokenHash;
    expect(savedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(email.send).toHaveBeenCalledWith(
      'alex@example.test',
      expect.any(String),
      expect.stringContaining(
        'https://app.example.test/tenant-lease-review?token=',
      ),
    );
    expect(email.send.mock.calls[0][2]).not.toContain(savedHash);
  });

  it('creates a reviewed lease for an existing tenancy without duplicating it', async () => {
    const tenant = {
      id: 'tenant-1',
      legalName: 'Alex Tenant',
      email: 'alex@example.test',
      phone: '+250711111111',
      emergencyContactName: null,
      emergencyContactPhone: null,
    };
    const tenancy = {
      id: 'tenancy-1',
      tenantId: tenant.id,
      moveInDate: new Date('2027-01-01T00:00:00.000Z'),
      moveOutDate: null,
      rentalSpaceLabel: 'Standalone house',
      deposit: { id: 'deposit-1' },
    };
    const tx = {
      property: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'property-1',
          name: 'Standalone house',
          address: '1 Main Street',
        }),
      },
      unit: { findFirst: vi.fn() },
      tenancy: { findFirst: vi.fn().mockResolvedValue(tenancy), create: vi.fn() },
      tenant: { update: vi.fn().mockResolvedValue(tenant), create: vi.fn() },
      lease: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'lease-1',
          status: LeaseStatus.PENDING_TENANT_REVIEW,
          startDate: new Date('2027-01-01T00:00:00.000Z'),
          endDate: new Date('2027-12-31T00:00:00.000Z'),
          rentAmount: new Prisma.Decimal('1200.00'),
          dueDay: 1,
          paymentFrequency: 'MONTHLY',
          terms: {},
        }),
      },
      deposit: { update: vi.fn().mockResolvedValue({}) },
      tenantLeaseOnboarding: {
        create: vi.fn().mockResolvedValue({ id: 'onboarding-1' }),
      },
      leaseAgreementSnapshot: { create: vi.fn().mockResolvedValue({}) },
    };
    const { service, email } = serviceWith(tx, {
      organisation: {
        findUnique: vi.fn().mockResolvedValue({ currency: 'RWF' }),
      },
    });

    const result = await service.create(
      'organisation-1',
      'manager-1',
      MembershipRole.OWNER,
      {
        tenancyId: 'tenancy-1',
        propertyId: 'property-1',
        unitId: null,
        moveInDate: '2027-01-01',
        tenant,
        lease: {
          startDate: '2027-01-01',
          endDate: '2027-12-31',
          rentAmount: '1200.00',
          depositAmount: '1200.00',
          dueDay: 1,
          paymentFrequency: 'MONTHLY',
          agreement: completeAgreementFields(),
        },
      } as CreateTenantLeaseOnboardingInput,
    );

    expect(result).toMatchObject({
      tenancyId: 'tenancy-1',
      leaseId: 'lease-1',
      onboardingId: 'onboarding-1',
      emailSent: true,
    });
    expect(tx.tenancy.create).not.toHaveBeenCalled();
    expect(tx.tenant.create).not.toHaveBeenCalled();
    expect(tx.deposit.update).toHaveBeenCalled();
    expect(tx.lease.create).toHaveBeenCalled();
    expect(email.send).toHaveBeenCalledWith(
      'alex@example.test',
      expect.any(String),
      expect.stringContaining('/tenant-lease-review?token='),
    );
  });

  it('records an acceptance and manager notification without recording payment', async () => {
    const now = new Date();
    const futureStartDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    );
    const onboarding = {
      id: 'onboarding-1',
      leaseId: 'lease-1',
      generation: 1,
      managerUserId: 'manager-1',
      responseAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      lease: {
        id: 'lease-1',
        tenancyId: 'tenancy-1',
        status: LeaseStatus.PENDING_TENANT_REVIEW,
        startDate: futureStartDate,
        endDate: new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), now.getUTCDate())),
        tenancy: {
          id: 'tenancy-1',
          tenant: { legalName: 'Alex Tenant' },
          property: { organisationId: 'organisation-1' },
        },
      },
      snapshots: [{ id: 'snapshot-1', version: 1, agreement: { version: 1 } }],
    };
    const tx = {
      tenantLeaseOnboarding: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      leaseAgreementSnapshot: {
        create: vi.fn().mockResolvedValue({ id: 'snapshot-2' }),
      },
      lease: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      tenancy: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'tenancy-1',
          unitId: null,
          moveInDate: new Date(now.toISOString().slice(0, 10)),
          moveOutDate: null,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      notification: {
        create: vi.fn().mockResolvedValue({ id: 'notification-1' }),
      },
      unit: { updateMany: vi.fn() },
    };
    const { service } = serviceWith(tx, {
      tenantLeaseOnboarding: {
        findUnique: vi.fn().mockResolvedValue(onboarding),
      },
    });

    await expect(
      service.respond('a-secret-token', {
        response: TenantLeaseReviewAction.ACCEPTED,
        signatureName: 'Other Person',
        signatureConsent: true,
      }),
    ).rejects.toThrow('must match the tenant name');
    await expect(
      service.respond('a-secret-token', {
        response: TenantLeaseReviewAction.ACCEPTED,
        signatureName: 'Alex Tenant',
        signatureConsent: false,
      }),
    ).rejects.toThrow('confirm that you intend to sign');

    const result = await service.respond('a-secret-token', {
      response: TenantLeaseReviewAction.ACCEPTED,
      signatureName: 'Alex Tenant',
      signatureConsent: true,
    });

    expect(result).toMatchObject({
      leaseId: 'lease-1',
      status: LeaseStatus.TENANT_ACCEPTED,
      response: TenantLeaseReviewAction.ACCEPTED,
      tenantSignatureName: 'Alex Tenant',
      tenantSignedAt: expect.any(Date),
    });
    expect(tx.tenantLeaseOnboarding.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          responseAction: TenantLeaseReviewAction.ACCEPTED,
          responseAt: expect.any(Date),
        }),
      }),
    );
    expect(tx.leaseAgreementSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          onboardingId: 'onboarding-1',
          leaseId: 'lease-1',
          version: 2,
          agreement: expect.objectContaining({
            execution: {
              tenantSignatureName: 'Alex Tenant',
              tenantSignedAt: expect.any(String),
            },
          }),
        }),
      }),
    );
    expect(tx.lease.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: LeaseStatus.TENANT_ACCEPTED,
          signedAt: expect.any(Date),
        }),
      }),
    );
    expect(tx.tenancy.update).toHaveBeenCalledWith({
      where: { id: 'tenancy-1' },
      data: { status: TenancyStatus.UPCOMING },
    });
    expect(tx.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'manager-1',
          organisationId: 'organisation-1',
          channel: 'IN_APP',
          status: 'SENT',
        }),
      }),
    );
    expect(tx.unit.updateMany).not.toHaveBeenCalled();
  });

  it('releases the reserved tenancy when a tenant declines a lease offer', async () => {
    const now = new Date();
    const onboarding = {
      id: 'onboarding-1',
      leaseId: 'lease-1',
      generation: 1,
      managerUserId: 'manager-1',
      responseAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      lease: {
        id: 'lease-1',
        tenancyId: 'tenancy-1',
        status: LeaseStatus.PENDING_TENANT_REVIEW,
        startDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)),
        endDate: new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), now.getUTCDate())),
        tenancy: {
          id: 'tenancy-1',
          tenant: { legalName: 'Alex Tenant' },
          property: { organisationId: 'organisation-1' },
        },
      },
      snapshots: [{ version: 1, agreement: { version: 1 } }],
    };
    const tx = {
      tenantLeaseOnboarding: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      lease: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      tenancy: { update: vi.fn().mockResolvedValue({}) },
      notification: { create: vi.fn().mockResolvedValue({ id: 'notification-1' }) },
    };
    const { service } = serviceWith(tx, {
      tenantLeaseOnboarding: {
        findUnique: vi.fn().mockResolvedValue(onboarding),
      },
    });

    const result = await service.respond('a-secret-token', {
      response: TenantLeaseReviewAction.DECLINED,
    });

    expect(result.status).toBe(LeaseStatus.TENANT_DECLINED);
    expect(tx.tenancy.update).toHaveBeenCalledWith({
      where: { id: 'tenancy-1' },
      data: { status: TenancyStatus.TERMINATED },
    });
  });

  it('creates a new immutable snapshot when a manager updates and resends an offer', async () => {
    const lease = {
      id: 'lease-1',
      tenancyId: 'tenancy-1',
      status: LeaseStatus.CHANGES_REQUESTED,
      startDate: new Date('2027-01-01T00:00:00.000Z'),
      endDate: new Date('2027-12-31T00:00:00.000Z'),
      rentAmount: new Prisma.Decimal('1200.00'),
      dueDay: 1,
      paymentFrequency: 'MONTHLY',
      terms: {},
      tenancy: {
        id: 'tenancy-1',
        propertyId: 'property-1',
        unitId: null,
        rentalSpaceLabel: 'Standalone house',
        moveInDate: new Date('2027-01-01T00:00:00.000Z'),
        moveOutDate: null,
        tenant: {
          id: 'tenant-1',
          legalName: 'Alex Tenant',
          email: 'alex@example.test',
          phone: null,
          emergencyContactName: null,
          emergencyContactPhone: null,
        },
        property: {
          id: 'property-1',
          name: 'Standalone house',
          address: '1 Main Street',
        },
        unit: null,
        deposit: {
          requiredAmount: new Prisma.Decimal('1200.00'),
          receivedAmount: new Prisma.Decimal(0),
          heldBalance: new Prisma.Decimal(0),
          status: DepositStatus.NOT_RECEIVED,
        },
      },
    };
    const onboarding = {
      id: 'onboarding-1',
      leaseId: 'lease-1',
      generation: 1,
      lease,
      snapshots: [{ version: 1, agreement: {} }],
    };
    const tx = {
      tenantLeaseOnboarding: {
        findFirst: vi.fn().mockResolvedValue(onboarding),
        update: vi.fn().mockResolvedValue({ id: 'onboarding-1' }),
      },
      tenancy: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
      },
      tenant: {
        update: vi.fn().mockResolvedValue(lease.tenancy.tenant),
      },
      lease: {
        update: vi.fn().mockResolvedValue({
          ...lease,
          rentAmount: new Prisma.Decimal('1500.00'),
        }),
      },
      deposit: { update: vi.fn().mockResolvedValue({}) },
      leaseAgreementSnapshot: { create: vi.fn().mockResolvedValue({}) },
    };
    const { service, email } = serviceWith(tx);

    const result = await service.resend(
      'organisation-1',
      'manager-1',
      MembershipRole.OWNER,
      'lease-1',
      { lease: { rentAmount: '1500.00' } },
    );

    expect(result).toMatchObject({
      leaseId: 'lease-1',
      onboardingId: 'onboarding-1',
      generation: 2,
      status: LeaseStatus.PENDING_TENANT_REVIEW,
      emailSent: true,
    });
    expect(tx.leaseAgreementSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          version: 2,
          agreement: expect.objectContaining({
            version: 2,
            lease: expect.objectContaining({ rentAmount: '1500' }),
          }),
        }),
      }),
    );
    expect(tx.deposit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { requiredAmount: new Prisma.Decimal('1200') },
      }),
    );
    expect(tx.tenantLeaseOnboarding.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          generation: 2,
          tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    );
    expect(email.send).toHaveBeenCalled();
  });
});
