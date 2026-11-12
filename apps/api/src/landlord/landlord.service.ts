import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BillingCycle,
  DepositStatus,
  DepositTransactionType,
  DeliveryStatus,
  InvoiceStatus,
  LeaseStatus,
  MaintenanceStatus,
  MembershipRole,
  MembershipStatus,
  Prisma,
  RentChargeStatus,
  SubscriptionStatus,
  TenancyStatus,
  UnitStatus,
} from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import {
  ChargeInput,
  DepositTransactionInput,
  ExpenseInput,
  FileEvidenceInput,
  InspectionMediaInput,
  InspectionInput,
  LeaseDocumentInput,
  LeaseInput,
  LeaseStatusInput,
  MaintenanceInput,
  MaintenanceUpdateInput,
  MoveOutInput,
  NoticeInput,
  OrganisationSettingsInput,
  PaymentInput,
  PropertyOwnerInput,
  PropertyOwnerUpdateInput,
  PropertyInput,
  PropertyUpdateInput,
  ReversalInput,
  TeamInviteInput,
  TeamRoleInput,
  TenancyInput,
  TenantInput,
  TenantUpdateInput,
  SubscriptionPaymentInput,
  UnitInput,
  UnitUpdateInput,
  UtilityInput,
} from './dto/landlord.dto.js';
import { ensureTrialSubscription } from './trial-subscription.js';

const managers = new Set<MembershipRole>([
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
  MembershipRole.MANAGER,
  MembershipRole.ACCOUNTANT,
  MembershipRole.MAINTENANCE_STAFF,
]);

const ownershipManagers = new Set<MembershipRole>([
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
]);

const restrictedAdminGrants = new Set<MembershipRole>([
  MembershipRole.ADMIN,
]);

function assertCanManage(role: MembershipRole | undefined): void {
  if (!role || !managers.has(role)) {
    throw new ForbiddenException('Your organisation role cannot make this change');
  }
}

function assertCanManageOwnership(role: MembershipRole | undefined): void {
  if (!role || !ownershipManagers.has(role)) {
    throw new ForbiddenException('Only organisation owners and administrators can manage property owners');
  }
}

function propertyScopeWhere(
  organisationId: string,
  role?: MembershipRole,
  userId?: string,
): Prisma.PropertyWhereInput {
  return {
    organisationId,
    ...(role === MembershipRole.MANAGER && userId
      ? { assignments: { some: { userId } } }
      : {}),
  };
}

function tenancyPropertyScope(
  organisationId: string,
  role?: MembershipRole,
  userId?: string,
): Prisma.TenancyWhereInput {
  return { unit: { property: propertyScopeWhere(organisationId, role, userId) } };
}

async function setPropertyAssignments(
  transaction: Prisma.TransactionClient,
  organisationId: string,
  userId: string,
  role: MembershipRole,
  propertyIds: string[],
): Promise<void> {
  const ids = [...new Set(propertyIds)];
  if (role === MembershipRole.MANAGER && ids.length === 0) {
    throw new BadRequestException('Assign at least one property to a property manager');
  }
  if (role !== MembershipRole.MANAGER && ids.length > 0) {
    throw new BadRequestException('Only property managers can receive property assignments');
  }
  if (ids.length > 0) {
    const properties = await transaction.property.findMany({
      where: { organisationId, id: { in: ids } },
      select: { id: true },
    });
    if (properties.length !== ids.length) {
      throw new NotFoundException('One or more assigned properties were not found in this organisation');
    }
  }
  await transaction.propertyAssignment.deleteMany({
    where: { userId, property: { organisationId } },
  });
  if (ids.length > 0) {
    await transaction.propertyAssignment.createMany({
      data: ids.map((propertyId) => ({ propertyId, userId })),
    });
  }
}

function dateOnly(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function amount(value: string, label = 'Amount'): Prisma.Decimal {
  const parsed = new Prisma.Decimal(value);
  if (!parsed.isFinite() || parsed.lte(0)) {
    throw new BadRequestException(`${label} must be greater than zero`);
  }
  return parsed;
}

function addAudit(
  transaction: Prisma.TransactionClient,
  organisationId: string,
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Prisma.InputJsonValue,
) {
  return transaction.auditLog.create({
    data: {
      organisationId,
      userId,
      action,
      entityType,
      entityId,
      metadata,
    },
  });
}

function isUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

@Injectable()
export class LandlordService {
  private readonly logger = new Logger(LandlordService.name);
  private readonly tenancyStatusSyncs = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  private syncTenancyStatuses(
    organisationId: string,
    role?: MembershipRole,
    userId?: string,
  ): Promise<void> {
    const syncKey = `${organisationId}:${role ?? ''}:${userId ?? ''}`;
    const existingSync = this.tenancyStatusSyncs.get(syncKey);
    if (existingSync) return existingSync;

    const today = dateOnly(new Date().toISOString());
    const tenancyScope = tenancyPropertyScope(organisationId, role, userId);
    const sync = this.prisma.$transaction(async (transaction) => {
      const endedTenancies = await transaction.tenancy.findMany({
        where: {
          ...tenancyScope,
          status: { in: [TenancyStatus.UPCOMING, TenancyStatus.ACTIVE] },
          moveOutDate: { lte: today },
        },
        select: { id: true, unitId: true },
      });
      const activeTenancies = await transaction.tenancy.findMany({
        where: {
          ...tenancyScope,
          status: TenancyStatus.UPCOMING,
          moveInDate: { lte: today },
          OR: [{ moveOutDate: null }, { moveOutDate: { gt: today } }],
        },
        select: { id: true, unitId: true },
      });

      const endedIds = endedTenancies.map(({ id }) => id);
      if (endedIds.length > 0) {
        await transaction.tenancy.updateMany({
          where: { id: { in: endedIds } },
          data: { status: TenancyStatus.ENDED },
        });
        await transaction.lease.updateMany({
          where: { tenancyId: { in: endedIds }, status: LeaseStatus.ACTIVE },
          data: {
            status: LeaseStatus.TERMINATED,
            terminatedAt: new Date(),
            terminationReason: 'Tenancy move-out date reached',
          },
        });
      }

      const activeIds = activeTenancies.map(({ id }) => id);
      if (activeIds.length > 0) {
        await transaction.tenancy.updateMany({
          where: { id: { in: activeIds }, status: TenancyStatus.UPCOMING },
          data: { status: TenancyStatus.ACTIVE },
        });
      }

      const affectedUnitIds = new Set([
        ...endedTenancies.map(({ unitId }) => unitId),
        ...activeTenancies.map(({ unitId }) => unitId),
      ]);
      if (affectedUnitIds.size > 0) {
        const currentTenancies = await transaction.tenancy.findMany({
          where: {
            unitId: { in: [...affectedUnitIds] },
            status: TenancyStatus.ACTIVE,
            moveInDate: { lte: today },
            OR: [{ moveOutDate: null }, { moveOutDate: { gt: today } }],
          },
          select: { unitId: true },
        });
        const occupiedUnitIds = new Set(currentTenancies.map(({ unitId }) => unitId));
        const availableUnitIds = [...affectedUnitIds].filter((id) => !occupiedUnitIds.has(id));
        if (occupiedUnitIds.size > 0) {
          await transaction.unit.updateMany({
            where: {
              id: { in: [...occupiedUnitIds] },
              status: { not: UnitStatus.ARCHIVED },
            },
            data: { status: UnitStatus.OCCUPIED },
          });
        }
        if (availableUnitIds.length > 0) {
          await transaction.unit.updateMany({
            where: {
              id: { in: availableUnitIds },
              status: UnitStatus.OCCUPIED,
            },
            data: { status: UnitStatus.AVAILABLE },
          });
        }
      }
    }, { maxWait: 10_000, timeout: 20_000 });

    this.tenancyStatusSyncs.set(syncKey, sync);
    void sync.then(
      () => {
        if (this.tenancyStatusSyncs.get(syncKey) === sync) {
          this.tenancyStatusSyncs.delete(syncKey);
        }
      },
      () => {
        if (this.tenancyStatusSyncs.get(syncKey) === sync) {
          this.tenancyStatusSyncs.delete(syncKey);
        }
      },
    );
    return sync;
  }

  async dashboard(
    organisationId: string,
    role?: MembershipRole,
    userId?: string,
  ) {
    await this.prisma.$transaction((transaction) =>
      ensureTrialSubscription(transaction, organisationId),
    );
    await this.syncTenancyStatuses(organisationId, role, userId);
    const assignedPropertyIds =
      role === MembershipRole.MANAGER && userId
        ? (
            await this.prisma.propertyAssignment.findMany({
              where: { userId, property: { organisationId } },
              select: { propertyId: true },
            })
          ).map(({ propertyId }) => propertyId)
        : undefined;
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [
      properties,
      unitCounts,
      tenantCount,
      activeTenancies,
      outstanding,
      rentThisMonth,
      paymentThisMonth,
      expensesThisMonth,
      upcomingLeases,
      openMaintenance,
      recentAudit,
      monthlyCollections,
    ] = await Promise.all([
      this.prisma.property.count({
        where: { ...propertyScopeWhere(organisationId, role, userId), status: 'ACTIVE' },
      }),
      this.prisma.unit.groupBy({
        by: ['status'],
        where: { property: propertyScopeWhere(organisationId, role, userId) },
        _count: { _all: true },
      }),
      this.prisma.tenant.count({
        where: {
          organisationId,
          archivedAt: null,
          ...(role === MembershipRole.MANAGER
            ? {
                tenancies: {
                  some: {
                    unit: {
                      property: propertyScopeWhere(organisationId, role, userId),
                    },
                  },
                },
              }
            : {}),
        },
      }),
      this.prisma.tenancy.count({
        where: {
          ...tenancyPropertyScope(organisationId, role, userId),
          status: TenancyStatus.ACTIVE,
        },
      }),
      this.prisma.rentCharge.aggregate({
        where: {
          tenancy: tenancyPropertyScope(organisationId, role, userId),
          status: { in: [RentChargeStatus.PENDING, RentChargeStatus.PARTIALLY_PAID, RentChargeStatus.OVERDUE] },
        },
        _sum: { balance: true },
      }),
      this.prisma.rentCharge.aggregate({
        where: {
          tenancy: tenancyPropertyScope(organisationId, role, userId),
          dueDate: { gte: monthStart },
          status: { not: RentChargeStatus.VOID },
        },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          organisationId,
          reversedAt: null,
          receivedAt: { gte: monthStart },
          ...(role === MembershipRole.MANAGER
            ? {
                allocations: {
                  some: {
                    rentCharge: {
                      tenancy: tenancyPropertyScope(organisationId, role, userId),
                    },
                  },
                },
              }
            : {}),
        },
        _sum: { amount: true },
      }),
      this.prisma.expense.aggregate({
        where: {
          property: propertyScopeWhere(organisationId, role, userId),
          reversedAt: null,
          date: { gte: monthStart },
        },
        _sum: { amount: true },
      }),
      this.prisma.lease.findMany({
        where: {
          tenancy: tenancyPropertyScope(organisationId, role, userId),
          status: LeaseStatus.ACTIVE,
          endDate: { gte: now, lte: new Date(now.getTime() + 60 * 86400000) },
        },
        select: {
          id: true,
          endDate: true,
          tenancy: { select: { tenant: { select: { legalName: true } }, unit: { select: { unitNumber: true, property: { select: { name: true } } } } } },
        },
        orderBy: { endDate: 'asc' },
        take: 8,
      }),
      this.prisma.maintenanceRequest.count({
        where: {
          unit: { property: propertyScopeWhere(organisationId, role, userId) },
          status: { notIn: [MaintenanceStatus.COMPLETED, MaintenanceStatus.REJECTED] },
        },
      }),
      this.prisma.auditLog.findMany({
        where:
          role === MembershipRole.MANAGER
            ? {
                organisationId,
                entityType: 'property',
                entityId: { in: assignedPropertyIds ?? [] },
              }
            : { organisationId },
        select: { id: true, action: true, entityType: true, entityId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      role === MembershipRole.MANAGER
        ? Promise.resolve([])
        : this.prisma.$queryRaw<Array<{ month: Date; collected: Prisma.Decimal }>>(
        Prisma.sql`
          SELECT date_trunc('month', "received_at") AS month, SUM(amount) AS collected
          FROM payments
          WHERE organisation_id = ${organisationId}::uuid
            AND reversed_at IS NULL
            AND received_at >= ${new Date(Date.UTC(now.getUTCFullYear(), 0, 1))}
            AND received_at < ${new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1))}
          GROUP BY 1
          ORDER BY 1
        `,
      ),
    ]);

    const byStatus = Object.fromEntries(
      unitCounts.map((entry) => [entry.status, entry._count._all]),
    ) as Record<string, number>;
    return {
      summary: {
        properties,
        units: Object.values(byStatus).reduce((sum, count) => sum + count, 0),
        occupiedUnits: byStatus.OCCUPIED ?? 0,
        availableUnits: byStatus.AVAILABLE ?? 0,
        tenants: tenantCount,
        activeTenancies,
        outstandingRent: outstanding._sum.balance?.toString() ?? '0',
        rentDueThisMonth: rentThisMonth._sum.amount?.toString() ?? '0',
        paymentsThisMonth: paymentThisMonth._sum.amount?.toString() ?? '0',
        expensesThisMonth: expensesThisMonth._sum.amount?.toString() ?? '0',
        openMaintenance,
      },
      upcomingLeases,
      recentActivity: recentAudit,
      monthlyCollections: monthlyCollections.map(({ month, collected }) => ({
        month: month.toISOString().slice(0, 7),
        collected: collected.toString(),
      })),
    };
  }

  async listProperties(
    organisationId: string,
    role?: MembershipRole,
    userId?: string,
  ) {
    return {
      properties: await this.prisma.property.findMany({
        where: propertyScopeWhere(organisationId, role, userId),
        select: {
          id: true,
          name: true,
          type: true,
          address: true,
          description: true,
          photoFileId: true,
          status: true,
          createdAt: true,
          propertyOwner:
            role === MembershipRole.ACCOUNTANT
              ? false
              : { select: { id: true, name: true, email: true, phone: true } },
          _count: { select: { units: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    };
  }

  async listPropertyOwners(organisationId: string) {
    return {
      owners: await this.prisma.propertyOwner.findMany({
        where: { organisationId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          _count: { select: { properties: true } },
        },
        orderBy: { name: 'asc' },
      }),
    };
  }

  async createPropertyOwner(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    input: PropertyOwnerInput,
  ) {
    assertCanManageOwnership(role);
    try {
      const owner = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.propertyOwner.create({
          data: {
            organisationId,
            name: input.name.trim(),
            email: input.email?.trim().toLowerCase() || null,
            phone: input.phone?.trim() || null,
          },
        });
        await addAudit(transaction, organisationId, userId, 'property_owner.created', 'property_owner', created.id);
        return created;
      });
      return { owner };
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new ConflictException('A property owner with this email already exists in the organisation');
      }
      throw error;
    }
  }

  async updatePropertyOwner(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    ownerId: string,
    input: PropertyOwnerUpdateInput,
  ) {
    assertCanManageOwnership(role);
    if (Object.keys(input).length === 0) {
      throw new BadRequestException('Provide at least one property owner field to update');
    }
    try {
      const owner = await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.propertyOwner.findFirst({
          where: { id: ownerId, organisationId },
          select: { id: true },
        });
        if (!existing) throw new NotFoundException('Property owner was not found in this organisation');
        const updated = await transaction.propertyOwner.update({
          where: { id: ownerId },
          data: {
            name: input.name?.trim(),
            email: input.email === undefined ? undefined : input.email?.trim().toLowerCase() || null,
            phone: input.phone === undefined ? undefined : input.phone?.trim() || null,
          },
        });
        await addAudit(transaction, organisationId, userId, 'property_owner.updated', 'property_owner', ownerId, {
          changedFields: Object.keys(input),
        });
        return updated;
      });
      return { owner };
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new ConflictException('A property owner with this email already exists in the organisation');
      }
      throw error;
    }
  }

  async createProperty(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    input: PropertyInput,
  ) {
    assertCanManage(role);
    if (role === MembershipRole.MANAGER) {
      throw new ForbiddenException('Property managers can manage only their assigned properties');
    }
    if (input.propertyOwnerId) {
      const owner = await this.prisma.propertyOwner.findFirst({
        where: { id: input.propertyOwnerId, organisationId },
        select: { id: true },
      });
      if (!owner) throw new NotFoundException('Property owner was not found in this organisation');
    }
    const property = await this.prisma.$transaction(async (transaction) => {
      if (input.photoFileId) {
        const photo = await transaction.storedFile.findFirst({
          where: {
            id: input.photoFileId,
            organisationId,
            uploadStatus: 'UPLOADED',
            mimeType: { startsWith: 'image/' },
          },
          select: { id: true },
        });
        if (!photo) throw new BadRequestException('Select a successfully uploaded image for the property photo');
      }
      const created = await transaction.property.create({
        data: {
          organisationId,
          propertyOwnerId: input.propertyOwnerId,
          photoFileId: input.photoFileId,
          name: input.name.trim(),
          type: input.type,
          address: input.address.trim(),
          description: input.description?.trim() || null,
        },
      });
      await addAudit(transaction, organisationId, userId, 'property.created', 'property', created.id);
      return created;
    });
    return { property };
  }

  async updateProperty(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    propertyId: string,
    input: PropertyUpdateInput,
  ) {
    assertCanManage(role);
    if (Object.keys(input).length === 0) throw new BadRequestException('Provide at least one property field to update');
    if (
      role === MembershipRole.MANAGER &&
      input.propertyOwnerId !== undefined
    ) {
      throw new ForbiddenException('Only owners and administrators can change property ownership');
    }
    if (input.propertyOwnerId) {
      const owner = await this.prisma.propertyOwner.findFirst({
        where: { id: input.propertyOwnerId, organisationId },
        select: { id: true },
      });
      if (!owner) throw new NotFoundException('Property owner was not found in this organisation');
    }
    const property = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.property.findFirst({
        where: {
          id: propertyId,
          ...propertyScopeWhere(organisationId, role, userId),
        },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Property was not found in this organisation');
      if (input.photoFileId) {
        const photo = await transaction.storedFile.findFirst({
          where: {
            id: input.photoFileId,
            organisationId,
            uploadStatus: 'UPLOADED',
            mimeType: { startsWith: 'image/' },
          },
          select: { id: true },
        });
        if (!photo) throw new BadRequestException('Select a successfully uploaded image for the property photo');
      }
      if (input.status === 'ARCHIVED') {
        const activeTenancy = await transaction.tenancy.findFirst({
          where: {
            unit: { propertyId },
            status: { in: [TenancyStatus.UPCOMING, TenancyStatus.ACTIVE] },
          },
          select: { id: true },
        });
        if (activeTenancy) throw new ConflictException('Move out active tenants before archiving this property');
      }
      const updated = await transaction.property.update({
        where: { id: propertyId },
        data: {
          name: input.name?.trim(),
          type: input.type,
          address: input.address?.trim(),
          description: input.description === undefined ? undefined : input.description.trim() || null,
          propertyOwnerId: input.propertyOwnerId === undefined ? undefined : input.propertyOwnerId,
          photoFileId: input.photoFileId,
          status: input.status,
        },
      });
      await addAudit(transaction, organisationId, userId, 'property.updated', 'property', propertyId, {
        changedFields: Object.keys(input),
      });
      return updated;
    });
    return { property };
  }

  async listUnits(
    organisationId: string,
    role?: MembershipRole,
    userId?: string,
  ) {
    await this.syncTenancyStatuses(organisationId, role, userId);
    const today = dateOnly(new Date().toISOString());
    return {
      units: await this.prisma.unit.findMany({
        where: { property: propertyScopeWhere(organisationId, role, userId) },
        include: {
          property: { select: { id: true, name: true } },
          tenancies: {
            where: {
              status: TenancyStatus.ACTIVE,
              moveInDate: { lte: today },
              OR: [{ moveOutDate: null }, { moveOutDate: { gt: today } }],
            },
            select: { id: true, tenant: { select: { id: true, legalName: true } } },
            take: 1,
          },
        },
        orderBy: [{ property: { name: 'asc' } }, { unitNumber: 'asc' }],
      }),
    };
  }

  async createUnit(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    propertyId: string,
    input: UnitInput,
  ) {
    assertCanManage(role);
    const property = await this.prisma.property.findFirst({
      where: {
        id: propertyId,
        ...propertyScopeWhere(organisationId, role, userId),
      },
      select: { id: true },
    });
    if (!property) throw new NotFoundException('Property was not found in this organisation');

    try {
      const unit = await this.prisma.$transaction(async (transaction) => {
        await ensureTrialSubscription(transaction, organisationId);
        const subscription = await transaction.subscription.findUniqueOrThrow({
          where: { organisationId },
          include: { plan: { select: { unitLimit: true } } },
        });
        const activeUnitCount = await transaction.unit.count({
          where: {
            property: { organisationId },
            status: { not: UnitStatus.ARCHIVED },
          },
        });
        if (subscription.status === SubscriptionStatus.EXPIRED) {
          throw new ForbiddenException('Your trial has expired. Select a plan to add more units.');
        }
        if (
          subscription.plan.unitLimit !== null &&
          activeUnitCount >= subscription.plan.unitLimit
        ) {
          throw new ForbiddenException(
            `Your current plan allows up to ${subscription.plan.unitLimit} active units`,
          );
        }

        const created = await transaction.unit.create({
          data: {
            propertyId,
            unitNumber: input.unitNumber.trim(),
            floor: input.floor?.trim() || null,
            bedrooms: input.bedrooms,
            bathrooms: input.bathrooms,
            sizeSqm: input.sizeSqm === undefined ? null : new Prisma.Decimal(input.sizeSqm),
            utilityArrangement: input.utilityArrangement?.trim() || null,
            rentAmount: amount(input.rentAmount, 'Rent'),
            depositAmount: new Prisma.Decimal(input.depositAmount),
            status: input.status,
          },
        });
        await addAudit(transaction, organisationId, userId, 'unit.created', 'unit', created.id);
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return { unit };
    } catch (error) {
      if (isUniqueConflict(error)) throw new ConflictException('That unit number already exists at this property');
      throw error;
    }
  }

  async updateUnit(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    unitId: string,
    input: UnitUpdateInput,
  ) {
    assertCanManage(role);
    if (Object.keys(input).length === 0) throw new BadRequestException('Provide at least one unit field to update');
    if (input.status === UnitStatus.OCCUPIED) {
      throw new BadRequestException('Unit occupancy is managed by its active tenancy');
    }
    try {
      const unit = await this.prisma.$transaction(async (transaction) => {
        const existing = await transaction.unit.findFirst({
          where: {
            id: unitId,
            property: propertyScopeWhere(organisationId, role, userId),
          },
          select: { id: true, status: true },
        });
        if (!existing) throw new NotFoundException('Unit was not found in this organisation');
        if (existing.status === UnitStatus.ARCHIVED && input.status && input.status !== UnitStatus.ARCHIVED) {
          await ensureTrialSubscription(transaction, organisationId);
          const subscription = await transaction.subscription.findUniqueOrThrow({
            where: { organisationId },
            include: { plan: { select: { unitLimit: true } } },
          });
          const activeUnitCount = await transaction.unit.count({
            where: {
              property: { organisationId },
              status: { not: UnitStatus.ARCHIVED },
            },
          });
          if (
            subscription.plan.unitLimit !== null &&
            activeUnitCount >= subscription.plan.unitLimit
          ) {
            throw new ForbiddenException(
              `Your current plan allows up to ${subscription.plan.unitLimit} active units`,
            );
          }
        }
        if (input.status) {
          const currentTenancy = await transaction.tenancy.findFirst({
            where: {
              unitId,
              status: { in: [TenancyStatus.UPCOMING, TenancyStatus.ACTIVE] },
            },
            select: { id: true },
          });
          if (currentTenancy && input.status !== existing.status) {
            throw new ConflictException('A unit with a current tenancy cannot change availability status');
          }
        }
        const updated = await transaction.unit.update({
          where: { id: unitId },
          data: {
            unitNumber: input.unitNumber?.trim(),
            floor: input.floor === undefined ? undefined : input.floor.trim() || null,
            rentAmount: input.rentAmount ? amount(input.rentAmount, 'Rent') : undefined,
            depositAmount: input.depositAmount ? new Prisma.Decimal(input.depositAmount) : undefined,
            bedrooms: input.bedrooms,
            bathrooms: input.bathrooms,
            sizeSqm: input.sizeSqm === undefined ? undefined : new Prisma.Decimal(input.sizeSqm),
            utilityArrangement: input.utilityArrangement?.trim(),
            status: input.status,
          },
        });
        await addAudit(transaction, organisationId, userId, 'unit.updated', 'unit', unitId, {
          changedFields: Object.keys(input),
        });
        return updated;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return { unit };
    } catch (error) {
      if (isUniqueConflict(error)) throw new ConflictException('That unit number already exists at this property');
      throw error;
    }
  }

  async archiveUnit(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    unitId: string,
  ) {
    if (role !== MembershipRole.ADMIN) {
      throw new ForbiddenException('Only administrators can archive units');
    }
    await this.syncTenancyStatuses(organisationId, role, userId);
    const today = dateOnly(new Date().toISOString());
    return this.prisma.$transaction(async (transaction) => {
      const unit = await transaction.unit.findFirst({
        where: { id: unitId, property: { organisationId } },
        select: { id: true, status: true },
      });
      if (!unit) throw new NotFoundException('Unit was not found in this organisation');
      if (unit.status === UnitStatus.ARCHIVED) {
        throw new ConflictException('This unit is already archived');
      }
      const tenancy = await transaction.tenancy.findFirst({
        where: {
          unitId,
          OR: [
            {
              status: TenancyStatus.UPCOMING,
              moveInDate: { gt: today },
            },
            {
              status: TenancyStatus.ACTIVE,
              moveInDate: { lte: today },
              AND: [{ OR: [{ moveOutDate: null }, { moveOutDate: { gt: today } }] }],
            },
          ],
        },
        select: { id: true },
      });
      if (tenancy) {
        throw new ConflictException('Move out current and scheduled tenants before archiving this unit');
      }
      const archived = await transaction.unit.update({
        where: { id: unitId },
        data: { status: UnitStatus.ARCHIVED },
      });
      await addAudit(transaction, organisationId, userId, 'unit.archived', 'unit', unitId);
      return { unit: archived };
    });
  }

  async listTenants(
    organisationId: string,
    role?: MembershipRole,
    userId?: string,
  ) {
    await this.syncTenancyStatuses(organisationId, role, userId);
    const today = dateOnly(new Date().toISOString());
    return {
      tenants: await this.prisma.tenant.findMany({
        where: {
          organisationId,
          ...(role === MembershipRole.MANAGER
            ? {
                tenancies: {
                  some: {
                    unit: {
                      property: propertyScopeWhere(organisationId, role, userId),
                    },
                  },
                },
              }
            : {}),
        },
        select: {
          id: true,
          organisationId: role !== MembershipRole.ACCOUNTANT,
          userId: role !== MembershipRole.ACCOUNTANT,
          legalName: true,
          phone: role !== MembershipRole.ACCOUNTANT,
          email: role !== MembershipRole.ACCOUNTANT,
          emergencyContactName: role !== MembershipRole.ACCOUNTANT,
          emergencyContactPhone: role !== MembershipRole.ACCOUNTANT,
          createdAt: role !== MembershipRole.ACCOUNTANT,
          updatedAt: role !== MembershipRole.ACCOUNTANT,
          tenancies: {
            where: {
              status: { in: [TenancyStatus.UPCOMING, TenancyStatus.ACTIVE] },
              OR: [
                { status: TenancyStatus.UPCOMING, moveInDate: { gt: today } },
                {
                  status: TenancyStatus.ACTIVE,
                  moveInDate: { lte: today },
                  AND: [{ OR: [{ moveOutDate: null }, { moveOutDate: { gt: today } }] }],
                },
              ],
              ...(role === MembershipRole.MANAGER
                ? { unit: { property: propertyScopeWhere(organisationId, role, userId) } }
                : {}),
            },
            select: {
              id: true,
              status: true,
              moveInDate: true,
              moveOutDate: true,
              unit: {
                select: {
                  id: true,
                  unitNumber: true,
                  property: { select: { id: true, name: true } },
                },
              },
            },
            orderBy: { moveInDate: 'asc' },
            take: 1,
          },
        },
        orderBy: { legalName: 'asc' },
      }),
    };
  }

  async createTenant(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    input: TenantInput,
  ) {
    assertCanManage(role);
    const tenant = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.tenant.create({
        data: {
          organisationId,
          legalName: input.legalName.trim(),
          phone: input.phone?.trim() || null,
          email: input.email?.trim().toLowerCase() || null,
          emergencyContactName: input.emergencyContactName?.trim() || null,
          emergencyContactPhone: input.emergencyContactPhone?.trim() || null,
        },
      });
      await addAudit(transaction, organisationId, userId, 'tenant.created', 'tenant', created.id);
      return created;
    });
    return { tenant };
  }

  async archiveTenant(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    tenantId: string,
  ) {
    if (role !== MembershipRole.ADMIN) {
      throw new ForbiddenException('Only administrators can archive tenants');
    }
    await this.syncTenancyStatuses(organisationId, role, userId);
    const today = dateOnly(new Date().toISOString());
    return this.prisma.$transaction(async (transaction) => {
      const tenant = await transaction.tenant.findFirst({
        where: { id: tenantId, organisationId, archivedAt: null },
        select: { id: true },
      });
      if (!tenant) throw new NotFoundException('Tenant was not found in this organisation');
      const currentTenancy = await transaction.tenancy.findFirst({
        where: {
          tenantId,
          OR: [
            {
              status: TenancyStatus.UPCOMING,
              moveInDate: { gt: today },
            },
            {
              status: TenancyStatus.ACTIVE,
              moveInDate: { lte: today },
              AND: [{ OR: [{ moveOutDate: null }, { moveOutDate: { gt: today } }] }],
            },
          ],
        },
        select: { id: true },
      });
      if (currentTenancy) {
        throw new ConflictException('Record move-out before archiving this tenant');
      }
      const archived = await transaction.tenant.update({
        where: { id: tenantId },
        data: { archivedAt: new Date() },
      });
      await addAudit(transaction, organisationId, userId, 'tenant.archived', 'tenant', tenantId);
      return { tenant: archived };
    });
  }

  async updateTenant(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    tenantId: string,
    input: TenantUpdateInput,
  ) {
    assertCanManage(role);
    if (Object.keys(input).length === 0) throw new BadRequestException('Provide at least one tenant field to update');
    const tenant = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.tenant.findFirst({
        where: {
          id: tenantId,
          organisationId,
          ...(role === MembershipRole.MANAGER
            ? {
                tenancies: {
                  some: {
                    unit: {
                      property: propertyScopeWhere(organisationId, role, userId),
                    },
                  },
                },
              }
            : {}),
        },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Tenant was not found in this organisation');
      const updated = await transaction.tenant.update({
        where: { id: tenantId },
        data: {
          legalName: input.legalName?.trim(),
          phone: input.phone === undefined ? undefined : input.phone.trim() || null,
          email: input.email === undefined ? undefined : input.email.trim().toLowerCase() || null,
          emergencyContactName: input.emergencyContactName === undefined
            ? undefined
            : input.emergencyContactName.trim() || null,
          emergencyContactPhone: input.emergencyContactPhone === undefined
            ? undefined
            : input.emergencyContactPhone.trim() || null,
        },
      });
      await addAudit(transaction, organisationId, userId, 'tenant.updated', 'tenant', tenantId, {
        changedFields: Object.keys(input),
      });
      return updated;
    });
    return { tenant };
  }

  async listTenancies(
    organisationId: string,
    role?: MembershipRole,
    userId?: string,
  ) {
    await this.syncTenancyStatuses(organisationId, role, userId);
    return {
      tenancies: await this.prisma.tenancy.findMany({
        where: tenancyPropertyScope(organisationId, role, userId),
        include: {
          tenant: {
            select: {
              id: true,
              legalName: true,
              email: role !== MembershipRole.ACCOUNTANT,
              phone: role !== MembershipRole.ACCOUNTANT,
            },
          },
          unit: { select: { id: true, unitNumber: true, property: { select: { id: true, name: true } } } },
          leases: { orderBy: { endDate: 'desc' }, take: 1 },
          deposit: { select: { id: true, requiredAmount: true, heldBalance: true, status: true } },
        },
        orderBy: { moveInDate: 'desc' },
      }),
    };
  }

  async createTenancy(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    input: TenancyInput,
  ) {
    assertCanManage(role);
    const moveInDate = dateOnly(input.moveInDate);
    const moveOutDate = input.moveOutDate ? dateOnly(input.moveOutDate) : null;
    if (moveOutDate && moveOutDate < moveInDate) {
      throw new BadRequestException('Move-out date cannot be before move-in date');
    }
    const tenancy = await this.prisma.$transaction(async (transaction) => {
      const [tenant, unit] = await Promise.all([
        transaction.tenant.findFirst({
          where: { id: input.tenantId, organisationId, archivedAt: null },
        }),
        transaction.unit.findFirst({
          where: {
            id: input.unitId,
            property: propertyScopeWhere(organisationId, role, userId),
          },
        }),
      ]);
      if (!tenant || !unit) throw new NotFoundException('Tenant or unit was not found in this organisation');
      if (unit.status === UnitStatus.ARCHIVED || unit.status === UnitStatus.UNAVAILABLE) {
        throw new ConflictException('This unit is not available for a tenancy');
      }

      const conflicting = await transaction.tenancy.findFirst({
        where: {
          unitId: unit.id,
          status: { in: [TenancyStatus.UPCOMING, TenancyStatus.ACTIVE] },
          moveInDate: { lte: moveOutDate ?? new Date('9999-12-31T00:00:00.000Z') },
          OR: [{ moveOutDate: null }, { moveOutDate: { gte: moveInDate } }],
        },
        select: { id: true },
      });
      if (conflicting) throw new ConflictException('This unit already has a tenancy during those dates');

      const currentDate = dateOnly(new Date().toISOString());
      const status = moveOutDate && moveOutDate < currentDate
        ? TenancyStatus.ENDED
        : moveInDate > currentDate
          ? TenancyStatus.UPCOMING
          : TenancyStatus.ACTIVE;
      const created = await transaction.tenancy.create({
        data: {
          tenantId: tenant.id,
          unitId: unit.id,
          moveInDate,
          moveOutDate,
          status,
          deposit: {
            create: {
              requiredAmount: unit.depositAmount,
              receivedAmount: new Prisma.Decimal(0),
              heldBalance: new Prisma.Decimal(0),
              status: DepositStatus.NOT_RECEIVED,
            },
          },
        },
        include: { deposit: true },
      });
      if (status === TenancyStatus.ACTIVE) {
        await transaction.unit.update({
          where: { id: unit.id },
          data: { status: UnitStatus.OCCUPIED },
        });
      }
      await addAudit(transaction, organisationId, userId, 'tenancy.created', 'tenancy', created.id);
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { tenancy };
  }

  async moveOut(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    tenancyId: string,
    input: MoveOutInput,
  ) {
    assertCanManage(role);
    const moveOutDate = dateOnly(input.moveOutDate);
    const tenancy = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.tenancy.findFirst({
        where: {
          id: tenancyId,
          ...tenancyPropertyScope(organisationId, role, userId),
        },
      });
      if (!existing) throw new NotFoundException('Tenancy was not found in this organisation');
      if (
        existing.status === TenancyStatus.ENDED ||
        existing.status === TenancyStatus.TERMINATED
      ) {
        throw new ConflictException('This tenancy has already ended');
      }
      if (moveOutDate < existing.moveInDate) {
        throw new BadRequestException('Move-out date cannot be before move-in date');
      }
      const hasMovedOut = moveOutDate <= dateOnly(new Date().toISOString());
      const status = hasMovedOut ? TenancyStatus.ENDED : existing.status;
      const updated = await transaction.tenancy.update({
        where: { id: existing.id },
        data: { moveOutDate, status },
      });
      if (hasMovedOut) {
        await transaction.lease.updateMany({
          where: { tenancyId, status: LeaseStatus.ACTIVE },
          data: {
            status: LeaseStatus.TERMINATED,
            terminatedAt: new Date(),
            terminationReason: 'Tenancy moved out',
          },
        });
      }
      const otherCurrentTenancy = await transaction.tenancy.findFirst({
        where: {
          unitId: existing.unitId,
          id: { not: tenancyId },
          status: TenancyStatus.ACTIVE,
          moveInDate: { lte: dateOnly(new Date().toISOString()) },
          OR: [
            { moveOutDate: null },
            { moveOutDate: { gt: dateOnly(new Date().toISOString()) } },
          ],
        },
      });
      if (hasMovedOut && !otherCurrentTenancy) {
        await transaction.unit.update({
          where: { id: existing.unitId },
          data: { status: UnitStatus.AVAILABLE },
        });
      }
      await addAudit(transaction, organisationId, userId, 'tenancy.moved_out', 'tenancy', tenancyId, {
        moveOutDate: input.moveOutDate,
      });
      return updated;
    });
    return { tenancy };
  }

  async listLeases(
    organisationId: string,
    role?: MembershipRole,
    userId?: string,
  ) {
    return {
      leases: await this.prisma.lease.findMany({
        where: { tenancy: tenancyPropertyScope(organisationId, role, userId) },
        include: {
          documents: {
            select: { id: true, version: true, documentStatus: true, fileId: true, createdAt: true },
            orderBy: { version: 'desc' },
          },
          tenancy: {
            select: {
              id: true,
              tenant: { select: { id: true, legalName: true } },
              unit: { select: { unitNumber: true, property: { select: { name: true } } } },
            },
          },
        },
        orderBy: { endDate: 'asc' },
      }),
    };
  }

  async createLease(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    input: LeaseInput,
  ) {
    assertCanManage(role);
    const startDate = dateOnly(input.startDate);
    const endDate = dateOnly(input.endDate);
    if (endDate < startDate) throw new BadRequestException('Lease end date must be on or after its start date');
    if (input.status === LeaseStatus.ACTIVE && !input.signedAt) {
      throw new BadRequestException('A signed date is required before activating a lease');
    }
    const lease = await this.prisma.$transaction(async (transaction) => {
      const tenancy = await transaction.tenancy.findFirst({
        where: { id: input.tenancyId, unit: { property: { organisationId } } },
        select: { id: true, status: true },
      });
      if (!tenancy) throw new NotFoundException('Tenancy was not found in this organisation');
      if (tenancy.status === TenancyStatus.ENDED || tenancy.status === TenancyStatus.TERMINATED) {
        throw new ConflictException('A lease cannot be added to an ended tenancy');
      }
      if (input.status === LeaseStatus.ACTIVE) {
        const overlapping = await transaction.lease.findFirst({
          where: {
            tenancyId: tenancy.id,
            status: LeaseStatus.ACTIVE,
            startDate: { lte: endDate },
            endDate: { gte: startDate },
          },
        });
        if (overlapping) throw new ConflictException('An active lease already overlaps these dates');
      }
      const created = await transaction.lease.create({
        data: {
          tenancyId: tenancy.id,
          startDate,
          endDate,
          rentAmount: amount(input.rentAmount, 'Rent'),
          dueDay: input.dueDay,
          status: input.status ?? LeaseStatus.DRAFT,
          signedAt: input.signedAt ? new Date(input.signedAt) : null,
          terms: input.terms as Prisma.InputJsonValue | undefined,
        },
      });
      await addAudit(transaction, organisationId, userId, 'lease.created', 'lease', created.id);
      return created;
    });
    return { lease };
  }

  async updateLeaseStatus(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    leaseId: string,
    input: LeaseStatusInput,
  ) {
    assertCanManage(role);
    const lease = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.lease.findFirst({
        where: { id: leaseId, tenancy: { unit: { property: { organisationId } } } },
      });
      if (!existing) throw new NotFoundException('Lease was not found in this organisation');
      const today = dateOnly(new Date().toISOString());
      const allowedStatusChanges: Record<LeaseStatus, LeaseStatus[]> = {
        DRAFT: [LeaseStatus.DRAFT, LeaseStatus.ACTIVE, LeaseStatus.TERMINATED],
        ACTIVE: [LeaseStatus.ACTIVE, LeaseStatus.EXPIRED, LeaseStatus.TERMINATED],
        EXPIRED: [LeaseStatus.EXPIRED],
        TERMINATED: [LeaseStatus.TERMINATED],
      };
      if (!allowedStatusChanges[existing.status].includes(input.status)) {
        throw new ConflictException('This lease status transition is not allowed');
      }
      if (input.status === LeaseStatus.ACTIVE && existing.status !== LeaseStatus.DRAFT) {
        throw new ConflictException('Only a draft lease can be activated');
      }
      const signedAt = input.signedAt ? new Date(input.signedAt) : existing.signedAt;
      if (input.status === LeaseStatus.ACTIVE && !signedAt) {
        throw new BadRequestException('A signed date is required before activating this lease');
      }
      if (input.status === LeaseStatus.EXPIRED && existing.endDate >= today) {
        throw new ConflictException('A lease cannot be marked expired before its end date');
      }
      if (input.status === LeaseStatus.TERMINATED && !input.terminationReason?.trim()) {
        throw new BadRequestException('A reason is required to terminate a lease');
      }
      if (existing.status === LeaseStatus.EXPIRED || existing.status === LeaseStatus.TERMINATED) {
        throw new ConflictException('A historical lease cannot change status');
      }
      const updated = await transaction.lease.update({
        where: { id: leaseId },
        data: {
          status: input.status,
          signedAt,
          terminatedAt: input.status === LeaseStatus.TERMINATED ? new Date() : undefined,
          terminationReason: input.terminationReason?.trim(),
        },
      });
      await addAudit(transaction, organisationId, userId, 'lease.status_changed', 'lease', leaseId, {
        status: input.status,
      });
      return updated;
    });
    return { lease };
  }

  async attachLeaseDocument(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    leaseId: string,
    input: LeaseDocumentInput,
  ) {
    assertCanManage(role);
    const document = await this.prisma.$transaction(async (transaction) => {
      const lease = await transaction.lease.findFirst({
        where: { id: leaseId, tenancy: { unit: { property: { organisationId } } } },
        select: { id: true },
      });
      if (!lease) throw new NotFoundException('Lease was not found in this organisation');
      const file = await transaction.storedFile.findFirst({
        where: {
          id: input.fileId,
          organisationId,
          uploadStatus: 'UPLOADED',
        },
        select: { id: true },
      });
      if (!file) throw new NotFoundException('Uploaded document was not found in this organisation');
      const latest = await transaction.leaseDocument.findFirst({
        where: { leaseId },
        select: { version: true },
        orderBy: { version: 'desc' },
      });
      const created = await transaction.leaseDocument.create({
        data: {
          leaseId,
          fileId: file.id,
          version: (latest?.version ?? 0) + 1,
          documentStatus: input.documentStatus,
        },
      });
      await addAudit(transaction, organisationId, userId, 'lease.document_attached', 'lease_document', created.id, {
        version: created.version,
        documentStatus: created.documentStatus,
      });
      return created;
    });
    return { document };
  }

  async listInspections(
    organisationId: string,
    role?: MembershipRole,
    userId?: string,
  ) {
    return {
      inspections: await this.prisma.inspection.findMany({
        where: { unit: { property: propertyScopeWhere(organisationId, role, userId) } },
        include: {
          unit: { select: { id: true, unitNumber: true, property: { select: { name: true } } } },
          tenancy: { select: { tenant: { select: { legalName: true } } } },
          items: true,
          media: { select: { id: true, fileId: true, caption: true } },
        },
        orderBy: { inspectedAt: 'desc' },
      }),
    };
  }

  async createInspection(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    input: InspectionInput,
  ) {
    assertCanManage(role);
    const inspection = await this.prisma.$transaction(async (transaction) => {
      const unit = await transaction.unit.findFirst({
        where: { id: input.unitId, property: { organisationId } },
        select: { id: true },
      });
      if (!unit) throw new NotFoundException('Unit was not found in this organisation');
      if (input.tenancyId) {
        const tenancy = await transaction.tenancy.findFirst({
          where: {
            id: input.tenancyId,
            unitId: unit.id,
            unit: { property: { organisationId } },
          },
          select: { id: true },
        });
        if (!tenancy) throw new NotFoundException('Tenancy does not belong to this unit');
      }
      if (input.inspectorId) {
        const member = await transaction.organisationMember.findUnique({
          where: { organisationId_userId: { organisationId, userId: input.inspectorId } },
          select: { status: true },
        });
        if (member?.status !== MembershipStatus.ACTIVE) {
          throw new BadRequestException('Inspector must be an active organisation member');
        }
      }
      const created = await transaction.inspection.create({
        data: {
          unitId: unit.id,
          tenancyId: input.tenancyId,
          type: input.type,
          inspectorId: input.inspectorId,
          inspectedAt: new Date(input.inspectedAt),
          status: new Date(input.inspectedAt) > new Date()
            ? 'SCHEDULED'
            : 'COMPLETED',
          items: {
            create: (input.items ?? []).map((item) => ({
              area: item.area.trim(),
              condition: item.condition.trim(),
              notes: item.notes?.trim() || null,
            })),
          },
        },
        include: { items: true },
      });
      await addAudit(transaction, organisationId, userId, 'inspection.completed', 'inspection', created.id);
      return created;
    });
    return { inspection };
  }

  async attachInspectionMedia(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    inspectionId: string,
    input: InspectionMediaInput,
  ) {
    assertCanManage(role);
    const media = await this.prisma.$transaction(async (transaction) => {
      const inspection = await transaction.inspection.findFirst({
        where: { id: inspectionId, unit: { property: { organisationId } } },
        select: { id: true },
      });
      if (!inspection) throw new NotFoundException('Inspection was not found in this organisation');
      const file = await transaction.storedFile.findFirst({
        where: {
          id: input.fileId,
          organisationId,
          uploadStatus: 'UPLOADED',
        },
        select: { id: true },
      });
      if (!file) throw new NotFoundException('Uploaded photo was not found in this organisation');
      const created = await transaction.inspectionMedia.create({
        data: {
          inspectionId,
          fileId: file.id,
          caption: input.caption?.trim() || null,
        },
      });
      await addAudit(transaction, organisationId, userId, 'inspection.media_attached', 'inspection_media', created.id);
      return created;
    });
    return { media };
  }

  async listCharges(organisationId: string, role?: MembershipRole, userId?: string) {
    return {
      charges: await this.prisma.rentCharge.findMany({
        where: { tenancy: tenancyPropertyScope(organisationId, role, userId) },
        include: {
          allocations: {
            where: { payment: { reversedAt: null } },
            select: { allocatedAmount: true, payment: { select: { id: true, receivedAt: true, method: true } } },
          },
          tenancy: {
            select: {
              id: true,
              tenant: { select: { id: true, legalName: true } },
              unit: { select: { unitNumber: true, property: { select: { name: true } } } },
            },
          },
        },
        orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }],
      }),
    };
  }

  async createCharge(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    input: ChargeInput,
  ) {
    assertCanManage(role);
    try {
      const charge = await this.prisma.$transaction(async (transaction) => {
        const tenancy = await transaction.tenancy.findFirst({
          where: { id: input.tenancyId, unit: { property: { organisationId } } },
          select: { id: true, status: true },
        });
        if (!tenancy || tenancy.status === TenancyStatus.ENDED || tenancy.status === TenancyStatus.TERMINATED) {
          throw new NotFoundException('Active tenancy was not found in this organisation');
        }
        const value = amount(input.amount, 'Charge');
        const created = await transaction.rentCharge.create({
          data: {
            tenancyId: tenancy.id,
            period: input.period,
            dueDate: dateOnly(input.dueDate),
            amount: value,
            balance: value,
            status: dateOnly(input.dueDate) < dateOnly(new Date().toISOString())
              ? RentChargeStatus.OVERDUE
              : RentChargeStatus.PENDING,
          },
        });
        await addAudit(transaction, organisationId, userId, 'rent_charge.created', 'rent_charge', created.id);
        return created;
      });
      return { charge };
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new ConflictException('A rent charge already exists for this tenancy and period');
      }
      throw error;
    }
  }

  async voidCharge(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    chargeId: string,
    input: ReversalInput,
  ) {
    assertCanManage(role);
    const charge = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.rentCharge.findFirst({
        where: { id: chargeId, tenancy: { unit: { property: { organisationId } } } },
        include: { allocations: { where: { payment: { reversedAt: null } } } },
      });
      if (!existing) throw new NotFoundException('Rent charge was not found in this organisation');
      if (existing.status === RentChargeStatus.VOID) {
        throw new ConflictException('This rent charge has already been voided');
      }
      if (existing.allocations.length) {
        throw new ConflictException('Reverse allocated payments before voiding this charge');
      }
      const updated = await transaction.rentCharge.update({
        where: { id: chargeId },
        data: { status: RentChargeStatus.VOID },
      });
      await addAudit(transaction, organisationId, userId, 'rent_charge.voided', 'rent_charge', chargeId, {
        reason: input.reason.trim(),
      });
      return updated;
    });
    return { charge };
  }

  async listPayments(organisationId: string, role?: MembershipRole, userId?: string) {
    return {
      payments: await this.prisma.payment.findMany({
        where: {
          organisationId,
          ...(role === MembershipRole.MANAGER
            ? {
                allocations: {
                  some: {
                    rentCharge: {
                      tenancy: tenancyPropertyScope(organisationId, role, userId),
                    },
                  },
                },
              }
            : {}),
        },
        include: {
          tenant: { select: { id: true, legalName: true } },
          allocations: {
            where:
              role === MembershipRole.MANAGER
                ? {
                    rentCharge: {
                      tenancy: tenancyPropertyScope(organisationId, role, userId),
                    },
                  }
                : undefined,
            include: { rentCharge: { select: { id: true, period: true, amount: true } } },
          },
        },
        orderBy: { receivedAt: 'desc' },
      }),
    };
  }

  async createPayment(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    input: PaymentInput,
  ) {
    assertCanManage(role);
    const paymentAmount = amount(input.amount, 'Payment');
    const allocationTotal = input.allocations.reduce(
      (total, allocation) => total.plus(amount(allocation.amount, 'Allocation')),
      new Prisma.Decimal(0),
    );
    if (allocationTotal.gt(paymentAmount)) {
      throw new BadRequestException('Payment allocations cannot exceed the payment amount');
    }
    if (new Set(input.allocations.map(({ rentChargeId }) => rentChargeId)).size !== input.allocations.length) {
      throw new BadRequestException('Each rent charge can only be allocated once per payment');
    }

    const payment = await this.prisma.$transaction(async (transaction) => {
      const tenant = await transaction.tenant.findFirst({
        where: { id: input.tenantId, organisationId },
        select: { id: true },
      });
      if (!tenant) throw new NotFoundException('Tenant was not found in this organisation');
      const charges = await transaction.rentCharge.findMany({
        where: {
          id: { in: input.allocations.map(({ rentChargeId }) => rentChargeId) },
          tenancy: {
            tenantId: tenant.id,
            unit: { property: { organisationId } },
          },
          status: { not: RentChargeStatus.VOID },
        },
        select: { id: true, balance: true, dueDate: true },
      });
      if (charges.length !== input.allocations.length) {
        throw new NotFoundException('One or more rent charges do not belong to this tenant');
      }
      const byId = new Map(charges.map((charge) => [charge.id, charge]));
      for (const allocation of input.allocations) {
        const charge = byId.get(allocation.rentChargeId);
        if (!charge || amount(allocation.amount, 'Allocation').gt(charge.balance)) {
          throw new ConflictException('An allocation cannot exceed its rent charge balance');
        }
      }

      const created = await transaction.payment.create({
        data: {
          organisationId,
          tenantId: tenant.id,
          amount: paymentAmount,
          method: input.method,
          reference: input.reference?.trim() || null,
          receivedAt: new Date(input.receivedAt),
          recordedBy: userId,
        },
      });
      for (const allocation of input.allocations) {
        const allocatedAmount = amount(allocation.amount, 'Allocation');
        const charge = byId.get(allocation.rentChargeId)!;
        const balance = charge.balance.minus(allocatedAmount);
        await transaction.paymentAllocation.create({
          data: {
            paymentId: created.id,
            rentChargeId: charge.id,
            allocatedAmount,
          },
        });
        await transaction.rentCharge.update({
          where: { id: charge.id },
          data: {
            balance,
            status: balance.isZero()
              ? RentChargeStatus.PAID
              : charge.dueDate < dateOnly(new Date().toISOString())
                ? RentChargeStatus.OVERDUE
                : RentChargeStatus.PARTIALLY_PAID,
          },
        });
      }
      await addAudit(transaction, organisationId, userId, 'payment.recorded', 'payment', created.id, {
        amount: paymentAmount.toString(),
        allocationCount: input.allocations.length,
        manualRecord: true,
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { payment };
  }

  async reversePayment(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    paymentId: string,
    input: ReversalInput,
  ) {
    assertCanManage(role);
    const payment = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.payment.findFirst({
        where: { id: paymentId, organisationId },
        include: { allocations: { include: { rentCharge: true } } },
      });
      if (!existing) throw new NotFoundException('Payment was not found in this organisation');
      if (existing.reversedAt) throw new ConflictException('This payment has already been reversed');
      for (const allocation of existing.allocations) {
        const balance = allocation.rentCharge.balance.plus(allocation.allocatedAmount);
        await transaction.rentCharge.update({
          where: { id: allocation.rentChargeId },
          data: {
            balance,
            status: allocation.rentCharge.status === RentChargeStatus.VOID
              ? RentChargeStatus.VOID
              : balance.isZero()
                ? RentChargeStatus.PAID
                : balance.lt(allocation.rentCharge.amount)
                  ? RentChargeStatus.PARTIALLY_PAID
                  : allocation.rentCharge.dueDate < dateOnly(new Date().toISOString())
                    ? RentChargeStatus.OVERDUE
                    : RentChargeStatus.PENDING,
          },
        });
      }
      const updated = await transaction.payment.update({
        where: { id: paymentId },
        data: {
          reversedAt: new Date(),
          reversedBy: userId,
          reversalReason: input.reason.trim(),
        },
      });
      await addAudit(transaction, organisationId, userId, 'payment.reversed', 'payment', paymentId, {
        reason: input.reason.trim(),
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { payment };
  }

  async paymentReceipt(organisationId: string, userId: string, paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, organisationId },
      include: {
        tenant: { select: { legalName: true } },
        organisation: { select: { name: true, currency: true } },
        allocations: {
          include: {
            rentCharge: {
              select: {
                period: true,
                tenancy: {
                  select: {
                    unit: {
                      select: { unitNumber: true, property: { select: { name: true } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!payment) throw new NotFoundException('Payment was not found in this organisation');
    await this.prisma.auditLog.create({
      data: {
        organisationId,
        userId,
        action: 'payment.receipt_downloaded',
        entityType: 'payment',
        entityId: paymentId,
      },
    });
    return payment;
  }

  async listDeposits(organisationId: string, role?: MembershipRole, userId?: string) {
    return {
      deposits: await this.prisma.deposit.findMany({
        where: { tenancy: tenancyPropertyScope(organisationId, role, userId) },
        include: {
          transactions: { orderBy: { date: 'desc' } },
          tenancy: {
            select: {
              id: true,
              tenant: { select: { legalName: true } },
              unit: { select: { unitNumber: true, property: { select: { name: true } } } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
    };
  }

  async addDepositTransaction(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    depositId: string,
    input: DepositTransactionInput,
  ) {
    assertCanManage(role);
    const transactionResult = await this.prisma.$transaction(async (transaction) => {
      const deposit = await transaction.deposit.findFirst({
        where: { id: depositId, tenancy: { unit: { property: { organisationId } } } },
      });
      if (!deposit) throw new NotFoundException('Deposit was not found in this organisation');
      const value = amount(input.amount, 'Deposit transaction');
      let receivedAmount = deposit.receivedAmount;
      let heldBalance = deposit.heldBalance;
      if (input.type === DepositTransactionType.RECEIPT) {
        if (receivedAmount.plus(value).gt(deposit.requiredAmount)) {
          throw new ConflictException('Deposit receipt exceeds the required deposit amount');
        }
        receivedAmount = receivedAmount.plus(value);
        heldBalance = heldBalance.plus(value);
      } else if (
        input.type === DepositTransactionType.REFUND ||
        input.type === DepositTransactionType.DEDUCTION
      ) {
        if (value.gt(heldBalance)) throw new ConflictException('Transaction exceeds the deposit held balance');
        heldBalance = heldBalance.minus(value);
      } else {
        receivedAmount = receivedAmount.plus(value);
        heldBalance = heldBalance.plus(value);
      }
      const status = heldBalance.isZero()
        ? receivedAmount.isZero()
          ? DepositStatus.NOT_RECEIVED
          : DepositStatus.REFUNDED
        : heldBalance.lt(receivedAmount)
          ? DepositStatus.PARTIALLY_REFUNDED
          : receivedAmount.lt(deposit.requiredAmount)
            ? DepositStatus.PARTIALLY_RECEIVED
            : DepositStatus.HELD;
      const updated = await transaction.deposit.update({
        where: { id: deposit.id },
        data: { receivedAmount, heldBalance, status },
      });
      const created = await transaction.depositTransaction.create({
        data: {
          depositId: deposit.id,
          type: input.type,
          amount: value,
          date: dateOnly(input.date),
          reason: input.reason.trim(),
          recordedBy: userId,
        },
      });
      await addAudit(transaction, organisationId, userId, 'deposit.transaction_recorded', 'deposit', deposit.id, {
        transactionType: input.type,
        amount: value.toString(),
      });
      return { deposit: updated, transaction: created };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return transactionResult;
  }

  async listExpenses(organisationId: string, role?: MembershipRole, userId?: string) {
    return {
      expenses: await this.prisma.expense.findMany({
        where: { property: propertyScopeWhere(organisationId, role, userId) },
        include: { property: { select: { id: true, name: true } } },
        orderBy: { date: 'desc' },
      }),
    };
  }

  async createExpense(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    input: ExpenseInput,
  ) {
    assertCanManage(role);
    const expense = await this.prisma.$transaction(async (transaction) => {
      const property = await transaction.property.findFirst({
        where: { id: input.propertyId, organisationId },
        select: { id: true },
      });
      if (!property) throw new NotFoundException('Property was not found in this organisation');
      if (input.evidenceFileId) {
        const file = await transaction.storedFile.findFirst({
          where: {
            id: input.evidenceFileId,
            organisationId,
            uploadStatus: 'UPLOADED',
          },
          select: { id: true },
        });
        if (!file) throw new NotFoundException('Uploaded expense evidence was not found in this organisation');
      }
      const created = await transaction.expense.create({
        data: {
          propertyId: property.id,
          category: input.category.trim(),
          amount: amount(input.amount, 'Expense'),
          date: dateOnly(input.date),
          supplier: input.supplier?.trim() || null,
          evidenceFileId: input.evidenceFileId,
        },
      });
      await addAudit(transaction, organisationId, userId, 'expense.created', 'expense', created.id);
      return created;
    });
    return { expense };
  }

  async attachExpenseEvidence(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    expenseId: string,
    input: FileEvidenceInput,
  ) {
    assertCanManage(role);
    const expense = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.expense.findFirst({
        where: { id: expenseId, property: { organisationId } },
        select: { id: true, evidenceFileId: true },
      });
      if (!existing) throw new NotFoundException('Expense was not found in this organisation');
      if (existing.evidenceFileId) throw new ConflictException('Evidence is already attached to this expense');
      const file = await transaction.storedFile.findFirst({
        where: { id: input.fileId, organisationId, uploadStatus: 'UPLOADED' },
        select: { id: true },
      });
      if (!file) throw new NotFoundException('Uploaded expense evidence was not found in this organisation');
      const updated = await transaction.expense.update({
        where: { id: expenseId },
        data: { evidenceFileId: file.id },
      });
      await addAudit(transaction, organisationId, userId, 'expense.evidence_attached', 'expense', expenseId);
      return updated;
    });
    return { expense };
  }

  async reverseExpense(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    expenseId: string,
    input: ReversalInput,
  ) {
    assertCanManage(role);
    const expense = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.expense.findFirst({
        where: { id: expenseId, property: { organisationId } },
        select: { id: true, reversedAt: true },
      });
      if (!existing) throw new NotFoundException('Expense was not found in this organisation');
      if (existing.reversedAt) throw new ConflictException('This expense has already been reversed');
      const updated = await transaction.expense.update({
        where: { id: expenseId },
        data: { reversedAt: new Date(), reversedBy: userId, reversalReason: input.reason.trim() },
      });
      await addAudit(transaction, organisationId, userId, 'expense.reversed', 'expense', expenseId, {
        reason: input.reason.trim(),
      });
      return updated;
    });
    return { expense };
  }

  async reverseUtilityBill(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    billId: string,
    input: ReversalInput,
  ) {
    assertCanManage(role);
    const utilityBill = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.utilityBill.findFirst({
        where: { id: billId, property: { organisationId } },
        select: { id: true, reversedAt: true },
      });
      if (!existing) throw new NotFoundException('Utility bill was not found in this organisation');
      if (existing.reversedAt) throw new ConflictException('This utility bill has already been reversed');
      const updated = await transaction.utilityBill.update({
        where: { id: billId },
        data: { reversedAt: new Date(), reversedBy: userId, reversalReason: input.reason.trim() },
      });
      await addAudit(transaction, organisationId, userId, 'utility_bill.reversed', 'utility_bill', billId, {
        reason: input.reason.trim(),
      });
      return updated;
    });
    return { utilityBill };
  }

  async listUtilities(organisationId: string, role?: MembershipRole, userId?: string) {
    return {
      utilityBills: await this.prisma.utilityBill.findMany({
        where: { property: propertyScopeWhere(organisationId, role, userId) },
        include: {
          property: { select: { id: true, name: true } },
          allocations: { include: { unit: { select: { id: true, unitNumber: true } } } },
        },
        orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
      }),
    };
  }

  async createUtilityBill(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    input: UtilityInput,
  ) {
    assertCanManage(role);
    const total = amount(input.totalAmount, 'Utility bill');
    const allocationTotal = input.allocations.reduce(
      (sum, allocation) => sum.plus(amount(allocation.amount, 'Utility allocation')),
      new Prisma.Decimal(0),
    );
    if (!allocationTotal.eq(total)) {
      throw new BadRequestException('Utility allocations must add up to the bill total');
    }
    if (new Set(input.allocations.map(({ unitId }) => unitId)).size !== input.allocations.length) {
      throw new BadRequestException('Each unit can only be allocated once per utility bill');
    }
    try {
      const utilityBill = await this.prisma.$transaction(async (transaction) => {
        const property = await transaction.property.findFirst({
          where: { id: input.propertyId, organisationId },
          select: { id: true },
        });
        if (!property) throw new NotFoundException('Property was not found in this organisation');
        if (input.evidenceFileId) {
          const file = await transaction.storedFile.findFirst({
            where: {
              id: input.evidenceFileId,
              organisationId,
              uploadStatus: 'UPLOADED',
            },
            select: { id: true },
          });
          if (!file) throw new NotFoundException('Uploaded utility evidence was not found in this organisation');
        }
        const units = await transaction.unit.findMany({
          where: { id: { in: input.allocations.map(({ unitId }) => unitId) }, propertyId: property.id },
          select: { id: true },
        });
        if (units.length !== input.allocations.length) {
          throw new NotFoundException('One or more utility units do not belong to this property');
        }
        const created = await transaction.utilityBill.create({
          data: {
            propertyId: property.id,
            utilityType: input.utilityType.trim(),
            period: input.period,
            totalAmount: total,
            allocations: {
              create: input.allocations.map((allocation) => ({
                unitId: allocation.unitId,
                allocatedAmount: amount(allocation.amount, 'Utility allocation'),
                calculationMethod: allocation.calculationMethod.trim(),
              })),
            },
          },
          include: { allocations: true },
        });
        await addAudit(transaction, organisationId, userId, 'utility_bill.created', 'utility_bill', created.id);
        return created;
      });
      return { utilityBill };
    } catch (error) {
      if (isUniqueConflict(error)) throw new ConflictException('A utility bill already exists for this type and period');
      throw error;
    }
  }

  async attachUtilityEvidence(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    billId: string,
    input: FileEvidenceInput,
  ) {
    assertCanManage(role);
    const utilityBill = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.utilityBill.findFirst({
        where: { id: billId, property: { organisationId } },
        select: { id: true, evidenceFileId: true },
      });
      if (!existing) throw new NotFoundException('Utility bill was not found in this organisation');
      if (existing.evidenceFileId) throw new ConflictException('Evidence is already attached to this utility bill');
      const file = await transaction.storedFile.findFirst({
        where: { id: input.fileId, organisationId, uploadStatus: 'UPLOADED' },
        select: { id: true },
      });
      if (!file) throw new NotFoundException('Uploaded utility evidence was not found in this organisation');
      const updated = await transaction.utilityBill.update({
        where: { id: billId },
        data: { evidenceFileId: file.id },
      });
      await addAudit(transaction, organisationId, userId, 'utility_bill.evidence_attached', 'utility_bill', billId);
      return updated;
    });
    return { utilityBill };
  }

  async listMaintenance(
    organisationId: string,
    role?: MembershipRole,
    userId?: string,
  ) {
    return {
      requests: await this.prisma.maintenanceRequest.findMany({
        where: {
          unit: { property: propertyScopeWhere(organisationId, role, userId) },
          ...(role === MembershipRole.MAINTENANCE_STAFF
            ? { assignedToUserId: userId }
            : {}),
        },
        include: {
          tenant: { select: { id: true, legalName: true } },
          unit: { select: { id: true, unitNumber: true, property: { select: { id: true, name: true } } } },
          expenses: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    };
  }

  async createMaintenance(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    input: MaintenanceInput,
  ) {
    assertCanManage(role);
    const request = await this.prisma.$transaction(async (transaction) => {
      const unit = await transaction.unit.findFirst({
        where: { id: input.unitId, property: { organisationId } },
        select: { id: true },
      });
      if (!unit) throw new NotFoundException('Unit was not found in this organisation');
      if (input.tenantId) {
        const tenancy = await transaction.tenancy.findFirst({
          where: {
            tenantId: input.tenantId,
            unitId: unit.id,
            status: TenancyStatus.ACTIVE,
          },
          select: { id: true },
        });
        if (!tenancy) throw new BadRequestException('Tenant is not currently assigned to this unit');
      }
      const created = await transaction.maintenanceRequest.create({
        data: {
          unitId: unit.id,
          tenantId: input.tenantId,
          category: input.category.trim(),
          description: input.description.trim(),
          priority: input.priority,
        },
      });
      await addAudit(transaction, organisationId, userId, 'maintenance.created', 'maintenance_request', created.id);
      return created;
    });
    return { request };
  }

  async updateMaintenance(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    requestId: string,
    input: MaintenanceUpdateInput,
  ) {
    assertCanManage(role);
    const request = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.maintenanceRequest.findFirst({
        where: { id: requestId, unit: { property: { organisationId } } },
      });
      if (!existing) throw new NotFoundException('Maintenance request was not found in this organisation');
      const allowed: Record<MaintenanceStatus, MaintenanceStatus[]> = {
        SUBMITTED: [MaintenanceStatus.SUBMITTED, MaintenanceStatus.APPROVED, MaintenanceStatus.ASSIGNED, MaintenanceStatus.REJECTED],
        APPROVED: [MaintenanceStatus.APPROVED, MaintenanceStatus.ASSIGNED, MaintenanceStatus.IN_PROGRESS, MaintenanceStatus.REJECTED],
        ASSIGNED: [MaintenanceStatus.ASSIGNED, MaintenanceStatus.IN_PROGRESS, MaintenanceStatus.REJECTED],
        IN_PROGRESS: [MaintenanceStatus.IN_PROGRESS, MaintenanceStatus.COMPLETED, MaintenanceStatus.REJECTED],
        COMPLETED: [MaintenanceStatus.COMPLETED],
        REJECTED: [MaintenanceStatus.REJECTED],
      };
      if (!allowed[existing.status].includes(input.status)) {
        throw new ConflictException(`Cannot move a ${existing.status.toLowerCase()} request to ${input.status.toLowerCase()}`);
      }
      if (input.assignedToUserId) {
        const membership = await transaction.organisationMember.findUnique({
          where: {
            organisationId_userId: {
              organisationId,
              userId: input.assignedToUserId,
            },
          },
          select: { status: true, role: true },
        });
        if (
          membership?.status !== MembershipStatus.ACTIVE ||
          membership.role !== MembershipRole.MAINTENANCE_STAFF
        ) {
          throw new BadRequestException('Assignee must be an active maintenance staff member');
        }
      }
      if (input.actualCost && input.status !== MaintenanceStatus.COMPLETED) {
        throw new BadRequestException('Actual cost can be recorded when completing the request');
      }
      if (input.invoiceFileId && !input.actualCost) {
        throw new BadRequestException('An invoice must be attached with an actual cost');
      }
      if (input.invoiceFileId) {
        const file = await transaction.storedFile.findFirst({
          where: {
            id: input.invoiceFileId,
            organisationId,
            uploadStatus: 'UPLOADED',
          },
          select: { id: true },
        });
        if (!file) throw new NotFoundException('Uploaded maintenance invoice was not found in this organisation');
      }
      if (
        input.actualCost &&
        existing.actualCost &&
        !existing.actualCost.eq(new Prisma.Decimal(input.actualCost))
      ) {
        throw new ConflictException('Maintenance actual cost has already been recorded');
      }
      const updated = await transaction.maintenanceRequest.update({
        where: { id: existing.id },
        data: {
          status: input.status,
          assignedToUserId: input.assignedToUserId,
          estimatedCost: input.estimatedCost ? amount(input.estimatedCost, 'Estimated cost') : undefined,
          actualCost: input.actualCost ? amount(input.actualCost, 'Actual cost') : undefined,
          resolutionNotes: input.resolutionNotes?.trim(),
          completedAt: input.status === MaintenanceStatus.COMPLETED ? new Date() : undefined,
        },
      });
      if (input.actualCost && !existing.actualCost) {
        await transaction.maintenanceExpense.create({
          data: {
            requestId: existing.id,
            amount: amount(input.actualCost, 'Actual cost'),
            invoiceFileId: input.invoiceFileId,
          },
        });
      }
      await addAudit(transaction, organisationId, userId, 'maintenance.updated', 'maintenance_request', requestId, {
        status: input.status,
      });
      return updated;
    });
    return { request };
  }

  async listNotices(organisationId: string, role?: MembershipRole, userId?: string) {
    return {
      notices: await this.prisma.notice.findMany({
        where: { tenancy: tenancyPropertyScope(organisationId, role, userId) },
        include: {
          tenancy: {
            select: {
              tenant: { select: { legalName: true } },
              unit: { select: { unitNumber: true, property: { select: { name: true } } } },
            },
          },
        },
        orderBy: { issueDate: 'desc' },
      }),
    };
  }

  async createNotice(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    input: NoticeInput,
  ) {
    assertCanManage(role);
    if (input.effectiveDate && dateOnly(input.effectiveDate) < dateOnly(input.issueDate)) {
      throw new BadRequestException('Effective date cannot be before issue date');
    }
    const notice = await this.prisma.$transaction(async (transaction) => {
      const tenancy = await transaction.tenancy.findFirst({
        where: { id: input.tenancyId, unit: { property: { organisationId } } },
        select: { id: true, tenant: { select: { email: true } } },
      });
      if (!tenancy) throw new NotFoundException('Tenancy was not found in this organisation');
      const created = await transaction.notice.create({
        data: {
          tenancyId: tenancy.id,
          type: input.type,
          issueDate: dateOnly(input.issueDate),
          effectiveDate: input.effectiveDate ? dateOnly(input.effectiveDate) : null,
          deliveryStatus: DeliveryStatus.DRAFT,
          issuerUserId: userId,
          recipient: input.recipient?.trim().toLowerCase() || tenancy.tenant.email,
          reason: input.reason.trim(),
          deliveryMethod: input.deliveryMethod?.trim() || null,
        },
      });
      await addAudit(transaction, organisationId, userId, 'notice.created', 'notice', created.id);
      return created;
    });
    return { notice };
  }

  async getFinancialReport(
    organisationId: string,
    from?: string,
    to?: string,
    ownerId?: string,
    role?: MembershipRole,
    userId?: string,
  ) {
    const fromDate = from ? dateOnly(from) : new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
    const toDate = to ? dateOnly(to) : new Date(Date.UTC(new Date().getUTCFullYear(), 11, 31));
    if (toDate < fromDate) throw new BadRequestException('Report end date must not be before its start date');
    let propertyOwner: { id: string; name: string } | null = null;
    if (ownerId) {
      propertyOwner = await this.prisma.propertyOwner.findFirst({
        where: { id: ownerId, organisationId },
        select: { id: true, name: true },
      });
      if (!propertyOwner) throw new NotFoundException('Property owner was not found in this organisation');
    }
    const propertyScope: Prisma.PropertyWhereInput = {
      ...propertyScopeWhere(organisationId, role, userId),
      ...(ownerId ? { propertyOwnerId: ownerId } : {}),
    };
    const paymentScope: Prisma.PaymentWhereInput = {
      organisationId,
      reversedAt: null,
      receivedAt: { gte: fromDate, lte: toDate },
      ...(ownerId
        ? {
            allocations: {
              some: {
                rentCharge: {
                  tenancy: { unit: { property: propertyScope } },
                },
              },
            },
          }
        : {}),
    };
    const [
      charges,
      payments,
      allocatedPayments,
      currentOutstanding,
      expenses,
      maintenanceExpenses,
      deposits,
      occupancy,
    ] = await Promise.all([
      this.prisma.rentCharge.aggregate({
        where: {
          tenancy: { unit: { property: propertyScope } },
          dueDate: { gte: fromDate, lte: toDate },
          status: { not: RentChargeStatus.VOID },
        },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: paymentScope,
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.paymentAllocation.aggregate({
        where: {
          payment: {
            ...paymentScope,
            ...(ownerId
              ? {
                  allocations: {
                    some: {
                      rentCharge: {
                        tenancy: { unit: { property: propertyScope } },
                      },
                    },
                  },
                }
              : {}),
          },
          ...(ownerId
            ? {
                rentCharge: {
                  tenancy: { unit: { property: propertyScope } },
                },
              }
            : {}),
        },
        _sum: { allocatedAmount: true },
      }),
      this.prisma.rentCharge.aggregate({
        where: {
          tenancy: { unit: { property: propertyScope } },
          status: { in: [RentChargeStatus.PENDING, RentChargeStatus.PARTIALLY_PAID, RentChargeStatus.OVERDUE] },
        },
        _sum: { balance: true },
      }),
      this.prisma.expense.aggregate({
        where: { property: propertyScope, reversedAt: null, date: { gte: fromDate, lte: toDate } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.maintenanceExpense.aggregate({
        where: {
          request: { unit: { property: propertyScope } },
          createdAt: { gte: fromDate, lte: toDate },
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.deposit.aggregate({
        where: { tenancy: { unit: { property: propertyScope } } },
        _sum: { receivedAmount: true, heldBalance: true },
      }),
      this.prisma.unit.groupBy({
        by: ['status'],
        where: { property: propertyScope, status: { not: UnitStatus.ARCHIVED } },
        _count: { _all: true },
      }),
    ]);
    const occupancyCounts = Object.fromEntries(
      occupancy.map((row) => [row.status, row._count._all]),
    ) as Record<string, number>;
    const allocated = allocatedPayments._sum.allocatedAmount ?? new Prisma.Decimal(0);
    const collected = ownerId
      ? allocated
      : payments._sum.amount ?? new Prisma.Decimal(0);
    const ordinaryExpenseTotal = expenses._sum.amount ?? new Prisma.Decimal(0);
    const maintenanceExpenseTotal = maintenanceExpenses._sum.amount ?? new Prisma.Decimal(0);
    return {
      period: { from: fromDate.toISOString().slice(0, 10), to: toDate.toISOString().slice(0, 10) },
      ...(propertyOwner ? { propertyOwner } : {}),
      rent: {
        charged: charges._sum.amount?.toString() ?? '0',
        outstanding: currentOutstanding._sum.balance?.toString() ?? '0',
        collected: collected.toString(),
        appliedToCharges: allocated.toString(),
        unapplied: collected.minus(allocated).toString(),
        paymentCount: payments._count._all,
      },
      expenses: {
        total: ordinaryExpenseTotal.plus(maintenanceExpenseTotal).toString(),
        propertyExpenses: ordinaryExpenseTotal.toString(),
        maintenanceExpenses: maintenanceExpenseTotal.toString(),
        count: expenses._count._all + maintenanceExpenses._count._all,
      },
      deposits: {
        received: deposits._sum.receivedAmount?.toString() ?? '0',
        held: deposits._sum.heldBalance?.toString() ?? '0',
      },
      occupancy: {
        total: Object.values(occupancyCounts).reduce((sum, count) => sum + count, 0),
        occupied: occupancyCounts.OCCUPIED ?? 0,
        available: occupancyCounts.AVAILABLE ?? 0,
      },
    };
  }

  async getTeam(organisationId: string) {
    const now = new Date();
    const [members, invitations] = await Promise.all([
      this.prisma.organisationMember.findMany({
        where: { organisationId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              propertyAssignments: {
                where: { property: { organisationId } },
                select: {
                  property: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
        orderBy: [{ role: 'asc' }, { invitedAt: 'asc' }],
      }),
      this.prisma.organisationInvitation.findMany({
        where: { organisationId, acceptedAt: null, expiresAt: { gt: now } },
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
          expiresAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return {
      members: [
        ...members,
        ...invitations.map((invitation) => ({
          id: invitation.id,
          role: invitation.role,
          status: MembershipStatus.INVITED,
          invitedAt: invitation.createdAt,
          expiresAt: invitation.expiresAt,
          user: {
            id: invitation.id,
            name: invitation.email,
            email: invitation.email,
            propertyAssignments: [],
          },
        })),
      ],
    };
  }

  async inviteTeamMember(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    input: TeamInviteInput,
  ) {
    assertCanManage(role);
    if (input.role === MembershipRole.OWNER) {
      throw new BadRequestException('A team invitation cannot grant the owner role');
    }
    if (input.role === MembershipRole.STAFF) {
      throw new BadRequestException('Assign a specific team role instead of generic staff');
    }
    if (input.role === MembershipRole.MANAGER && !input.propertyIds?.length) {
      throw new BadRequestException('Assign at least one property to a property manager');
    }
    if (input.role !== MembershipRole.MANAGER && input.propertyIds?.length) {
      throw new BadRequestException('Property assignments are only valid for property managers');
    }
    if (
      role === MembershipRole.MANAGER ||
      (role === MembershipRole.ADMIN && restrictedAdminGrants.has(input.role))
    ) {
      throw new ForbiddenException('Your role cannot grant that team permission');
    }
    const email = input.email.trim().toLowerCase();
    const target = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    const sender = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true },
    });
    const organisation = await this.prisma.organisation.findUniqueOrThrow({
      where: { id: organisationId },
      select: { name: true },
    });
    const appUrl =
      this.config.get<string>('WEB_APP_URL')?.trim() ||
      this.config.getOrThrow<string>('APP_ORIGINS').split(',')[0].trim();

    if (!target) {
      const propertyIds = input.propertyIds ?? [];
      if (propertyIds.length) {
        const properties = await this.prisma.property.findMany({
          where: { organisationId, id: { in: propertyIds } },
          select: { id: true },
        });
        if (properties.length !== propertyIds.length) {
          throw new NotFoundException(
            'One or more assigned properties were not found in this organisation',
          );
        }
      }
      const token = randomBytes(32).toString('hex');
      const invitation = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.organisationInvitation.upsert({
          where: { organisationId_email: { organisationId, email } },
          create: {
            organisationId,
            invitedByUserId: userId,
            email,
            role: input.role,
            propertyIds,
            tokenHash: this.hashInvitationToken(token),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
          update: {
            invitedByUserId: userId,
            role: input.role,
            propertyIds,
            tokenHash: this.hashInvitationToken(token),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            acceptedAt: null,
          },
          select: { id: true },
        });
        await transaction.auditLog.create({
          data: {
            organisationId,
            userId,
            action: 'team.member_invited',
            entityType: 'organisation_invitation',
            entityId: created.id,
          },
        });
        return created;
      });
      const invitationUrl = new URL('/register', appUrl);
      invitationUrl.searchParams.set('invitation', token);
      try {
        await this.email.send(
          email,
          `Invitation to join ${organisation.name} on PropEase`,
          [
            `${sender.name} invited you to join ${organisation.name} on PropEase as ${input.role}.`,
            '',
            `Create your account using this link within 7 days: ${invitationUrl.toString()}`,
            '',
            'This invitation is intended only for the recipient of this email.',
          ].join('\n'),
        );
      } catch (error) {
        this.logger.error(
          `Invitation email could not be sent for organisation ${organisationId}`,
          error instanceof Error ? error.stack : undefined,
        );
        throw new ServiceUnavailableException(
          'The invitation was saved, but its email could not be sent. Check SMTP settings and retry the invitation.',
        );
      }
      return { invitation: { id: invitation.id, email, role: input.role } };
    }

    if (target.id === userId) throw new BadRequestException('You cannot invite yourself');
    const member = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.organisationMember.findUnique({
        where: { organisationId_userId: { organisationId, userId: target.id } },
        select: { status: true },
      });
      if (existing?.status === MembershipStatus.ACTIVE) {
        throw new ConflictException('This user is already an active team member');
      }
      const created = await transaction.organisationMember.upsert({
        where: { organisationId_userId: { organisationId, userId: target.id } },
        create: {
          organisationId,
          userId: target.id,
          role: input.role,
          status: MembershipStatus.INVITED,
        },
        update: {
          role: input.role,
          status: MembershipStatus.INVITED,
          invitedAt: new Date(),
          joinedAt: null,
        },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      await setPropertyAssignments(
        transaction,
        organisationId,
        target.id,
        input.role,
        input.propertyIds ?? [],
      );
      await addAudit(transaction, organisationId, userId, 'team.member_invited', 'organisation_member', target.id, {
        role: input.role,
        propertyIds: input.propertyIds ?? [],
      });
      return created;
    });
    try {
      await this.email.send(
        email,
        `Invitation to join ${organisation.name} on PropEase`,
        [
          `${sender.name} invited you to join ${organisation.name} on PropEase as ${input.role}.`,
          '',
          `Sign in to PropEase to accept the invitation: ${new URL('/login', appUrl).toString()}`,
        ].join('\n'),
      );
    } catch (error) {
      this.logger.error(
        `Invitation email could not be sent for organisation ${organisationId}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'The invitation was saved, but its email could not be sent. Check SMTP settings and retry the invitation.',
      );
    }
    return { member };
  }

  private hashInvitationToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async changeTeamRole(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    memberId: string,
    input: TeamRoleInput,
  ) {
    assertCanManage(role);
    if (memberId === userId) {
      throw new BadRequestException('You cannot change your own team role');
    }
    if (input.role === MembershipRole.OWNER) {
      throw new BadRequestException('Use organisation ownership transfer to change an owner');
    }
    if (input.role === MembershipRole.STAFF) {
      throw new BadRequestException('Assign a specific team role instead of generic staff');
    }
    if (
      role === MembershipRole.MANAGER ||
      (role === MembershipRole.ADMIN && restrictedAdminGrants.has(input.role))
    ) {
      throw new ForbiddenException('Your role cannot grant that team permission');
    }
    const member = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.organisationMember.findUnique({
        where: { organisationId_userId: { organisationId, userId: memberId } },
      });
      if (!existing) throw new NotFoundException('Team member was not found in this organisation');
      if (existing.role === MembershipRole.OWNER) {
        throw new ForbiddenException('The organisation owner role cannot be changed here');
      }
      if (role === MembershipRole.ADMIN && existing.role === MembershipRole.ADMIN) {
        throw new ForbiddenException('Administrators cannot change another administrator role');
      }
      if (input.role === MembershipRole.MANAGER && existing.role !== MembershipRole.MANAGER && !input.propertyIds?.length) {
        throw new BadRequestException('Assign at least one property to a property manager');
      }
      if (input.role !== MembershipRole.MANAGER && input.propertyIds?.length) {
        throw new BadRequestException('Property assignments are only valid for property managers');
      }
      const updated = await transaction.organisationMember.update({
        where: { organisationId_userId: { organisationId, userId: memberId } },
        data: { role: input.role },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      if (input.propertyIds !== undefined || existing.role !== input.role) {
        await setPropertyAssignments(
          transaction,
          organisationId,
          memberId,
          input.role,
          input.propertyIds ?? [],
        );
      }
      await addAudit(transaction, organisationId, userId, 'team.member_role_changed', 'organisation_member', memberId, {
        role: input.role,
        propertyIds: input.propertyIds ?? [],
      });
      return updated;
    });
    return { member };
  }

  async removeTeamMember(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    memberId: string,
  ) {
    assertCanManage(role);
    if (memberId === userId) {
      throw new BadRequestException('You cannot remove yourself from the organisation');
    }

    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.organisationMember.findUnique({
        where: { organisationId_userId: { organisationId, userId: memberId } },
      });

      if (existing) {
        if (
          existing.role === MembershipRole.OWNER ||
          (role === MembershipRole.ADMIN && existing.role === MembershipRole.ADMIN)
        ) {
          throw new ForbiddenException('Your role cannot remove this team member');
        }
        const member = await transaction.organisationMember.update({
          where: { organisationId_userId: { organisationId, userId: memberId } },
          data: { status: MembershipStatus.SUSPENDED },
          include: { user: { select: { id: true, name: true, email: true } } },
        });
        await transaction.propertyAssignment.deleteMany({
          where: { userId: memberId, property: { organisationId } },
        });
        await addAudit(
          transaction,
          organisationId,
          userId,
          'team.member_suspended',
          'organisation_member',
          memberId,
        );
        return { member };
      }

      const invitation = await transaction.organisationInvitation.findFirst({
        where: {
          id: memberId,
          organisationId,
          acceptedAt: null,
        },
        select: { id: true, role: true },
      });
      if (!invitation) {
        throw new NotFoundException('Team member was not found in this organisation');
      }
      if (
        invitation.role === MembershipRole.OWNER ||
        (role === MembershipRole.ADMIN && invitation.role === MembershipRole.ADMIN)
      ) {
        throw new ForbiddenException('Your role cannot remove this team member');
      }
      await transaction.organisationInvitation.delete({
        where: { id: invitation.id },
      });
      await addAudit(
        transaction,
        organisationId,
        userId,
        'team.invitation_revoked',
        'organisation_invitation',
        invitation.id,
      );
      return { invitation: { id: invitation.id, status: 'REVOKED' } };
    });
  }

  async acceptTeamInvitation(organisationId: string, userId: string) {
    const member = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.organisationMember.updateMany({
        where: {
          organisationId,
          userId,
          status: MembershipStatus.INVITED,
        },
        data: { status: MembershipStatus.ACTIVE, joinedAt: new Date() },
      });
      if (result.count !== 1) {
        throw new NotFoundException('No pending invitation was found for this account');
      }
      await addAudit(transaction, organisationId, userId, 'team.invitation_accepted', 'organisation_member', userId);
      return transaction.organisationMember.findUniqueOrThrow({
        where: { organisationId_userId: { organisationId, userId } },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
    });
    return { member };
  }

  async getSettings(organisationId: string) {
    const [organisation, auditLogs] = await Promise.all([
      this.prisma.organisation.findUnique({
        where: { id: organisationId },
        select: { id: true, name: true, type: true, country: true, currency: true, createdAt: true },
      }),
      this.prisma.auditLog.findMany({
        where: { organisationId },
        select: { id: true, action: true, entityType: true, entityId: true, createdAt: true, user: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    if (!organisation) throw new NotFoundException('Organisation was not found');
    return { organisation, auditLogs };
  }

  async updateSettings(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    input: OrganisationSettingsInput,
  ) {
    if (role !== MembershipRole.OWNER && role !== MembershipRole.ADMIN) {
      throw new ForbiddenException('Only organisation owners and admins can update settings');
    }
    const organisation = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.organisation.update({
        where: { id: organisationId },
        data: {
          name: input.name.trim(),
          country: input.country,
          currency: input.currency,
        },
        select: { id: true, name: true, type: true, country: true, currency: true },
      });
      await addAudit(transaction, organisationId, userId, 'organisation.settings_updated', 'organisation', organisationId);
      return updated;
    });
    return { organisation };
  }

  async getSubscription(organisationId: string) {
    await this.prisma.$transaction((transaction) =>
      ensureTrialSubscription(transaction, organisationId),
    );
    let subscription = await this.prisma.subscription.findUnique({
      where: { organisationId },
      include: {
        plan: true,
        invoices: {
          include: { payments: true, plan: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!subscription) throw new NotFoundException('Subscription was not found');
    const graceEnd = subscription.nextBillingDate
      ? new Date(dateOnly(subscription.nextBillingDate.toISOString()).getTime() + 3 * 86400000)
      : null;
    if (
      subscription.status === SubscriptionStatus.TRIALING &&
      graceEnd &&
      dateOnly(new Date().toISOString()) > graceEnd
    ) {
      subscription = await this.prisma.subscription.update({
        where: { organisationId },
        data: { status: SubscriptionStatus.EXPIRED },
        include: {
          plan: true,
          invoices: {
            include: { payments: true, plan: true },
            orderBy: { createdAt: 'desc' },
          },
        },
      });
    }
    const [activeUnits, plans] = await Promise.all([
      this.prisma.unit.count({
        where: { property: { organisationId }, status: { not: UnitStatus.ARCHIVED } },
      }),
      this.prisma.plan.findMany({
        where: { isActive: true },
        select: { id: true, slug: true, name: true, monthlyPrice: true, annualPrice: true, unitLimit: true, features: true },
        orderBy: { monthlyPrice: 'asc' },
      }),
    ]);
    return { subscription, activeUnits, plans };
  }

  async selectPlan(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    input: { planSlug: string; billingCycle: BillingCycle },
  ) {
    if (role !== MembershipRole.OWNER) {
      throw new ForbiddenException('Only the organisation owner can change the subscription');
    }
    if (input.planSlug === 'enterprise') {
      throw new BadRequestException('Contact PropEase to request an Enterprise plan');
    }
    const result = await this.prisma.$transaction(async (transaction) => {
      await ensureTrialSubscription(transaction, organisationId);
      const [plan, subscription, activeUnits] = await Promise.all([
        transaction.plan.findFirst({ where: { slug: input.planSlug, isActive: true } }),
        transaction.subscription.findUniqueOrThrow({ where: { organisationId } }),
        transaction.unit.count({
          where: { property: { organisationId }, status: { not: UnitStatus.ARCHIVED } },
        }),
      ]);
      if (!plan) throw new NotFoundException('Subscription plan was not found');
      if (plan.slug === 'free-trial') throw new BadRequestException('The trial plan cannot be selected as a paid plan');
      if (plan.unitLimit !== null && activeUnits > plan.unitLimit) {
        throw new ConflictException(`Your portfolio has ${activeUnits} active units; this plan allows ${plan.unitLimit}`);
      }
      const price = input.billingCycle === BillingCycle.ANNUAL ? plan.annualPrice : plan.monthlyPrice;
      if (price.lte(0)) throw new BadRequestException('This plan requires a custom quote');
      const dueDate = new Date();
      dueDate.setUTCDate(dueDate.getUTCDate() + 7);
      const invoice = await transaction.subscriptionInvoice.create({
        data: {
          subscriptionId: subscription.id,
          planId: plan.id,
          billingCycle: input.billingCycle,
          invoiceNumber: `PE-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
          amount: price,
          dueDate: dateOnly(dueDate.toISOString()),
          status: InvoiceStatus.OPEN,
        },
      });
      await addAudit(transaction, organisationId, userId, 'subscription.plan_selected', 'subscription', subscription.id, {
        plan: plan.slug,
        billingCycle: input.billingCycle,
        invoiceId: invoice.id,
      });
      return { invoice, plan };
    });
    return result;
  }

  async submitSubscriptionPayment(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    invoiceId: string,
    input: SubscriptionPaymentInput,
  ) {
    if (role !== MembershipRole.OWNER) {
      throw new ForbiddenException('Only the organisation owner can submit subscription payment details');
    }
    const subscriptionPayment = await this.prisma.$transaction(async (transaction) => {
      const invoice = await transaction.subscriptionInvoice.findFirst({
        where: {
          id: invoiceId,
          subscription: { organisationId },
          status: { in: [InvoiceStatus.OPEN, InvoiceStatus.OVERDUE] },
        },
        select: {
          id: true,
          amount: true,
          payments: {
            where: { verificationStatus: { in: ['PENDING', 'VERIFIED'] } },
            select: { amount: true },
          },
        },
      });
      if (!invoice) throw new NotFoundException('Open subscription invoice was not found in this organisation');
      const proofFile = await transaction.storedFile.findFirst({
        where: {
          id: input.proofFileId,
          organisationId,
          uploadStatus: 'UPLOADED',
        },
        select: { id: true },
      });
      if (!proofFile) throw new NotFoundException('Uploaded payment proof was not found in this organisation');
      const paymentAmount = amount(input.amount, 'Subscription payment');
      const alreadySubmitted = invoice.payments.reduce(
        (sum, payment) => sum.plus(payment.amount),
        new Prisma.Decimal(0),
      );
      if (alreadySubmitted.plus(paymentAmount).gt(invoice.amount)) {
        throw new ConflictException('Submitted subscription payments exceed the invoice total');
      }
      const created = await transaction.subscriptionPayment.create({
        data: {
          invoiceId: invoice.id,
          method: input.method,
          reference: input.reference.trim(),
          amount: paymentAmount,
          proofFileId: proofFile.id,
          verificationStatus: 'PENDING',
          receivedAt: new Date(),
        },
      });
      await addAudit(transaction, organisationId, userId, 'subscription.payment_submitted', 'subscription_payment', created.id, {
        invoiceId: invoice.id,
        amount: paymentAmount.toString(),
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { subscriptionPayment };
  }
}
