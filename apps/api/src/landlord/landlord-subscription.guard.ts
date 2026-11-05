import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../database/prisma.service.js';
import { ensureTrialSubscription } from './trial-subscription.js';

function utcDate(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

@Injectable()
export class LandlordSubscriptionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const route = request.path;
    const organisationId = request.params.organisationId;
    if (typeof organisationId !== 'string') return true;
    let subscription = await this.prisma.subscription.findUnique({
      where: { organisationId },
      select: { id: true, status: true, nextBillingDate: true },
    });
    if (!subscription) {
      await this.prisma.$transaction((transaction) =>
        ensureTrialSubscription(transaction, organisationId),
      );
      subscription = await this.prisma.subscription.findUnique({
        where: { organisationId },
        select: { id: true, status: true, nextBillingDate: true },
      });
    }
    if (!subscription) {
      throw new ForbiddenException('This workspace has no configured subscription.');
    }
    if (route.includes('/landlord/subscription')) return true;

    let status = subscription.status;
    const today = utcDate(new Date());
    if (
      status === SubscriptionStatus.TRIALING &&
      subscription.nextBillingDate &&
      today > addDays(utcDate(subscription.nextBillingDate), 3)
    ) {
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: SubscriptionStatus.EXPIRED },
      });
      status = SubscriptionStatus.EXPIRED;
    }

    if (status !== SubscriptionStatus.EXPIRED) return true;
    if (request.method !== 'GET') {
      throw new ForbiddenException(
        'This workspace is read-only. Choose a subscription plan to restore editing.',
      );
    }
    if (
      subscription.nextBillingDate &&
      today > addDays(utcDate(subscription.nextBillingDate), 33)
    ) {
      throw new ForbiddenException(
        'Workspace data is restricted. Contact PropEase to restore access.',
      );
    }
    return true;
  }
}
