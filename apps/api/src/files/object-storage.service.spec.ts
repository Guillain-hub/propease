import { ForbiddenException } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { ObjectStorageService } from './object-storage.service.js';

function storageFor(findFirst: ReturnType<typeof vi.fn>) {
  const prisma = {
    storedFile: { findFirst },
  } as unknown as PrismaService;
  const config = {
    getOrThrow: () => 'us-east-1',
    get: () => undefined,
  };
  return new ObjectStorageService(prisma, config as never);
}

describe('ObjectStorageService role access', () => {
  it('limits manager downloads to files linked to assigned properties', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const storage = storageFor(findFirst);

    await expect(
      storage.createDownloadUrl(
        'org-1',
        'manager-1',
        'file-1',
        MembershipRole.MANAGER,
      ),
    ).rejects.toThrow('Uploaded file was not found');

    const where = findFirst.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([
        {
          expenseEvidence: {
            some: {
              property: {
                organisationId: 'org-1',
                assignments: { some: { userId: 'manager-1' } },
              },
            },
          },
        },
      ]),
    );
  });

  it('denies maintenance staff downloads', async () => {
    const findFirst = vi.fn();
    const storage = storageFor(findFirst);

    await expect(
      storage.createDownloadUrl(
        'org-1',
        'maintenance-1',
        'file-1',
        MembershipRole.MAINTENANCE_STAFF,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('only creates preview URLs for photos attached to this organisation', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const storage = storageFor(findFirst);

    await expect(
      storage.createDownloadUrl(
        'org-1',
        'manager-1',
        'file-1',
        MembershipRole.MANAGER,
        true,
      ),
    ).rejects.toThrow('Uploaded file was not found');

    const where = findFirst.mock.calls[0][0].where;
    expect(where).toEqual(expect.objectContaining({
      mimeType: { startsWith: 'image/' },
      propertyPhotos: {
        some: {
          organisationId: 'org-1',
          assignments: { some: { userId: 'manager-1' } },
        },
      },
    }));
  });
});
