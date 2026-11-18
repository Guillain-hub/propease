import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export async function assertWholeFrancsIfRwf(
  transaction: Pick<Prisma.TransactionClient, 'organisation'>,
  organisationId: string,
  values: Array<string | undefined | null>,
): Promise<void> {
  const hasFractionalAmount = values.some(
    (value) => value !== undefined && value !== null && !new Prisma.Decimal(value).isInteger(),
  );
  if (!hasFractionalAmount) return;

  const organisation = await transaction.organisation.findUnique({
    where: { id: organisationId },
    select: { currency: true },
  });
  if (organisation?.currency === 'RWF') {
    throw new BadRequestException('RWF amounts must be whole francs');
  }
}
