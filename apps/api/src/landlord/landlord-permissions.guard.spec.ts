import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { LandlordPermissionsGuard } from './landlord-permissions.guard.js';

function requestContext(request: Partial<Request>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('LandlordPermissionsGuard', () => {
  it('allows accountants to read financial reports', async () => {
    const guard = new LandlordPermissionsGuard({} as PrismaService);
    const request = {
      organisationRole: MembershipRole.ACCOUNTANT,
      params: { organisationId: 'org-1' },
      method: 'GET',
      baseUrl: '/api/v1/organisations/org-1/landlord',
      route: { path: '/reports/financial' },
    } as Partial<Request>;

    await expect(guard.canActivate(requestContext(request))).resolves.toBe(true);
  });

  it('rejects legacy staff until assigned a specific role', async () => {
    const guard = new LandlordPermissionsGuard({} as PrismaService);
    const request = {
      organisationRole: MembershipRole.STAFF,
      params: { organisationId: 'org-1' },
      method: 'GET',
      baseUrl: '/api/v1/organisations/org-1/landlord',
      route: { path: '/properties' },
    } as Partial<Request>;

    await expect(guard.canActivate(requestContext(request))).rejects.toThrow(
      'This legacy staff role has been restricted',
    );
  });

  it('checks manager property assignments before allowing a mutation', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'property-1' });
    const guard = new LandlordPermissionsGuard({
      property: { findFirst },
    } as unknown as PrismaService);
    const request = {
      organisationRole: MembershipRole.MANAGER,
      user: { sub: 'manager-1' },
      params: { organisationId: 'org-1', propertyId: 'property-1' },
      method: 'PATCH',
      baseUrl: '/api/v1/organisations/org-1/landlord',
      route: { path: '/properties/:propertyId' },
      body: { name: 'Updated property' },
    } as unknown as Partial<Request>;

    await expect(guard.canActivate(requestContext(request))).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'property-1',
          organisationId: 'org-1',
          assignments: { some: { userId: 'manager-1' } },
        },
      }),
    );
  });

  it('rejects manager mutations for unassigned properties', async () => {
    const guard = new LandlordPermissionsGuard({
      property: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService);
    const request = {
      organisationRole: MembershipRole.MANAGER,
      user: { sub: 'manager-1' },
      params: { organisationId: 'org-1', propertyId: 'property-2' },
      method: 'PATCH',
      baseUrl: '/api/v1/organisations/org-1/landlord',
      route: { path: '/properties/:propertyId' },
      body: { name: 'Updated property' },
    } as unknown as Partial<Request>;

    await expect(guard.canActivate(requestContext(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('prevents managers from accessing expense records', async () => {
    const guard = new LandlordPermissionsGuard({} as PrismaService);
    const request = {
      organisationRole: MembershipRole.MANAGER,
      user: { sub: 'manager-1' },
      params: { organisationId: 'org-1' },
      method: 'GET',
      baseUrl: '/api/v1/organisations/org-1/landlord',
      route: { path: '/expenses' },
    } as Partial<Request>;

    await expect(guard.canActivate(requestContext(request))).rejects.toThrow(
      'Property managers cannot manage organisation access, billing, owners, or expenses',
    );
  });

  it('allows administrators to manage team membership routes', async () => {
    const guard = new LandlordPermissionsGuard({} as PrismaService);
    const request = {
      organisationRole: MembershipRole.ADMIN,
      params: { organisationId: 'org-1', memberId: 'member-1' },
      method: 'DELETE',
      baseUrl: '/api/v1/organisations/org-1/landlord',
      route: { path: '/team/:memberId' },
    } as Partial<Request>;

    await expect(guard.canActivate(requestContext(request))).resolves.toBe(true);
  });
});
