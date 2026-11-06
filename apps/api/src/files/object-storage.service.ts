import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import type { CreateUploadDto } from './dto/create-upload.dto.js';

const allowedMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const uploadUrlLifetimeSeconds = 300;
const downloadUrlLifetimeSeconds = 300;

@Injectable()
export class ObjectStorageService {
  private readonly client: S3Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.client = new S3Client({
      region: this.config.getOrThrow<string>('AWS_REGION'),
    });
  }

  async createUploadUrl(
    organisationId: string,
    userId: string,
    input: CreateUploadDto,
  ): Promise<{ fileId: string; uploadUrl: string; expiresIn: number }> {
    if (!allowedMimeTypes.has(input.mimeType)) {
      throw new BadRequestException('This file type is not supported');
    }

    const bucket = this.config.get<string>('S3_BUCKET');
    if (!bucket) {
      throw new Error('S3_BUCKET must be configured before file uploads are enabled');
    }

    const fileId = randomUUID();
    const storageKey = `${organisationId}/${fileId}`;
    const fileName = input.fileName.replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (!fileName) {
      throw new BadRequestException('File name is required');
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.storedFile.create({
        data: {
          id: fileId,
          organisationId,
          storageKey,
          fileName,
          mimeType: input.mimeType,
          sizeBytes: BigInt(input.sizeBytes),
        },
      });
      await transaction.auditLog.create({
        data: {
          organisationId,
          userId,
          action: 'file.upload_requested',
          entityType: 'file',
          entityId: fileId,
        },
      });
    });

    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        ContentType: input.mimeType,
        Metadata: { 'file-id': fileId },
      }),
      { expiresIn: uploadUrlLifetimeSeconds },
    );

    return { fileId, uploadUrl, expiresIn: uploadUrlLifetimeSeconds };
  }

  async completeUpload(
    organisationId: string,
    userId: string,
    fileId: string,
  ): Promise<{ fileId: string; status: 'UPLOADED' }> {
    const file = await this.prisma.storedFile.findFirst({
      where: { id: fileId, organisationId, uploadStatus: 'PENDING' },
    });
    if (!file) {
      throw new NotFoundException('Pending file upload was not found');
    }

    const bucket = this.config.get<string>('S3_BUCKET');
    if (!bucket) {
      throw new Error('S3_BUCKET must be configured before file uploads are enabled');
    }

    const object = await this.client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: file.storageKey }),
    );
    if (
      object.ContentLength !== Number(file.sizeBytes) ||
      object.ContentType !== file.mimeType ||
      object.Metadata?.['file-id'] !== file.id
    ) {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: file.storageKey }),
      );
      await this.prisma.$transaction(async (transaction) => {
        await transaction.storedFile.update({
          where: { id: file.id },
          data: { uploadStatus: 'FAILED' },
        });
        await transaction.auditLog.create({
          data: {
            organisationId,
            userId,
            action: 'file.upload_rejected',
            entityType: 'file',
            entityId: file.id,
          },
        });
      });
      throw new BadRequestException('Uploaded file does not match its declared details');
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.storedFile.update({
        where: { id: file.id },
        data: { uploadStatus: 'UPLOADED' },
      });
      await transaction.auditLog.create({
        data: {
          organisationId,
          userId,
          action: 'file.uploaded',
          entityType: 'file',
          entityId: file.id,
        },
      });
    });
    return { fileId: file.id, status: 'UPLOADED' };
  }

  async createDownloadUrl(
    organisationId: string,
    userId: string,
    fileId: string,
    role?: MembershipRole,
  ): Promise<{ downloadUrl: string; expiresIn: number }> {
    if (
      role !== MembershipRole.OWNER &&
      role !== MembershipRole.ADMIN &&
      role !== MembershipRole.MANAGER &&
      role !== MembershipRole.ACCOUNTANT
    ) {
      throw new ForbiddenException('Your organisation role cannot download files');
    }

    const assignedProperty = {
      organisationId,
      assignments: { some: { userId } },
    };
    const file = await this.prisma.storedFile.findFirst({
      where: {
        id: fileId,
        organisationId,
        uploadStatus: 'UPLOADED',
        ...(role === MembershipRole.MANAGER
          ? {
              OR: [
                {
                  leaseDocuments: {
                    some: {
                      lease: {
                        tenancy: {
                          unit: { property: assignedProperty },
                        },
                      },
                    },
                  },
                },
                {
                  inspectionMedia: {
                    some: {
                      inspection: {
                        unit: { property: assignedProperty },
                      },
                    },
                  },
                },
                {
                  expenseEvidence: {
                    some: { property: assignedProperty },
                  },
                },
                {
                  utilityEvidence: {
                    some: { property: assignedProperty },
                  },
                },
                {
                  maintenanceInvoices: {
                    some: {
                      request: {
                        unit: { property: assignedProperty },
                      },
                    },
                  },
                },
              ],
            }
          : role === MembershipRole.ACCOUNTANT
            ? {
                OR: [
                  {
                    expenseEvidence: {
                      some: { property: { organisationId } },
                    },
                  },
                  {
                    utilityEvidence: {
                      some: { property: { organisationId } },
                    },
                  },
                  {
                    maintenanceInvoices: {
                      some: {
                        request: {
                          unit: { property: { organisationId } },
                        },
                      },
                    },
                  },
                ],
              }
            : {}),
      },
      select: { storageKey: true, fileName: true },
    });
    if (!file) {
      throw new NotFoundException('Uploaded file was not found');
    }

    const bucket = this.config.get<string>('S3_BUCKET');
    if (!bucket) {
      throw new Error('S3_BUCKET must be configured before file downloads are enabled');
    }

    const downloadUrl = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: file.storageKey,
        ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      }),
      { expiresIn: downloadUrlLifetimeSeconds },
    );
    await this.prisma.auditLog.create({
      data: {
        organisationId,
        userId,
        action: 'file.download_url_created',
        entityType: 'file',
        entityId: fileId,
      },
    });
    return { downloadUrl, expiresIn: downloadUrlLifetimeSeconds };
  }
}
