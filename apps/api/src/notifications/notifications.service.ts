import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { NotificationChannel, Prisma } from '@prisma/client';
import { Prisma as PrismaNamespace } from '@prisma/client';
import type { Queue } from 'bullmq';
import { PrismaService } from '../database/prisma.service.js';
import { notificationsQueue } from './notifications.constants.js';

export interface EmailNotification {
  userId: string;
  organisationId?: string;
  template: string;
  subject: string;
  text: string;
  deduplicationKey?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(notificationsQueue) private readonly queue: Queue,
  ) {}

  async enqueueEmail(
    input: EmailNotification,
  ): Promise<{ notificationId: string }> {
    const data = {
      userId: input.userId,
      organisationId: input.organisationId,
      channel: NotificationChannel.EMAIL,
      template: input.template,
      payload: {
        subject: input.subject,
        text: input.text,
      } satisfies Prisma.InputJsonObject,
      deduplicationKey: input.deduplicationKey,
    };

    if (input.deduplicationKey) {
      const existing = await this.prisma.notification.findUnique({
        where: { deduplicationKey: input.deduplicationKey },
        select: { id: true, status: true },
      });
      if (existing) {
        if (existing.status !== 'SENT') {
          await this.ensureQueued(existing.id);
        }
        return { notificationId: existing.id };
      }
    }

    let notification: { id: string };
    try {
      notification = await this.prisma.notification.create({
        data,
        select: { id: true },
      });
    } catch (error) {
      if (
        input.deduplicationKey &&
        error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.notification.findUnique({
          where: { deduplicationKey: input.deduplicationKey },
          select: { id: true, status: true },
        });
        if (existing) {
          if (existing.status !== 'SENT') {
            await this.ensureQueued(existing.id);
          }
          return { notificationId: existing.id };
        }
      }
      throw error;
    }

    await this.ensureQueued(notification.id);
    return { notificationId: notification.id };
  }

  private async ensureQueued(notificationId: string): Promise<void> {
    const job = await this.queue.getJob(notificationId);
    if (job) {
      if ((await job.getState()) === 'failed') {
        await this.prisma.notification.update({
          where: { id: notificationId },
          data: { status: 'QUEUED' },
        });
        try {
          await job.retry('failed');
        } catch (error) {
          await this.prisma.notification.update({
            where: { id: notificationId },
            data: { status: 'FAILED' },
          });
          throw error;
        }
      }
      return;
    }

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { status: 'QUEUED' },
    });
    try {
      await this.queue.add(
        'send-email',
        { notificationId },
        { jobId: notificationId },
      );
    } catch (error) {
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { status: 'FAILED' },
      });
      throw error;
    }
  }
}
