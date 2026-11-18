import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DepositStatus,
  LeaseStatus,
  MembershipRole,
  Prisma,
  TenantLeaseReviewAction,
  TenancyStatus,
  UnitStatus,
} from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { PdfService } from '../documents/pdf.service.js';
import { assertWholeFrancsIfRwf } from './financial-amount.js';
import {
  CreateTenantLeaseOnboardingInput,
  ResendTenantLeaseOnboardingInput,
  TenantLeaseReviewInput,
} from './dto/tenant-lease-onboarding.dto.js';

const reviewManagers = new Set<MembershipRole>([
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
  MembershipRole.MANAGER,
  MembershipRole.ACCOUNTANT,
]);
const tokenLifetimeMs = 7 * 24 * 60 * 60 * 1000;

function assertCanManage(role?: MembershipRole): void {
  if (!role || !reviewManagers.has(role)) {
    throw new ForbiddenException(
      'Your organisation role cannot manage lease offers',
    );
  }
}

function asDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function createReviewToken(): string {
  return randomBytes(32).toString('base64url');
}

function reviewUrl(config: ConfigService, token: string): string {
  const base =
    config.get<string>('WEB_APP_URL')?.trim() ||
    config.getOrThrow<string>('APP_ORIGINS').split(',')[0].trim();
  const url = new URL('/tenant-lease-review', base);
  url.searchParams.set('token', token);
  return url.toString();
}

function snapshotJson(value: Prisma.JsonValue): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new ConflictException(
      'The saved lease agreement snapshot is invalid',
    );
  }
  return value as Record<string, unknown>;
}

function formatSnapshotDate(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 10) : '';
}

function snapshotSections(agreement: Record<string, unknown>) {
  const tenant =
    agreement.tenant && typeof agreement.tenant === 'object'
      ? (agreement.tenant as Record<string, unknown>)
      : {};
  const property =
    agreement.property && typeof agreement.property === 'object'
      ? (agreement.property as Record<string, unknown>)
      : {};
  const rentalSpace =
    agreement.rentalSpace && typeof agreement.rentalSpace === 'object'
      ? (agreement.rentalSpace as Record<string, unknown>)
      : {};
  const lease =
    agreement.lease && typeof agreement.lease === 'object'
      ? (agreement.lease as Record<string, unknown>)
      : {};
  const terms =
    lease.terms && typeof lease.terms === 'object'
      ? JSON.stringify(lease.terms, null, 2)
      : 'No additional terms.';

  return [
    {
      heading: 'Property',
      body: [property.name, property.address].filter(Boolean).join('\n'),
    },
    {
      heading: 'Rental space',
      body: String(rentalSpace.label ?? 'Entire property'),
    },
    {
      heading: 'Tenant',
      body: [tenant.legalName, tenant.email, tenant.phone]
        .filter(Boolean)
        .join('\n'),
    },
    {
      heading: 'Lease term',
      body: `${formatSnapshotDate(lease.startDate)} to ${formatSnapshotDate(lease.endDate)}`,
    },
    {
      heading: 'Rent and deposit',
      body: [
        `Rent: ${String(lease.rentAmount)} (${String(lease.paymentFrequency)})`,
        `Security deposit required: ${String(lease.depositAmount)}`,
        `Rent due day: ${String(lease.dueDay)}`,
      ].join('\n'),
    },
    { heading: 'Agreement terms', body: terms },
  ];
}

@Injectable()
export class TenantLeaseOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly pdf: PdfService,
  ) {}

  async create(
    organisationId: string,
    managerUserId: string,
    role: MembershipRole | undefined,
    input: CreateTenantLeaseOnboardingInput,
  ) {
    assertCanManage(role);
    const moveInDate = asDate(input.moveInDate);
    const moveOutDate = input.moveOutDate ? asDate(input.moveOutDate) : null;
    const startDate = asDate(input.lease.startDate);
    const endDate = asDate(input.lease.endDate);
    if (moveOutDate && moveOutDate < moveInDate) {
      throw new BadRequestException(
        'Move-out date cannot be before move-in date',
      );
    }
    if (endDate < startDate) {
      throw new BadRequestException(
        'Lease end date must be on or after its start date',
      );
    }

    const token = createReviewToken();
    const expiresAt = new Date(Date.now() + tokenLifetimeMs);
    const created = await this.prisma.$transaction(
      async (transaction) => {
        const property = await transaction.property.findFirst({
          where: {
            id: input.propertyId,
            organisationId,
            ...(role === MembershipRole.MANAGER
              ? { assignments: { some: { userId: managerUserId } } }
              : {}),
          },
          select: { id: true, name: true, address: true },
        });
        if (!property) {
          throw new NotFoundException(
            'Property was not found in this organisation',
          );
        }
        await assertWholeFrancsIfRwf(transaction, organisationId, [
          input.lease.rentAmount,
          input.lease.depositAmount,
        ]);

        const unit = input.unitId
          ? await transaction.unit.findFirst({
              where: { id: input.unitId, propertyId: property.id },
              select: {
                id: true,
                unitNumber: true,
                rentAmount: true,
                depositAmount: true,
                status: true,
              },
            })
          : null;
        if (input.unitId && !unit) {
          throw new NotFoundException('Unit was not found in this property');
        }
        if (
          unit &&
          (unit.status === UnitStatus.ARCHIVED ||
            unit.status === UnitStatus.UNAVAILABLE)
        ) {
          throw new ConflictException(
            'This unit is not available for a tenancy',
          );
        }
        const conflictingTenancy = await transaction.tenancy.findFirst({
          where: {
            ...(unit ? { unitId: unit.id } : { propertyId: property.id }),
            status: { in: [TenancyStatus.UPCOMING, TenancyStatus.ACTIVE] },
            moveInDate: {
              lte: moveOutDate ?? new Date('9999-12-31T00:00:00.000Z'),
            },
            OR: [{ moveOutDate: null }, { moveOutDate: { gte: moveInDate } }],
          },
          select: { id: true },
        });
        if (conflictingTenancy) {
          throw new ConflictException(
            'This rental space already has a tenancy during those dates',
          );
        }

        const tenant = await transaction.tenant.create({
          data: {
            organisationId,
            legalName: input.tenant.legalName.trim(),
            email: input.tenant.email.trim().toLowerCase(),
            phone: input.tenant.phone?.trim() || null,
            emergencyContactName:
              input.tenant.emergencyContactName?.trim() || null,
            emergencyContactPhone:
              input.tenant.emergencyContactPhone?.trim() || null,
          },
        });
        const tenancy = await transaction.tenancy.create({
          data: {
            tenantId: tenant.id,
            propertyId: property.id,
            unitId: unit?.id ?? null,
            rentalSpaceLabel: unit ? unit.unitNumber : property.name,
            moveInDate,
            moveOutDate,
            status: TenancyStatus.UPCOMING,
            deposit: {
              create: {
                requiredAmount: input.lease.depositAmount,
                receivedAmount: new Prisma.Decimal(0),
                heldBalance: new Prisma.Decimal(0),
                status: DepositStatus.NOT_RECEIVED,
              },
            },
          },
        });
        const lease = await transaction.lease.create({
          data: {
            tenancyId: tenancy.id,
            startDate,
            endDate,
            rentAmount: new Prisma.Decimal(input.lease.rentAmount),
            dueDay: input.lease.dueDay,
            paymentFrequency: input.lease.paymentFrequency.trim(),
            terms: input.lease.terms as Prisma.InputJsonValue | undefined,
            status: LeaseStatus.PENDING_TENANT_REVIEW,
          },
        });
        const onboarding = await transaction.tenantLeaseOnboarding.create({
          data: {
            leaseId: lease.id,
            managerUserId,
            tokenHash: tokenHash(token),
            expiresAt,
          },
        });
        const agreement = this.buildAgreement({
          lease,
          tenant,
          property,
          unit,
          tenancy,
          depositAmount: input.lease.depositAmount,
          version: 1,
        });
        await transaction.leaseAgreementSnapshot.create({
          data: {
            onboardingId: onboarding.id,
            leaseId: lease.id,
            version: 1,
            createdByUserId: managerUserId,
            agreement: agreement as Prisma.InputJsonObject,
          },
        });
        return {
          tenantId: tenant.id,
          tenancyId: tenancy.id,
          leaseId: lease.id,
          onboardingId: onboarding.id,
          status: lease.status,
          expiresAt,
          tenantEmail: tenant.email!,
          tenantName: tenant.legalName,
          propertyName: property.name,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    const emailSent = await this.sendReviewEmail(
      created.tenantEmail,
      created.tenantName,
      created.propertyName,
      token,
      expiresAt,
    );
    return {
      tenantId: created.tenantId,
      tenancyId: created.tenancyId,
      leaseId: created.leaseId,
      onboardingId: created.onboardingId,
      status: created.status,
      expiresAt: created.expiresAt,
      emailSent,
    };
  }

  async getPublicReview(token: string) {
    const { onboarding, snapshot } = await this.loadReview(token);
    return {
      status: onboarding.lease.status,
      response: onboarding.responseAction,
      responseAt: onboarding.responseAt,
      expiresAt: onboarding.expiresAt,
      agreementVersion: snapshot.version,
      agreement: snapshot.agreement,
    };
  }

  async getPublicDocument(token: string): Promise<Buffer> {
    const { snapshot } = await this.loadReview(token);
    return this.pdf.renderDocument(
      `Lease agreement — version ${snapshot.version}`,
      snapshotSections(snapshotJson(snapshot.agreement)),
    );
  }

  async respond(token: string, input: TenantLeaseReviewInput) {
    const { onboarding } = await this.loadReview(token);
    if (
      onboarding.responseAt ||
      onboarding.lease.status !== LeaseStatus.PENDING_TENANT_REVIEW
    ) {
      throw new ConflictException('This lease offer has already been reviewed');
    }
    if (
      input.response === TenantLeaseReviewAction.CHANGES_REQUESTED &&
      !input.message?.trim()
    ) {
      throw new BadRequestException(
        'A note is required when requesting changes',
      );
    }

    const now = new Date();
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    if (
      input.response === TenantLeaseReviewAction.ACCEPTED &&
      onboarding.lease.endDate < today
    ) {
      throw new ConflictException(
        'This lease offer has expired. Contact your property manager for an updated offer.',
      );
    }
    const status =
      input.response === TenantLeaseReviewAction.ACCEPTED
        ? onboarding.lease.startDate <= today
          ? LeaseStatus.ACTIVE
          : LeaseStatus.TENANT_ACCEPTED
        : input.response === TenantLeaseReviewAction.CHANGES_REQUESTED
          ? LeaseStatus.CHANGES_REQUESTED
          : LeaseStatus.TENANT_DECLINED;

    await this.prisma.$transaction(
      async (transaction) => {
        const claimed = await transaction.tenantLeaseOnboarding.updateMany({
          where: {
            id: onboarding.id,
            tokenHash: tokenHash(token),
            expiresAt: { gt: now },
            responseAt: null,
          },
          data: {
            responseAt: now,
            responseAction: input.response,
            responseNote: input.message?.trim() || null,
          },
        });
        if (claimed.count !== 1) {
          throw new ConflictException(
            'This lease offer has already been reviewed',
          );
        }
        const updatedLease = await transaction.lease.updateMany({
          where: {
            id: onboarding.leaseId,
            status: LeaseStatus.PENDING_TENANT_REVIEW,
          },
          data: {
            status,
            ...(input.response === TenantLeaseReviewAction.ACCEPTED ? { signedAt: now } : {}),
          },
        });
        if (updatedLease.count !== 1) {
          throw new ConflictException(
            'This lease offer is no longer reviewable',
          );
        }
        if (input.response === TenantLeaseReviewAction.ACCEPTED) {
          const tenancy = await transaction.tenancy.findUniqueOrThrow({
            where: { id: onboarding.lease.tenancyId },
            select: {
              id: true,
              unitId: true,
              moveInDate: true,
              moveOutDate: true,
            },
          });
          if (tenancy.moveOutDate && tenancy.moveOutDate < today) {
            throw new ConflictException('This tenancy has already ended');
          }
          const tenancyStatus =
            tenancy.moveInDate <= today && onboarding.lease.startDate <= today
              ? TenancyStatus.ACTIVE
              : TenancyStatus.UPCOMING;
          await transaction.tenancy.update({
            where: { id: tenancy.id },
            data: { status: tenancyStatus },
          });
          if (tenancy.unitId && tenancyStatus === TenancyStatus.ACTIVE) {
            await transaction.unit.updateMany({
              where: {
                id: tenancy.unitId,
                status: { not: UnitStatus.ARCHIVED },
              },
              data: { status: UnitStatus.OCCUPIED },
            });
          }
        } else if (input.response === TenantLeaseReviewAction.DECLINED) {
          await transaction.tenancy.update({
            where: { id: onboarding.lease.tenancyId },
            data: { status: TenancyStatus.TERMINATED },
          });
        }
        await transaction.notification.create({
          data: {
            organisationId: onboarding.lease.tenancy.property.organisationId,
            userId: onboarding.managerUserId,
            channel: 'IN_APP',
            template: 'tenant_lease_review_response',
            status: 'SENT',
            sentAt: now,
            deduplicationKey: `tenant-lease-response:${onboarding.id}:${onboarding.generation}`,
            payload: {
              title: 'Tenant lease response',
              message: this.responseMessage(
                input.response,
                onboarding.lease.tenancy.tenant.legalName,
              ),
              leaseId: onboarding.leaseId,
              tenancyId: onboarding.lease.tenancyId,
              response: input.response,
              responseMessage: input.message?.trim() ?? '',
            } satisfies Prisma.InputJsonObject,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return {
      leaseId: onboarding.leaseId,
      status,
      response: input.response,
      responseAt: now,
    };
  }

  async resend(
    organisationId: string,
    managerUserId: string,
    role: MembershipRole | undefined,
    leaseId: string,
    input: ResendTenantLeaseOnboardingInput,
  ) {
    assertCanManage(role);
    const token = createReviewToken();
    const expiresAt = new Date(Date.now() + tokenLifetimeMs);
    const updated = await this.prisma.$transaction(
      async (transaction) => {
        const onboarding = await transaction.tenantLeaseOnboarding.findFirst({
          where: {
            leaseId,
            lease: {
              tenancy: {
                property: {
                  organisationId,
                  ...(role === MembershipRole.MANAGER
                    ? { assignments: { some: { userId: managerUserId } } }
                    : {}),
                },
              },
            },
          },
          include: {
            lease: {
              include: {
                tenancy: {
                  include: {
                    tenant: true,
                    property: {
                      select: { id: true, name: true, address: true },
                    },
                    unit: {
                      select: { id: true, unitNumber: true },
                    },
                    deposit: true,
                  },
                },
              },
            },
            snapshots: { orderBy: { version: 'desc' }, take: 1 },
          },
        });
        if (!onboarding) {
          throw new NotFoundException(
            'Lease offer was not found in this organisation',
          );
        }
        if (
          onboarding.lease.status !== LeaseStatus.CHANGES_REQUESTED &&
          onboarding.lease.status !== LeaseStatus.PENDING_TENANT_REVIEW
        ) {
          throw new ConflictException(
            'Only pending or change-requested offers can be resent',
          );
        }
        const hasEdits = Object.values(input).some(
          (value) => value !== undefined,
        );
        const current = onboarding.lease;
        const tenant = current.tenancy.tenant;
        const lease = current;
        const tenancy = current.tenancy;
        const startDate = input.lease?.startDate
          ? asDate(input.lease.startDate)
          : lease.startDate;
        const endDate = input.lease?.endDate
          ? asDate(input.lease.endDate)
          : lease.endDate;
        const moveInDate = input.moveInDate
          ? asDate(input.moveInDate)
          : tenancy.moveInDate;
        const moveOutDate =
          input.moveOutDate === undefined
            ? tenancy.moveOutDate
            : input.moveOutDate
              ? asDate(input.moveOutDate)
              : null;
        if (endDate < startDate) {
          throw new BadRequestException(
            'Lease end date must be on or after its start date',
          );
        }
        if (moveOutDate && moveOutDate < moveInDate) {
          throw new BadRequestException(
            'Move-out date cannot be before move-in date',
          );
        }
        const conflictingTenancy = await transaction.tenancy.findFirst({
          where: {
            id: { not: tenancy.id },
            ...(tenancy.unitId
              ? { unitId: tenancy.unitId }
              : { propertyId: tenancy.propertyId }),
            status: { in: [TenancyStatus.UPCOMING, TenancyStatus.ACTIVE] },
            moveInDate: {
              lte: moveOutDate ?? new Date('9999-12-31T00:00:00.000Z'),
            },
            OR: [{ moveOutDate: null }, { moveOutDate: { gte: moveInDate } }],
          },
          select: { id: true },
        });
        if (conflictingTenancy) {
          throw new ConflictException(
            'This rental space already has a tenancy during those dates',
          );
        }
        const updatedTenant = await transaction.tenant.update({
          where: { id: tenant.id },
          data: {
            legalName: input.tenant?.legalName?.trim(),
            email: input.tenant?.email?.trim().toLowerCase(),
            phone:
              input.tenant?.phone === undefined
                ? undefined
                : input.tenant.phone.trim() || null,
            emergencyContactName:
              input.tenant?.emergencyContactName === undefined
                ? undefined
                : input.tenant.emergencyContactName.trim() || null,
            emergencyContactPhone:
              input.tenant?.emergencyContactPhone === undefined
                ? undefined
                : input.tenant.emergencyContactPhone.trim() || null,
          },
        });
        const rentAmount =
          input.lease?.rentAmount ?? lease.rentAmount.toString();
        const depositAmount =
          input.lease?.depositAmount ??
          current.tenancy.deposit?.requiredAmount.toString() ??
          '0';
        await assertWholeFrancsIfRwf(transaction, organisationId, [
          input.lease?.rentAmount,
          input.lease?.depositAmount,
        ]);
        const updatedLease = await transaction.lease.update({
          where: { id: lease.id },
          data: {
            startDate,
            endDate,
            rentAmount: new Prisma.Decimal(rentAmount),
            dueDay: input.lease?.dueDay,
            paymentFrequency:
              input.lease?.paymentFrequency?.trim() || undefined,
            terms: input.lease?.terms
              ? (input.lease.terms as Prisma.InputJsonValue)
              : undefined,
            status: LeaseStatus.PENDING_TENANT_REVIEW,
          },
        });
        await transaction.tenancy.update({
          where: { id: tenancy.id },
          data: {
            moveInDate,
            moveOutDate,
            status: TenancyStatus.UPCOMING,
          },
        });
        if (current.tenancy.deposit) {
          await transaction.deposit.update({
            where: { tenancyId: tenancy.id },
            data: {
              requiredAmount: new Prisma.Decimal(depositAmount),
            },
          });
        }

        const nextGeneration = onboarding.generation + 1;
        const updatedOnboarding =
          await transaction.tenantLeaseOnboarding.update({
            where: { id: onboarding.id },
            data: {
              tokenHash: tokenHash(token),
              expiresAt,
              generation: nextGeneration,
              responseAt: null,
              responseAction: null,
              responseNote: null,
            },
          });
        if (hasEdits) {
          const agreement = this.buildAgreement({
            lease: updatedLease,
            tenant: updatedTenant,
            property: current.tenancy.property,
            unit: current.tenancy.unit,
            tenancy: {
              ...tenancy,
              moveInDate,
              moveOutDate,
            },
            depositAmount,
            version: (onboarding.snapshots[0]?.version ?? 0) + 1,
          });
          await transaction.leaseAgreementSnapshot.create({
            data: {
              onboardingId: onboarding.id,
              leaseId: lease.id,
              version: (onboarding.snapshots[0]?.version ?? 0) + 1,
              createdByUserId: managerUserId,
              agreement: agreement as Prisma.InputJsonObject,
            },
          });
        }
        return {
          tenantEmail: updatedTenant.email ?? '',
          tenantName: updatedTenant.legalName,
          propertyName: current.tenancy.property.name,
          leaseId: updatedLease.id,
          onboardingId: updatedOnboarding.id,
          generation: nextGeneration,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    const emailSent = await this.sendReviewEmail(
      updated.tenantEmail,
      updated.tenantName,
      updated.propertyName,
      token,
      expiresAt,
    );
    return {
      leaseId: updated.leaseId,
      onboardingId: updated.onboardingId,
      status: LeaseStatus.PENDING_TENANT_REVIEW,
      generation: updated.generation,
      expiresAt,
      emailSent,
    };
  }

  private async loadReview(token: string) {
    if (!token || token.length > 128) {
      throw new NotFoundException('Lease review link is invalid or expired');
    }
    const onboarding = await this.prisma.tenantLeaseOnboarding.findUnique({
      where: { tokenHash: tokenHash(token) },
      include: {
        lease: {
          include: {
            tenancy: {
              select: {
                id: true,
                propertyId: true,
                property: { select: { organisationId: true } },
                tenant: { select: { legalName: true } },
              },
            },
          },
        },
        snapshots: { orderBy: { version: 'desc' }, take: 1 },
      },
    });
    if (!onboarding || onboarding.expiresAt <= new Date()) {
      throw new GoneException('Lease review link is invalid or expired');
    }
    const snapshot = onboarding.snapshots[0];
    if (!snapshot) {
      throw new ConflictException('No agreement snapshot is available');
    }
    return { onboarding, snapshot };
  }

  private buildAgreement(input: {
    lease: {
      id: string;
      startDate: Date;
      endDate: Date;
      rentAmount: Prisma.Decimal;
      dueDay: number;
      paymentFrequency: string;
      terms: Prisma.JsonValue | null;
    };
    tenant: {
      id: string;
      legalName: string;
      email: string | null;
      phone: string | null;
      emergencyContactName?: string | null;
      emergencyContactPhone?: string | null;
    };
    property: { id: string; name: string; address: string };
    unit: { id: string; unitNumber: string } | null;
    tenancy: {
      id: string;
      moveInDate: Date;
      moveOutDate: Date | null;
      rentalSpaceLabel: string | null;
    };
    depositAmount: string;
    version: number;
  }): Prisma.JsonObject {
    return {
      version: input.version,
      leaseId: input.lease.id,
      tenant: {
        id: input.tenant.id,
        legalName: input.tenant.legalName,
        email: input.tenant.email,
        phone: input.tenant.phone,
        emergencyContactName: input.tenant.emergencyContactName ?? null,
        emergencyContactPhone: input.tenant.emergencyContactPhone ?? null,
      },
      property: {
        id: input.property.id,
        name: input.property.name,
        address: input.property.address,
      },
      rentalSpace: {
        id: input.unit?.id ?? null,
        label:
          input.unit?.unitNumber ??
          input.tenancy.rentalSpaceLabel ??
          'Entire property',
      },
      tenancy: {
        id: input.tenancy.id,
        moveInDate: input.tenancy.moveInDate.toISOString().slice(0, 10),
        moveOutDate:
          input.tenancy.moveOutDate?.toISOString().slice(0, 10) ?? null,
      },
      lease: {
        id: input.lease.id,
        startDate: input.lease.startDate.toISOString().slice(0, 10),
        endDate: input.lease.endDate.toISOString().slice(0, 10),
        rentAmount: input.lease.rentAmount.toString(),
        depositAmount: new Prisma.Decimal(input.depositAmount).toString(),
        dueDay: input.lease.dueDay,
        paymentFrequency: input.lease.paymentFrequency,
        terms: input.lease.terms ?? {},
      },
    };
  }

  private async sendReviewEmail(
    email: string,
    tenantName: string,
    propertyName: string,
    token: string,
    expiresAt: Date,
  ): Promise<boolean> {
    if (!email) return false;
    try {
      const url = reviewUrl(this.config, token);
      await this.email.send(
        email,
        `Review your lease for ${propertyName}`,
        [
          `Hello ${tenantName},`,
          '',
          `Your lease offer for ${propertyName} is ready for review.`,
          `Review it securely here: ${url}`,
          '',
          `This link expires on ${expiresAt.toISOString()}.`,
          'If you were not expecting this offer, contact your property manager.',
        ].join('\n'),
      );
      return true;
    } catch {
      return false;
    }
  }

  private responseMessage(
    action: TenantLeaseReviewAction,
    tenantName: string,
  ): string {
    switch (action) {
      case TenantLeaseReviewAction.ACCEPTED:
        return `${tenantName} accepted the lease offer.`;
      case TenantLeaseReviewAction.CHANGES_REQUESTED:
        return `${tenantName} requested changes to the lease offer.`;
      case TenantLeaseReviewAction.DECLINED:
        return `${tenantName} declined the lease offer.`;
    }
  }
}
