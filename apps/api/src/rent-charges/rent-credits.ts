import { Prisma, RentChargeStatus } from '@prisma/client';

export async function applyUnallocatedPaymentCredits(
  transaction: Prisma.TransactionClient,
  rentChargeId: string,
  organisationId: string,
  userId?: string,
): Promise<Prisma.Decimal> {
  const charge = await transaction.rentCharge.findUniqueOrThrow({
    where: { id: rentChargeId },
    select: {
      balance: true,
      dueDate: true,
      status: true,
      tenancy: { select: { id: true, tenantId: true } },
    },
  });
  if (charge.status === RentChargeStatus.VOID || charge.balance.lte(0)) {
    return new Prisma.Decimal(0);
  }

  const payments = await transaction.payment.findMany({
    where: {
      organisationId,
      tenantId: charge.tenancy.tenantId,
      reversedAt: null,
      OR: [
        { tenancyId: charge.tenancy.id },
        {
          tenancyId: null,
          allocations: { some: { rentCharge: { tenancyId: charge.tenancy.id } } },
        },
      ],
    },
    select: {
      id: true,
      amount: true,
      allocations: { select: { allocatedAmount: true } },
    },
    orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
  });

  let remainingBalance = charge.balance;
  let appliedTotal = new Prisma.Decimal(0);
  for (const payment of payments) {
    if (remainingBalance.isZero()) break;
    const alreadyAllocated = payment.allocations.reduce(
      (total, allocation) => total.plus(allocation.allocatedAmount),
      new Prisma.Decimal(0),
    );
    const availableCredit = payment.amount.minus(alreadyAllocated);
    if (availableCredit.lte(0)) continue;

    const allocation = availableCredit.lt(remainingBalance)
      ? availableCredit
      : remainingBalance;
    await transaction.paymentAllocation.create({
      data: {
        paymentId: payment.id,
        rentChargeId,
        allocatedAmount: allocation,
      },
    });
    await transaction.auditLog.create({
      data: {
        organisationId,
        ...(userId ? { userId } : {}),
        action: 'payment.advance_credit_applied',
        entityType: 'payment',
        entityId: payment.id,
        metadata: {
          rentChargeId,
          amount: allocation.toString(),
        },
      },
    });
    remainingBalance = remainingBalance.minus(allocation);
    appliedTotal = appliedTotal.plus(allocation);
  }

  if (appliedTotal.gt(0)) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await transaction.rentCharge.update({
      where: { id: rentChargeId },
      data: {
        balance: remainingBalance,
        status: remainingBalance.isZero()
          ? RentChargeStatus.PAID
          : charge.dueDate < today
            ? RentChargeStatus.OVERDUE
            : RentChargeStatus.PARTIALLY_PAID,
      },
    });
    if (remainingBalance.isZero()) {
      await transaction.notification.updateMany({
        where: {
          deduplicationKey: { startsWith: `rent-reminder:${rentChargeId}:` },
          status: 'QUEUED',
        },
        data: { status: 'CANCELLED' },
      });
    }
  }

  return appliedTotal;
}
