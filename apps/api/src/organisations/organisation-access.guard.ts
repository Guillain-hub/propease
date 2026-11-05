import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { Request } from 'express';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class OrganisationAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const rawOrganisationId = request.params.organisationId;
    const organisationId =
      typeof rawOrganisationId === 'string' ? rawOrganisationId : undefined;
    const userId = request.user?.sub;

    if (!userId || !organisationId || !isUUID(organisationId)) {
      throw new ForbiddenException('Organisation access is required');
    }

    const membership = await this.prisma.organisationMember.findUnique({
      where: {
        organisationId_userId: { organisationId, userId },
      },
      select: { role: true, status: true },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      throw new ForbiddenException('You do not have access to this organisation');
    }

    request.organisationRole = membership.role;
    return true;
  }
}
