import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { LeaseStatus, Prisma, TenancyStatus, UnitStatus } from '@prisma/client';
import type { Job } from 'bullmq';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { rentChargesQueue } from './rent-charges.constants.js';
import { applyUnallocatedPaymentCredits } from './rent-credits.js';

export function getRentChargePeriod(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function getRentDueDate(date: Date, dueDay: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const finalDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(dueDay, finalDay)));
}

@Injectable()
@Processor(rentChargesQueue)
export class RentChargesProcessor extends WorkerHost {
  private readonly logger = new Logger(RentChargesProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'generate-monthly-rent-charges') {
      await this.generateMonthlyCharges(new Date());
      return;
    }
    if (job.name === 'daily-rent-follow-up') {
      const now = new Date();
      await this.activateAcceptedLeases(now);
      await this.activateUpcomingTenancies(now);
      await this.updateOverdueCharges();
      await this.enqueueUpcomingRentReminders(new Date());
      return;
    }
    throw new Error(`Unsupported rent charge job: ${job.name}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error): void {
    if (job) {
      this.logger.error(`Rent job ${job.name} (${job.id}) failed`, error.stack);
    }
  }

  private async generateMonthlyCharges(now: Date): Promise<void> {
    const period = getRentChargePeriod(now);
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const monthEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
    );
    const leases = await this.prisma.lease.findMany({
      where: {
        status: 'ACTIVE',
        startDate: { lte: monthEnd },
        endDate: { gte: monthStart },
        tenancy: {
          is: {
            status: 'ACTIVE',
            moveInDate: { lte: monthEnd },
            OR: [{ moveOutDate: null }, { moveOutDate: { gte: monthStart } }],
          },
        },
      },
      select: {
        tenancyId: true,
        dueDay: true,
        rentAmount: true,
        tenancy: {
          select: {
            property: { select: { organisationId: true } },
          },
        },
      },
    });

    for (const lease of leases) {
      try {
        await this.prisma.$transaction(async (transaction) => {
          const charge = await transaction.rentCharge.create({
            data: {
              tenancyId: lease.tenancyId,
              period,
              dueDate: getRentDueDate(now, lease.dueDay),
              amount: lease.rentAmount,
              balance: lease.rentAmount,
            },
            select: { id: true },
          });
          await transaction.auditLog.create({
            data: {
              organisationId: lease.tenancy.property.organisationId,
              action: 'rent_charge.generated',
              entityType: 'rent_charge',
              entityId: charge.id,
            },
          });
          await applyUnallocatedPaymentCredits(
            transaction,
            charge.id,
            lease.tenancy.property.organisationId,
          );
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue;
        }
        throw error;
      }
    }
  }

  private async updateOverdueCharges(): Promise<void> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await this.prisma.rentCharge.updateMany({
      where: {
        dueDate: { lt: today },
        balance: { gt: 0 },
        status: { in: ['PENDING', 'PARTIALLY_PAID'] },
      },
      data: { status: 'OVERDUE' },
    });
  }

  private async activateAcceptedLeases(now: Date): Promise<void> {
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const leases = await this.prisma.lease.findMany({
      where: {
        status: LeaseStatus.TENANT_ACCEPTED,
        startDate: { lte: today },
        endDate: { gte: today },
        tenancy: {
          is: {
            status: { in: [TenancyStatus.UPCOMING, TenancyStatus.ACTIVE] },
            OR: [{ moveOutDate: null }, { moveOutDate: { gte: today } }],
          },
        },
      },
      select: {
        id: true,
        tenancy: {
          select: {
            id: true,
            unitId: true,
            moveInDate: true,
            property: { select: { organisationId: true } },
          },
        },
      },
    });

    for (const lease of leases) {
      await this.prisma.$transaction(async (transaction) => {
        const activated = await transaction.lease.updateMany({
          where: {
            id: lease.id,
            status: LeaseStatus.TENANT_ACCEPTED,
            startDate: { lte: today },
            endDate: { gte: today },
          },
          data: { status: LeaseStatus.ACTIVE },
        });
        if (activated.count !== 1) return;

        if (lease.tenancy.moveInDate <= today) {
          const tenancy = await transaction.tenancy.updateMany({
            where: {
              id: lease.tenancy.id,
              status: TenancyStatus.UPCOMING,
              moveInDate: { lte: today },
            },
            data: { status: TenancyStatus.ACTIVE },
          });
          if (tenancy.count === 1 && lease.tenancy.unitId) {
            await transaction.unit.updateMany({
              where: {
                id: lease.tenancy.unitId,
                status: { not: UnitStatus.ARCHIVED },
              },
              data: { status: UnitStatus.OCCUPIED },
            });
          }
        }

        await transaction.auditLog.create({
          data: {
            organisationId: lease.tenancy.property.organisationId,
            action: 'lease.activated',
            entityType: 'lease',
            entityId: lease.id,
          },
        });
      });
    }
  }

  private async activateUpcomingTenancies(now: Date): Promise<void> {
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const tenancies = await this.prisma.tenancy.findMany({
      where: {
        status: TenancyStatus.UPCOMING,
        moveInDate: { lte: today },
        OR: [{ moveOutDate: null }, { moveOutDate: { gte: today } }],
        leases: {
          some: {
            status: LeaseStatus.ACTIVE,
            startDate: { lte: today },
            endDate: { gte: today },
          },
        },
      },
      select: {
        id: true,
        unitId: true,
        property: { select: { organisationId: true } },
      },
    });

    for (const tenancy of tenancies) {
      await this.prisma.$transaction(async (transaction) => {
        const activated = await transaction.tenancy.updateMany({
          where: {
            id: tenancy.id,
            status: TenancyStatus.UPCOMING,
            moveInDate: { lte: today },
          },
          data: { status: TenancyStatus.ACTIVE },
        });
        if (activated.count !== 1) return;

        if (tenancy.unitId) {
          await transaction.unit.updateMany({
            where: {
              id: tenancy.unitId,
              status: { not: UnitStatus.ARCHIVED },
            },
            data: { status: UnitStatus.OCCUPIED },
          });
        }

        await transaction.auditLog.create({
          data: {
            organisationId: tenancy.property.organisationId,
            action: 'tenancy.activated',
            entityType: 'tenancy',
            entityId: tenancy.id,
          },
        });
      });
    }
  }

  private async enqueueUpcomingRentReminders(now: Date): Promise<void> {
    const reminderDate = new Date(now);
    reminderDate.setUTCHours(0, 0, 0, 0);
    reminderDate.setUTCDate(reminderDate.getUTCDate() + 3);
    const charges = await this.prisma.rentCharge.findMany({
      where: {
        dueDate: { gte: reminderDate, lte: reminderDate },
        balance: { gt: 0 },
        status: { in: ['PENDING', 'PARTIALLY_PAID'] },
        tenancy: {
          is: {
            tenant: { is: { userId: { not: null } } },
          },
        },
      },
      select: {
        id: true,
        period: true,
        balance: true,
        dueDate: true,
        tenancy: {
          select: {
            tenant: {
              select: { userId: true, legalName: true },
            },
            property: {
              select: { name: true, organisationId: true },
            },
            unit: {
              select: { unitNumber: true },
            },
            rentalSpaceLabel: true,
          },
        },
      },
    });

    const reminderDateKey = reminderDate.toISOString().slice(0, 10);
    for (const charge of charges) {
      const userId = charge.tenancy.tenant.userId;
      if (!userId) {
        continue;
      }
      const property = charge.tenancy.property;
      const rentalSpace =
        charge.tenancy.unit?.unitNumber ??
        charge.tenancy.rentalSpaceLabel ??
        'rental space';
      await this.notifications.enqueueEmail({
        userId,
        organisationId: property.organisationId,
        template: 'rent_reminder',
        subject: `Rent due soon for ${property.name}`,
        text: [
          `Hello ${charge.tenancy.tenant.legalName},`,
          '',
          `Your rent balance of RWF ${charge.balance.toFixed(2)} for ${property.name}, ${rentalSpace}, is due on ${charge.dueDate.toISOString().slice(0, 10)}.`,
          `Rent period: ${charge.period}.`,
          '',
          'Please contact your property manager if you have already made this payment.',
        ].join('\n'),
        deduplicationKey: `rent-reminder:${charge.id}:${reminderDateKey}`,
      });
    }
  }
}
