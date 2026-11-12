import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../database/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { notificationsQueue } from './notifications.constants.js';

interface NotificationJob {
  notificationId: string;
}

@Injectable()
@Processor(notificationsQueue)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {
    super();
  }

  async process(job: Job<NotificationJob>): Promise<void> {
    if (job.name !== 'send-email') {
      throw new Error(`Unsupported notification job: ${job.name}`);
    }

    const notification = await this.prisma.notification.findUnique({
      where: { id: job.data.notificationId },
      include: { user: { select: { email: true } } },
    });
    if (!notification) {
      throw new Error(`Notification ${job.data.notificationId} was not found`);
    }
    if (notification.status === 'SENT') {
      return;
    }
    if (notification.channel !== 'EMAIL') {
      throw new Error(
        `Unsupported notification channel: ${notification.channel}`,
      );
    }

    const payload = notification.payload;
    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      !('subject' in payload) ||
      typeof payload.subject !== 'string' ||
      !('text' in payload) ||
      typeof payload.text !== 'string'
    ) {
      throw new Error(
        `Notification ${notification.id} has an invalid email payload`,
      );
    }

    await this.email.send(
      notification.user.email,
      payload.subject,
      payload.text,
    );

    await this.prisma.notification.update({
      where: { id: notification.id },
      data: { status: 'SENT', sentAt: new Date() },
    });
  }

  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<NotificationJob> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) {
      return;
    }
    await this.prisma.notification.updateMany({
      where: { id: job.data.notificationId, status: 'QUEUED' },
      data: { status: 'FAILED' },
    });
    this.logger.error(
      `Notification ${job.data.notificationId} failed after ${job.attemptsMade} attempts`,
      error.stack,
    );
  }
}
