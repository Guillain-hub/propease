import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MembershipRole, MembershipStatus } from '@prisma/client';
import { AuthService } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAccessGuard } from '../auth/jwt-access.guard.js';
import type { AccessTokenClaims } from '../auth/auth.types.js';
import { PrismaService } from '../database/prisma.service.js';
import { CreateOrganisationDto } from './dto/create-organisation.dto.js';
import { ensureTrialSubscription } from '../landlord/trial-subscription.js';

@Controller('organisations')
@UseGuards(JwtAccessGuard)
export class OrganisationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AccessTokenClaims) {
    const memberships = await this.prisma.organisationMember.findMany({
      where: { userId: user.sub, status: MembershipStatus.ACTIVE },
      select: {
        role: true,
        organisation: {
          select: {
            id: true,
            name: true,
            type: true,
            country: true,
            currency: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
    return { organisations: memberships };
  }

  @Get('invitations')
  async invitations(@CurrentUser() user: AccessTokenClaims) {
    const memberships = await this.prisma.organisationMember.findMany({
      where: { userId: user.sub, status: MembershipStatus.INVITED },
      select: {
        role: true,
        invitedAt: true,
        organisation: {
          select: { id: true, name: true, type: true, country: true, currency: true },
        },
      },
      orderBy: { invitedAt: 'asc' },
    });
    return { invitations: memberships };
  }

  @Post()
  async create(
    @CurrentUser() user: AccessTokenClaims,
    @Body() input: CreateOrganisationDto,
  ) {
    await this.auth.getUser(user.sub);
    const organisation = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.organisation.create({
        data: {
          name: input.name.trim(),
          type: input.type,
          ownerUserId: user.sub,
          members: {
            create: {
              userId: user.sub,
              role: MembershipRole.OWNER,
              status: MembershipStatus.ACTIVE,
              joinedAt: new Date(),
            },
          },
        },
        select: {
          id: true,
          name: true,
          type: true,
          country: true,
          currency: true,
        },
      });
      await ensureTrialSubscription(transaction, created.id);
      await transaction.auditLog.create({
        data: {
          organisationId: created.id,
          userId: user.sub,
          action: 'organisation.created',
          entityType: 'organisation',
          entityId: created.id,
        },
      });
      return created;
    });
    return { organisation };
  }
}
