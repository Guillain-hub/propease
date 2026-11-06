import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAccessGuard } from '../auth/jwt-access.guard.js';
import type { AccessTokenClaims } from '../auth/auth.types.js';
import { OrganisationAccessGuard } from '../organisations/organisation-access.guard.js';
import { PrismaService } from '../database/prisma.service.js';
import { CreatePropertyDto } from './dto/create-property.dto.js';

@Controller('organisations/:organisationId/properties')
@UseGuards(JwtAccessGuard, OrganisationAccessGuard)
export class PropertiesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Req() request: Request,
  ) {
    const role = request.organisationRole;
    if (
      role !== MembershipRole.OWNER &&
      role !== MembershipRole.ADMIN &&
      role !== MembershipRole.MANAGER
    ) {
      throw new ForbiddenException('Your organisation role cannot view properties');
    }
    const properties = await this.prisma.property.findMany({
      where: {
        organisationId,
        ...(role === MembershipRole.MANAGER && request.user?.sub
          ? { assignments: { some: { userId: request.user.sub } } }
          : {}),
      },
      select: {
        id: true,
        name: true,
        type: true,
        address: true,
        status: true,
        createdAt: true,
        propertyOwner: { select: { id: true, name: true } },
        _count: { select: { units: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { properties };
  }

  @Post()
  async create(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Req() request: Request,
    @Body() input: CreatePropertyDto,
  ) {
    const role = request.organisationRole;
    if (
      role !== MembershipRole.OWNER &&
      role !== MembershipRole.ADMIN
    ) {
      throw new ForbiddenException('Your organisation role cannot create properties');
    }

    const property = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.property.create({
        data: {
          organisationId,
          name: input.name.trim(),
          type: input.type,
          address: input.address.trim(),
        },
        select: {
          id: true,
          organisationId: true,
          name: true,
          type: true,
          address: true,
          status: true,
          createdAt: true,
        },
      });

      await transaction.auditLog.create({
        data: {
          organisationId,
          userId: user.sub,
          action: 'property.created',
          entityType: 'property',
          entityId: created.id,
        },
      });
      return created;
    });
    return { property };
  }

  @Get(':propertyId')
  async getOne(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Req() request: Request,
  ) {
    const role = request.organisationRole;
    if (
      role !== MembershipRole.OWNER &&
      role !== MembershipRole.ADMIN &&
      role !== MembershipRole.MANAGER
    ) {
      throw new ForbiddenException('Your organisation role cannot view properties');
    }
    const property = await this.prisma.property.findFirst({
      where: {
        id: propertyId,
        organisationId,
        ...(role === MembershipRole.MANAGER && request.user?.sub
          ? { assignments: { some: { userId: request.user.sub } } }
          : {}),
      },
      select: {
        id: true,
        name: true,
        type: true,
        address: true,
        status: true,
        createdAt: true,
        units: {
          select: {
            id: true,
            unitNumber: true,
            floor: true,
            rentAmount: true,
            depositAmount: true,
            status: true,
          },
          orderBy: { unitNumber: 'asc' },
        },
      },
    });

    if (!property) {
      throw new NotFoundException('Property was not found in this organisation');
    }
    return { property };
  }
}
