import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { NotificationProcessor } from './notification.processor.js';

describe('NotificationProcessor rent reminders', () => {
  it('cancels a queued reminder when its rent charge is already settled', async () => {
    const prisma = {
      notification: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'notification-1',
          status: 'QUEUED',
          template: 'rent_reminder',
          deduplicationKey: 'rent-reminder:charge-1:2026-01',
          organisationId: 'organisation-1',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      rentCharge: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const email = { send: vi.fn() };
    const processor = new NotificationProcessor(
      prisma as unknown as PrismaService,
      email as unknown as EmailService,
    );

    await processor.process({
      name: 'send-email',
      data: { notificationId: 'notification-1' },
    } as never);

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 'notification-1', status: 'QUEUED' },
      data: { status: 'CANCELLED' },
    });
    expect(email.send).not.toHaveBeenCalled();
  });
});
