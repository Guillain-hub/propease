import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAccessGuard } from '../auth/jwt-access.guard.js';
import type { AccessTokenClaims } from '../auth/auth.types.js';
import { OrganisationAccessGuard } from '../organisations/organisation-access.guard.js';
import { CreateUploadDto } from './dto/create-upload.dto.js';
import { ObjectStorageService } from './object-storage.service.js';

@Controller('organisations/:organisationId/files')
@UseGuards(JwtAccessGuard, OrganisationAccessGuard)
export class FilesController {
  constructor(private readonly storage: ObjectStorageService) {}

  @Post('upload-url')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createUploadUrl(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Body() input: CreateUploadDto,
  ) {
    return this.storage.createUploadUrl(organisationId, user.sub, input);
  }

  @Post(':fileId/complete')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  completeUpload(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.storage.completeUpload(organisationId, user.sub, fileId);
  }

  @Get(':fileId/download-url')
  createDownloadUrl(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @CurrentUser() user: AccessTokenClaims,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.storage.createDownloadUrl(organisationId, user.sub, fileId);
  }
}
