import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../database/prisma.service.js';

const accountantRoutes = new Set([
  'GET /properties',
  'GET /units',
  'GET /tenants',
  'GET /tenancies',
  'GET /rent/charges',
  'GET /rent/payments',
  'GET /rent/payments/:paymentId/receipt',
  'GET /rent/deposits',
  'GET /expenses',
  'GET /utilities',
  'GET /reports/financial',
  'POST /rent/charges',
  'POST /rent/payments',
  'POST /rent/deposits/:depositId/transactions',
  'POST /expenses',
  'POST /utilities',
]);

@Injectable()
export class LandlordPermissionsGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const role = request.organisationRole;
    const organisationId = request.params.organisationId;
    const userId = request.user?.sub;
    const method = request.method.toUpperCase();
    const path = request.route?.path;
    const routePath =
      typeof path === 'string' ? `${request.baseUrl}${path}` : '';
    const landlordPath = routePath.split('/landlord').pop() ?? '';

    if (role === MembershipRole.OWNER || role === MembershipRole.ADMIN) return true;

    if (role === MembershipRole.STAFF) {
      throw new ForbiddenException(
        'This legacy staff role has been restricted. Ask an owner or administrator to assign a specific role.',
      );
    }

    if (role === MembershipRole.ACCOUNTANT) {
      if (accountantRoutes.has(`${method} ${landlordPath}`)) return true;
      if (
        method === 'POST' &&
        /^\/rent\/(charges\/[^/]+\/void|payments\/[^/]+\/reverse)$/.test(landlordPath)
      ) {
        return true;
      }
      if (
        method === 'POST' &&
        /^\/(expenses|utilities)\/[^/]+\/(evidence|reverse)$/.test(landlordPath)
      ) {
        return true;
      }
      throw new ForbiddenException('Accountants can access financial records and reports only');
    }

    if (role === MembershipRole.MAINTENANCE_STAFF) {
      if (!userId || typeof organisationId !== 'string') {
        throw new ForbiddenException('Maintenance assignment is required');
      }
      if (method === 'GET' && landlordPath === '/maintenance') return true;
      const requestId = landlordPath.match(/^\/maintenance\/([0-9a-f-]+)$/i)?.[1];
      if (method === 'PATCH' && requestId) {
        const assignedRequest = await this.prisma.maintenanceRequest.findFirst({
          where: {
            id: requestId,
            assignedToUserId: userId,
            unit: { property: { organisationId } },
          },
          select: { id: true },
        });
        if (!assignedRequest) {
          throw new ForbiddenException('You can only update maintenance requests assigned to you');
        }
        const body = request.body as Record<string, unknown> | undefined;
        const allowedKeys = new Set(['status', 'resolutionNotes']);
        if (
          !body ||
          Object.keys(body).some((key) => !allowedKeys.has(key)) ||
          !['IN_PROGRESS', 'COMPLETED'].includes(String(body.status))
        ) {
          throw new ForbiddenException('Maintenance staff may only update request progress and resolution notes');
        }
        return true;
      }
      throw new ForbiddenException('Maintenance staff can access assigned maintenance requests only');
    }

    if (role === MembershipRole.MANAGER) {
      if (
        landlordPath.startsWith('/team') ||
        landlordPath.startsWith('/subscription') ||
        landlordPath.startsWith('/settings') ||
        landlordPath.startsWith('/property-owners')
      ) {
        throw new ForbiddenException('Property managers cannot manage organisation access, billing, or owners');
      }
      if (method === 'POST' && landlordPath === '/properties') {
        throw new ForbiddenException('Only owners and administrators can create properties');
      }
      if (userId && typeof organisationId === 'string') {
        await this.assertManagerAssignments(
          request,
          landlordPath,
          organisationId,
          userId,
        );
      }
      return true;
    }

    throw new ForbiddenException('Your organisation role cannot access this workspace');
  }

  private async assertManagerAssignments(
    request: Request,
    path: string,
    organisationId: string,
    userId: string,
  ): Promise<void> {
    const method = request.method.toUpperCase();
    const assignedProperty = {
      organisationId,
      assignments: { some: { userId } },
    };
    const body = request.body as Record<string, unknown> | undefined;
    const ids = new Set<string>();
    for (const key of [
      'propertyId',
      'unitId',
      'tenantId',
      'tenancyId',
      'leaseId',
      'inspectionId',
      'chargeId',
      'rentChargeId',
      'depositId',
      'paymentId',
      'expenseId',
      'billId',
      'requestId',
      'noticeId',
    ]) {
      if (key === 'tenantId' && request.method === 'POST' && path === '/tenancies') {
        continue;
      }
      const value = request.params[key] ?? body?.[key];
      if (typeof value === 'string') ids.add(`${key}:${value}`);
    }
    if (Array.isArray(body?.allocations)) {
      for (const item of body.allocations) {
        if (
          item &&
          typeof item === 'object' &&
          'rentChargeId' in item &&
          typeof item.rentChargeId === 'string'
        ) {
          ids.add(`rentChargeId:${item.rentChargeId}`);
        }
      }
    }

    for (const entry of ids) {
      const [kind, id] = entry.split(':', 2);
      let permitted = false;
      switch (kind) {
        case 'propertyId':
          permitted = Boolean(
            await this.prisma.property.findFirst({
              where: { id, ...assignedProperty },
              select: { id: true },
            }),
          );
          break;
        case 'unitId':
          permitted = Boolean(
            await this.prisma.unit.findFirst({
              where: { id, property: assignedProperty },
              select: { id: true },
            }),
          );
          break;
        case 'tenantId':
          permitted = Boolean(
            await this.prisma.tenant.findFirst({
              where: {
                id,
                organisationId,
                tenancies: { some: { unit: { property: assignedProperty } } },
              },
              select: { id: true },
            }),
          );
          break;
        case 'tenancyId':
          permitted = Boolean(
            await this.prisma.tenancy.findFirst({
              where: { id, unit: { property: assignedProperty } },
              select: { id: true },
            }),
          );
          break;
        case 'leaseId':
          permitted = Boolean(
            await this.prisma.lease.findFirst({
              where: { id, tenancy: { unit: { property: assignedProperty } } },
              select: { id: true },
            }),
          );
          break;
        case 'inspectionId':
          permitted = Boolean(
            await this.prisma.inspection.findFirst({
              where: { id, unit: { property: assignedProperty } },
              select: { id: true },
            }),
          );
          break;
        case 'chargeId':
        case 'rentChargeId':
          permitted = Boolean(
            await this.prisma.rentCharge.findFirst({
              where: { id, tenancy: { unit: { property: assignedProperty } } },
              select: { id: true },
            }),
          );
          break;
        case 'depositId':
          permitted = Boolean(
            await this.prisma.deposit.findFirst({
              where: { id, tenancy: { unit: { property: assignedProperty } } },
              select: { id: true },
            }),
          );
          break;
        case 'paymentId':
          permitted = Boolean(
            await this.prisma.payment.findFirst({
              where: {
                id,
                organisationId,
                allocations: {
                  some: {
                    rentCharge: {
                      tenancy: { unit: { property: assignedProperty } },
                    },
                  },
                  every: {
                    rentCharge: {
                      tenancy: { unit: { property: assignedProperty } },
                    },
                  },
                },
              },
              select: { id: true },
            }),
          );
          break;
        case 'expenseId':
          permitted = Boolean(
            await this.prisma.expense.findFirst({
              where: { id, property: assignedProperty },
              select: { id: true },
            }),
          );
          break;
        case 'billId':
          permitted = Boolean(
            await this.prisma.utilityBill.findFirst({
              where: { id, property: assignedProperty },
              select: { id: true },
            }),
          );
          break;
        case 'requestId':
          permitted = Boolean(
            await this.prisma.maintenanceRequest.findFirst({
              where: { id, unit: { property: assignedProperty } },
              select: { id: true },
            }),
          );
          break;
        case 'noticeId':
          permitted = Boolean(
            await this.prisma.notice.findFirst({
              where: { id, tenancy: { unit: { property: assignedProperty } } },
              select: { id: true },
            }),
          );
          break;
      }
      if (!permitted) {
        throw new ForbiddenException('You can only access records for properties assigned to you');
      }
    }

    if (method === 'POST' && path === '/tenants' && ids.size === 0) return;
    if (method !== 'GET' && ids.size === 0) {
      throw new ForbiddenException('This operation requires an assigned property');
    }
  }
}
