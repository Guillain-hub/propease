import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAccessGuard } from '../auth/jwt-access.guard.js';
import type { AccessTokenClaims } from '../auth/auth.types.js';
import { LandlordSubscriptionGuard } from '../landlord/landlord-subscription.guard.js';
import { OrganisationAccessGuard } from '../organisations/organisation-access.guard.js';
import { CreateUploadDto } from './dto/create-upload.dto.js';
import { ObjectStorageService } from './object-storage.service.js';

@Controller('organisations/:organisationId/files')
@UseGuards(
  JwtAccessGuard,
  OrganisationAccessGuard,
  LandlordSubscriptionGuard,
)
export class FilesController {
  constructor(private readonly storage: ObjectStorageService) {}

  @Post('upload-url')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createUploadUrl(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Body() input: CreateUploadDto,
    @Req() request: Request,
  ) {
    this.assertCanUpload(request.organisationRole);
    return this.storage.createUploadUrl(organisationId, user.sub, input);
  }

  @Post(':fileId/complete')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  completeUpload(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Req() request: Request,
  ) {
    this.assertCanUpload(request.organisationRole);
    return this.storage.completeUpload(organisationId, user.sub, fileId);
  }

  @Get(':fileId/download-url')
  createDownloadUrl(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Req() request: Request,
  ) {
    return this.storage.createDownloadUrl(
      organisationId,
      user.sub,
      fileId,
      request.organisationRole,
    );
  }

  private assertCanUpload(role: MembershipRole | undefined): void {
    if (
      role !== MembershipRole.OWNER &&
      role !== MembershipRole.ADMIN &&
      role !== MembershipRole.MANAGER &&
      role !== MembershipRole.ACCOUNTANT
    ) {
      throw new ForbiddenException('Your organisation role cannot upload files');
    }
  }
}
