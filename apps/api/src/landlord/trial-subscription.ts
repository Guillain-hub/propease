import { BillingCycle, Prisma, SubscriptionStatus } from '@prisma/client';

export async function ensureTrialSubscription(
  transaction: Prisma.TransactionClient,
  organisationId: string,
): Promise<void> {
  const existing = await transaction.subscription.findUnique({
    where: { organisationId },
    select: { id: true },
  });
  if (existing) return;

  const plan = await transaction.plan.findUnique({
    where: { slug: 'free-trial' },
    select: { id: true },
  });
  if (!plan) {
    throw new Error('Free trial plan is missing; apply the latest database migration');
  }

  const now = new Date();
  const startDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const nextBillingDate = new Date(startDate);
  nextBillingDate.setUTCDate(nextBillingDate.getUTCDate() + 14);

  await transaction.subscription.createMany({
    data: [
      {
        organisationId,
        planId: plan.id,
        status: SubscriptionStatus.TRIALING,
        billingCycle: BillingCycle.MONTHLY,
        startDate,
        nextBillingDate,
      },
    ],
    skipDuplicates: true,
  });
}
