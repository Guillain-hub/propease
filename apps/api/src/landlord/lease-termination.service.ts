import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LeaseStatus, MembershipRole, Prisma, TenancyStatus } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import {
  CreateLeaseTerminationRequestInput,
  LeaseTerminationResponseInput,
} from './dto/lease-termination.dto.js';

const managers = new Set<MembershipRole>([
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
  MembershipRole.MANAGER,
]);
const responseLifetimeMs = 7 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function todayUtc(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function assertCanRequest(role?: MembershipRole): void {
  if (!role || !managers.has(role)) {
    throw new ForbiddenException(
      'Your organisation role cannot request lease termination',
    );
  }
}

@Injectable()
export class LeaseTerminationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  async request(
    organisationId: string,
    userId: string,
    role: MembershipRole | undefined,
    leaseId: string,
    input: CreateLeaseTerminationRequestInput,
  ) {
    assertCanRequest(role);
    const lease = await this.prisma.lease.findFirst({
      where: {
        id: leaseId,
        tenancy: { property: { organisationId } },
      },
      select: {
        id: true,
        status: true,
        tenancy: {
          select: {
            tenant: { select: { legalName: true, email: true } },
            property: { select: { name: true } },
            unit: { select: { unitNumber: true } },
          },
        },
      },
    });
    if (!lease) throw new NotFoundException('Lease was not found');
    if (
      lease.status !== LeaseStatus.ACTIVE &&
      lease.status !== LeaseStatus.TENANT_ACCEPTED
    ) {
      throw new ConflictException(
        'Only an active or tenant-accepted lease can be submitted for termination',
      );
    }
    const tenantEmail = lease.tenancy.tenant.email?.trim();
    if (!tenantEmail) {
      throw new ConflictException(
        'Add an email address to the tenant record before requesting termination',
      );
    }

    const now = new Date();
    const token = randomBytes(32).toString('base64url');
    const terminationDate = todayUtc(now);
    const expiresAt = new Date(now.getTime() + responseLifetimeMs);
    const reason = input.reason.trim();
    const request = await this.prisma.$transaction(async (transaction) => {
      const activeRequest =
        await transaction.leaseTerminationRequest.findFirst({
          where: {
            leaseId,
            respondedAt: null,
            accepted: null,
            expiresAt: { gt: now },
          },
          select: { id: true },
        });
      if (activeRequest) {
        throw new ConflictException(
          'A lease termination request is already awaiting the tenant’s response',
        );
      }

      const created = await transaction.leaseTerminationRequest.create({
        data: {
          leaseId,
          requestedByUserId: userId,
          tokenHash: hashToken(token),
          terminationDate,
          reason,
          expiresAt,
        },
        select: { id: true, expiresAt: true },
      });
      await transaction.auditLog.create({
        data: {
          organisationId,
          userId,
          action: 'lease.termination_requested',
          entityType: 'lease',
          entityId: leaseId,
          metadata: {
            terminationRequestId: created.id,
            terminationDate: terminationDate.toISOString().slice(0, 10),
          },
        },
      });
      return created;
    });

    const webAppUrl = this.config.getOrThrow<string>('WEB_APP_URL').replace(/\/+$/, '');
    const reviewUrl = `${webAppUrl}/lease-termination-review?token=${encodeURIComponent(token)}`;
    const unitLabel = lease.tenancy.unit
      ? `Unit ${lease.tenancy.unit.unitNumber}`
      : lease.tenancy.property.name;
    const subject = 'Please confirm your lease termination';
    const message = [
      `Hello ${lease.tenancy.tenant.legalName},`,
      '',
      `Your property manager has requested to terminate your lease for ${unitLabel} at ${lease.tenancy.property.name}.`,
      `Reason: ${reason}`,
      '',
      'The lease will be terminated effective on the date you agree to this request. If you do not agree, choose the decline option on the secure page.',
      `Review and respond within 7 days: ${reviewUrl}`,
      '',
      'If you did not expect this request, contact your property manager before responding.',
    ].join('\n');

    try {
      await this.email.send(tenantEmail, subject, message);
    } catch (error) {
      await this.prisma.leaseTerminationRequest.delete({
        where: { id: request.id },
      });
      throw error;
    }

    return {
      request: {
        id: request.id,
        status: 'PENDING',
        expiresAt: request.expiresAt,
      },
    };
  }

  async getPublicRequest(token: string) {
    const request = await this.findPublicRequest(token);
    if (!request.respondedAt && request.expiresAt <= new Date()) {
      throw new GoneException('This lease termination request has expired');
    }
    return {
      status: request.respondedAt
        ? request.accepted
          ? 'ACCEPTED'
          : 'DECLINED'
        : 'PENDING',
      tenantName: request.lease.tenancy.tenant.legalName,
      propertyName: request.lease.tenancy.property.name,
      unitLabel: request.lease.tenancy.unit
        ? `Unit ${request.lease.tenancy.unit.unitNumber}`
        : request.lease.tenancy.property.name,
      reason: request.reason,
      expiresAt: request.expiresAt,
      respondedAt: request.respondedAt,
    };
  }

  async respond(token: string, input: LeaseTerminationResponseInput) {
    const now = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const request = await transaction.leaseTerminationRequest.findUnique({
        where: { tokenHash: hashToken(token) },
        include: {
          lease: {
            select: {
              id: true,
              status: true,
              tenancyId: true,
              tenancy: {
                select: {
                  property: { select: { organisationId: true } },
                },
              },
            },
          },
        },
      });
      if (!request) {
        throw new NotFoundException('Lease termination link was not found');
      }
      if (request.respondedAt) {
        throw new ConflictException(
          'You have already responded to this lease termination request',
        );
      }
      if (request.expiresAt <= now) {
        throw new GoneException('This lease termination request has expired');
      }

      const update = await transaction.leaseTerminationRequest.updateMany({
        where: {
          id: request.id,
          respondedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          accepted: input.accepted,
          respondedAt: now,
          ...(input.accepted ? { terminationDate: todayUtc(now) } : {}),
        },
      });
      if (update.count !== 1) {
        throw new ConflictException(
          'This lease termination request has already been answered',
        );
      }

      if (input.accepted) {
        if (
          request.lease.status !== LeaseStatus.ACTIVE &&
          request.lease.status !== LeaseStatus.TENANT_ACCEPTED
        ) {
          throw new ConflictException(
            'This lease can no longer be terminated through this request',
          );
        }
        await transaction.lease.update({
          where: { id: request.leaseId },
          data: {
            status: LeaseStatus.TERMINATED,
            terminatedAt: now,
            terminationReason: request.reason,
          },
        });
        await transaction.tenancy.update({
          where: { id: request.lease.tenancyId },
          data: {
            status: TenancyStatus.ENDED,
            moveOutDate: todayUtc(now),
          },
        });
      }

      await transaction.auditLog.create({
        data: {
          organisationId: request.lease.tenancy.property.organisationId,
          userId: request.requestedByUserId,
          action: input.accepted
            ? 'lease.termination_accepted'
            : 'lease.termination_declined',
          entityType: 'lease',
          entityId: request.leaseId,
          metadata: { terminationRequestId: request.id },
        },
      });

      return {
        status: input.accepted ? 'ACCEPTED' : 'DECLINED',
        respondedAt: now,
      };
    });
  }

  private async findPublicRequest(token: string) {
    const request = await this.prisma.leaseTerminationRequest.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        lease: {
          select: {
            tenancy: {
              select: {
                tenant: { select: { legalName: true } },
                property: { select: { name: true } },
                unit: { select: { unitNumber: true } },
              },
            },
          },
        },
      },
    });
    if (!request) {
      throw new NotFoundException('Lease termination link was not found');
    }
    return request;
  }
}
