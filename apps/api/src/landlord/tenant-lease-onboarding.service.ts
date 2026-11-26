import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DepositStatus,
  DepositTransactionType,
  LeaseStatus,
  MembershipRole,
  Prisma,
  TenantLeaseReviewAction,
  TenancyStatus,
  UnitStatus,
} from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { PdfService } from '../documents/pdf.service.js';
import { assertWholeFrancsIfRwf } from './financial-amount.js';
import {
  CreateTenantLeaseOnboardingInput,
  LeaseAgreementFieldsInput,
  ResendTenantLeaseOnboardingInput,
  TenantLeaseReviewInput,
} from './dto/tenant-lease-onboarding.dto.js';

const reviewManagers = new Set<MembershipRole>([
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
  MembershipRole.MANAGER,
  MembershipRole.ACCOUNTANT,
]);
const tokenLifetimeMs = 7 * 24 * 60 * 60 * 1000;

function assertCanManage(role?: MembershipRole): void {
  if (!role || !reviewManagers.has(role)) {
    throw new ForbiddenException(
      'Your organisation role cannot manage lease offers',
    );
  }
}

function asDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function createReviewToken(): string {
  return randomBytes(32).toString('base64url');
}

function agreementDepositWasPaid(
  fields: LeaseAgreementFieldsInput | undefined,
): boolean {
  return fields?.depositPaid === true ||
    (fields?.depositPaid === undefined && Boolean(fields?.depositPaidDate));
}

function validateAgreementFields(
  fields: LeaseAgreementFieldsInput | undefined,
  tenantPhone?: string,
): void {
  if (!fields) return;
  const required: Array<keyof LeaseAgreementFieldsInput> = [
    'landlordName',
    'landlordId',
    'landlordIdPlace',
    'landlordTel',
    'tenantId',
    'tenantIdPlace',
    'currency',
    'renewalNoticeDays',
    'holdoverNoticeDays',
    'paymentMethod',
    'advancePaid',
    'lateFeeEnabled',
    'depositPaid',
    'depositReturnDays',
    'utilities',
    'inspectionNoticeHours',
    'subletAllowed',
    'tenantExitNoticeDays',
    'breachFixDays',
    'rentFixedMonths',
    'increaseNoticeDays',
  ];
  const missing = required.filter((key) => fields[key] === undefined || fields[key] === '');
  const tenantPhoneMissing = !tenantPhone?.trim();
  if (fields.paymentMethod !== 'CASH' && !fields.paymentAccount?.trim()) {
    missing.push('paymentAccount');
  }
  if (
    fields.advancePaid &&
    (!fields.advanceAmount || !fields.advanceStart || !fields.advanceEnd)
  ) {
    missing.push('advanceAmount');
  }
  if (
    fields.lateFeeEnabled &&
    (!fields.lateDays || !fields.lateFee || !fields.lateNoticeDays)
  ) {
    missing.push('lateFee');
  }
  if (fields.depositPaid && !fields.depositPaidDate) {
    missing.push('depositPaidDate');
  }
  if (fields.utilities) {
    for (const key of [
      'water',
      'electricity',
      'garbage',
      'security',
      'internet',
      'serviceCharges',
    ] as const) {
      if (!fields.utilities[key]) missing.push('utilities');
    }
  }
  if (missing.length || tenantPhoneMissing) {
    throw new BadRequestException(
      'Complete all required lease agreement fields before generating or sending the agreement',
    );
  }
  const utilityPayers = [
    fields.utilities!.water,
    fields.utilities!.garbage,
    fields.utilities!.electricity,
    fields.utilities!.security,
    fields.utilities!.internet,
    fields.utilities!.serviceCharges,
  ];
  if (
    !utilityPayers.every((payer) => payer === utilityPayers[0]) ||
    !['LANDLORD', 'TENANT'].includes(utilityPayers[0] ?? '')
  ) {
    throw new BadRequestException(
      'Choose Landlord or Tenant once to cover all utilities and service charges',
    );
  }
  if (
    fields.advancePaid &&
    fields.advanceStart &&
    fields.advanceEnd &&
    asDate(fields.advanceEnd) < asDate(fields.advanceStart)
  ) {
    throw new BadRequestException(
      'Advance payment end date cannot be before its start date',
    );
  }
}

function reviewUrl(config: ConfigService, token: string): string {
  const base =
    config.get<string>('WEB_APP_URL')?.trim() ||
    config.getOrThrow<string>('APP_ORIGINS').split(',')[0].trim();
  const url = new URL('/tenant-lease-review', base);
  url.searchParams.set('token', token);
  return url.toString();
}

function snapshotJson(value: Prisma.JsonValue): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new ConflictException(
      'The saved lease agreement snapshot is invalid',
    );
  }
  return value as Record<string, unknown>;
}

function snapshotSignature(
  value: Prisma.JsonValue,
): { name: string; signedAt: Date } | undefined {
  const execution = snapshotJson(value).execution;
  if (!execution || typeof execution !== 'object' || Array.isArray(execution)) {
    return undefined;
  }
  const record = execution as Record<string, unknown>;
  if (typeof record.tenantSignatureName !== 'string' || typeof record.tenantSignedAt !== 'string') {
    return undefined;
  }
  const signedAt = new Date(record.tenantSignedAt);
  return Number.isNaN(signedAt.getTime())
    ? undefined
    : { name: record.tenantSignatureName, signedAt };
}

function formatSnapshotDate(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 10) : '';
}

function formatMoney(value: unknown, currency: string): string {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `${currency} ${amount.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `${currency} 0.00`;
}

function termMonths(startValue: unknown, endValue: unknown): number {
  const start = formatSnapshotDate(startValue);
  const end = formatSnapshotDate(endValue);
  if (!start || !end) return 0;
  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);
  return Math.max(
    0,
    (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 +
      endDate.getUTCMonth() -
      startDate.getUTCMonth() +
      (endDate.getUTCDate() >= startDate.getUTCDate() ? 1 : 0),
  );
}

function snapshotSections(
  agreement: Record<string, unknown>,
  signature?: { name: string; signedAt: Date },
) {
  const tenant =
    agreement.tenant && typeof agreement.tenant === 'object'
      ? (agreement.tenant as Record<string, unknown>)
      : {};
  const property =
    agreement.property && typeof agreement.property === 'object'
      ? (agreement.property as Record<string, unknown>)
      : {};
  const rentalSpace =
    agreement.rentalSpace && typeof agreement.rentalSpace === 'object'
      ? (agreement.rentalSpace as Record<string, unknown>)
      : {};
  const lease =
    agreement.lease && typeof agreement.lease === 'object'
      ? (agreement.lease as Record<string, unknown>)
      : {};
  const fields =
    lease.agreement && typeof lease.agreement === 'object'
      ? (lease.agreement as Record<string, unknown>)
      : {};
  const utilities =
    fields.utilities && typeof fields.utilities === 'object'
      ? (fields.utilities as Record<string, unknown>)
      : {};
  const currency =
    typeof fields.currency === 'string' ? fields.currency : 'RWF';
  const value = (key: string, fallback: string) =>
    typeof fields[key] === 'string' || typeof fields[key] === 'number'
      ? String(fields[key])
      : fallback;
  const money = (key: string, fallback = '0') =>
    formatMoney(fields[key] ?? fallback, currency);
  const payerNames: Record<string, string> = {
    LANDLORD: 'Landlord',
    TENANT: 'Tenant',
    NOT_APPLICABLE: 'Not applicable',
  };
  const utilityNames: Record<string, string> = {
    water: 'Water',
    garbage: 'Garbage',
    electricity: 'Electricity',
    security: 'Security',
    internet: 'Internet',
    serviceCharges: 'Service charges',
  };
  const utilityTerms = Object.entries(utilityNames)
    .filter(([key]) => utilities[key] !== 'NOT_APPLICABLE')
    .map(
      ([key, label]) =>
        `${label}: ${payerNames[String(utilities[key])] ?? 'Not specified'}`,
    );
  const leaseMonths = termMonths(lease.startDate, lease.endDate);
  const rentAmount = Number(lease.rentAmount);
  const advanceAmount = Number(fields.advanceAmount);
  const advanceMonths =
    rentAmount > 0 && advanceAmount > 0
      ? (advanceAmount / rentAmount).toFixed(2)
      : '0';
  const depositAmount = Number(lease.depositAmount);
  const agreementDepositPaid = agreementDepositWasPaid(fields);
  const depositMonths =
    rentAmount > 0 && depositAmount > 0
      ? (depositAmount / rentAmount).toFixed(2)
      : '0';
  const paymentLabels: Record<string, string> = {
    BANK_TRANSFER: 'bank transfer',
    MOBILE_MONEY: 'mobile money',
    CASH: 'cash',
  };
  const terms =
    lease.terms && typeof lease.terms === 'object'
      ? (lease.terms as Record<string, unknown>)
      : {};
  const additionalTerms =
    typeof terms.additionalTerms === 'string'
      ? terms.additionalTerms
      : typeof terms.terms === 'string'
        ? terms.terms
        : '';
  const startDate = formatSnapshotDate(lease.startDate);
  const endDate = formatSnapshotDate(lease.endDate);

  return [
    {
      heading: 'Agreement and parties',
      body: [
        `This Rental Agreement is made on ${value('agreementDate', new Date().toISOString().slice(0, 10))}.`,
        '',
        `Landlord: ${value('landlordName', 'Not provided')}`,
        `Identification: ${value('landlordId', 'Not provided')}`,
        `Place of issuance: ${value('landlordIdPlace', 'Not provided')}`,
        `Telephone: ${value('landlordTel', 'Not provided')}`,
        '',
        `Tenant: ${String(tenant.legalName ?? 'Not provided')}`,
        `Identification: ${value('tenantId', 'Not provided')}`,
        `Place of issuance: ${value('tenantIdPlace', 'Not provided')}`,
        `Telephone: ${String(tenant.phone ?? 'Not provided')}`,
        '',
        `Property: ${String(property.name ?? '')}`,
        `Rental space: ${String(rentalSpace.label ?? 'Entire property')}`,
        `Property address: ${String(property.address ?? 'Not provided')}`,
      ].join('\n'),
    },
    {
      heading: '1. Term of lease',
      body: [
        `This Agreement runs from ${startDate} to ${endDate} (${leaseMonths} months).`,
        `To renew, the Tenant must notify the Landlord in writing at least ${value('renewalNoticeDays', '30')} days before the end date, and both parties must agree in writing.`,
        `If the Tenant stays on without a renewal, the tenancy continues month to month and either party may end it with ${value('holdoverNoticeDays', '30')} days' written notice.`,
      ].join('\n\n'),
    },
    {
      heading: '2. Rent',
      body: [
        `2.1 Monthly rent is ${money('rentAmount', String(lease.rentAmount ?? 0))}, due on or before the ${String(lease.dueDay ?? '—')} day of each month, payable by ${paymentLabels[String(fields.paymentMethod)] ?? 'the agreed method'}${fields.paymentMethod !== 'CASH' && fields.paymentAccount ? ` to ${String(fields.paymentAccount)}` : ''}.`,
        fields.advancePaid === true
          ? `2.2 The Tenant has paid ${money('advanceAmount')} in advance, equal to ${advanceMonths} month(s) of rent and covering the period from ${value('advanceStart', '—')} to ${value('advanceEnd', '—')}, in addition to the security deposit in clause 3. The Landlord acknowledges receipt by signing this Agreement.`
          : '',
        fields.lateFeeEnabled === true
          ? `2.3 If rent is more than ${value('lateDays', '—')} days late, the Landlord may charge a late fee of ${money('lateFee')} and give written notice to pay within ${value('lateNoticeDays', '—')} days.`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
    {
      heading: '3. Security deposit',
      body: [
        agreementDepositPaid
          ? `3.1 The Tenant has paid a deposit of ${money('depositAmount', String(lease.depositAmount ?? 0))} (${depositMonths} month(s) of rent) on ${value('depositPaidDate', '—')}. The Landlord acknowledges receipt by signing this Agreement.`
          : `3.1 The Tenant must pay a security deposit of ${money('depositAmount', String(lease.depositAmount ?? 0))} (${depositMonths} month(s) of rent) before taking possession. The Landlord will acknowledge receipt separately.`,
        `3.2 The Landlord holds the deposit as security for unpaid rent, utilities and damage beyond normal wear and tear, and not as the last month's rent unless both agree in writing. Within ${value('depositReturnDays', '30')} days after the keys are returned, the Landlord returns the deposit with a written list of any deductions.`,
        '3.3 At move-in, both parties record the property condition in writing (with photos if possible). The Tenant returns it in the same condition, apart from normal wear and tear.',
      ].join('\n\n'),
    },
    {
      heading: '4. Utilities and charges',
      body: utilityTerms.length
        ? utilityTerms.join('\n')
        : 'No utility responsibility was specified.',
    },
    {
      heading: '5. Maintenance and repairs',
      body: [
        'The Tenant keeps the property clean, pays for minor upkeep, and pays for damage caused by the Tenant, occupants or guests. The Landlord handles major repairs not caused by the Tenant (roof, main plumbing, main wiring) within a reasonable time after written notice.',
        `The Landlord may inspect the property with at least ${value('inspectionNoticeHours', '48')} hours' notice, at reasonable hours. In an emergency (such as fire, flooding or a gas leak) the Landlord may enter without prior notice.`,
      ].join('\n\n'),
    },
    {
      heading: '6. Use of property',
      body: [
        'The property is for residential use only, with no unlawful activity.',
        fields.maxOccupants
          ? `The maximum number of occupants is ${String(fields.maxOccupants)}.`
          : '',
        typeof fields.petsAllowed === 'boolean'
          ? `Pets are ${fields.petsAllowed ? 'allowed' : 'not allowed'} under this Agreement.`
          : '',
        `The Tenant may ${fields.subletAllowed === true ? '' : 'not '}sublet or make structural changes without the Landlord's written consent, and shall respect neighbors and local rules.`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
    {
      heading: '7. Termination',
      body: [
        `7.1 The Tenant may end this Agreement before the end date by giving at least ${value('tenantExitNoticeDays', '30')} days' written notice. Early exit penalty: ${fields.earlyExitPenalty ? money('earlyExitPenalty') : 'none'}.`,
        `7.2 The Landlord may end this Agreement before the end date only for serious reasons, such as non-payment of rent after the notice period in clause 2.3, or a material breach of this Agreement that the Tenant fails to fix within ${value('breachFixDays', '14')} days of written notice, or as otherwise permitted by law. Notice must be in writing.`,
        '7.3 The Tenant shall vacate and return all keys on the termination date. Neither party may force the other out of, or lock the other out of, the property outside the legal process.',
      ].join('\n\n'),
    },
    {
      heading: '8. Rent adjustment',
      body: `Rent is fixed for the first ${value('rentFixedMonths', String(leaseMonths))} months. After that, the Landlord may raise it only with ${value('increaseNoticeDays', '60')} days' written notice. If the Tenant declines, the Tenant may end the Agreement with ${value('tenantExitNoticeDays', '30')} days' written notice.`,
    },
    {
      heading: '9. Disputes and notices',
      body: 'The parties first try to settle disputes by discussion, then mediation, before going to court. Notices must be in writing and sent to the contacts above.',
    },
    {
      heading: '10. Governing law and entire agreement',
      body: 'This Agreement is governed by the laws of the Republic of Rwanda. It is the full agreement between the parties; changes must be in writing and signed by both parties.',
    },
    {
      heading: '11. Signatures',
      body: [
        'By signing below, both parties agree to the terms of this Agreement.',
        `Landlord: ${value('landlordName', 'Not provided')} — Signature: ______________________________`,
        'Date: ____________________',
        `Tenant: ${String(tenant.legalName ?? 'Not provided')} — Signature: ${signature ? signature.name : '______________________________'}`,
        `Date: ${signature ? signature.signedAt.toISOString().slice(0, 10) : '____________________'}`,
        fields.witnessRequired === true
          ? 'Witness name: ______________________________   Signature: ______________________________   Date: ____________________'
          : '',
        signature
          ? 'Tenant signature captured electronically through PropEase after affirmative consent.'
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    },
    ...(additionalTerms
      ? [{ heading: 'Special conditions', body: additionalTerms }]
      : []),
    {
      heading: 'Legal review notice',
      body: 'This agreement is a draft template for review. Have a qualified Rwandan lawyer or notary review and approve the wording and signing process before relying on it. PropEase does not provide legal advice or guarantee the enforceability of an electronic signature.',
    },
  ];
}

@Injectable()
export class TenantLeaseOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly pdf: PdfService,
  ) {}

  async create(
    organisationId: string,
    managerUserId: string,
    role: MembershipRole | undefined,
    input: CreateTenantLeaseOnboardingInput,
  ) {
    assertCanManage(role);
    validateAgreementFields(input.lease.agreement, input.tenant.phone);
    await this.assertAgreementCurrency(organisationId, input.lease.agreement);
    const moveInDate = asDate(input.moveInDate);
    const moveOutDate = input.moveOutDate ? asDate(input.moveOutDate) : null;
    const startDate = asDate(input.lease.startDate);
    const endDate = asDate(input.lease.endDate);
    if (moveOutDate && moveOutDate < moveInDate) {
      throw new BadRequestException(
        'Move-out date cannot be before move-in date',
      );
    }
    if (endDate < startDate) {
      throw new BadRequestException(
        'Lease end date must be on or after its start date',
      );
    }

    const token = createReviewToken();
    const expiresAt = new Date(Date.now() + tokenLifetimeMs);
    const created = await this.prisma.$transaction(
      async (transaction) => {
        const property = await transaction.property.findFirst({
          where: {
            id: input.propertyId,
            organisationId,
            ...(role === MembershipRole.MANAGER
              ? { assignments: { some: { userId: managerUserId } } }
              : {}),
          },
          select: { id: true, name: true, address: true },
        });
        if (!property) {
          throw new NotFoundException(
            'Property was not found in this organisation',
          );
        }
        await assertWholeFrancsIfRwf(transaction, organisationId, [
          input.lease.rentAmount,
          input.lease.depositAmount,
        ]);

        const unit = input.unitId
          ? await transaction.unit.findFirst({
              where: { id: input.unitId, propertyId: property.id },
              select: {
                id: true,
                unitNumber: true,
                rentAmount: true,
                depositAmount: true,
                status: true,
              },
            })
          : null;
        if (input.unitId && !unit) {
          throw new NotFoundException('Unit was not found in this property');
        }
        if (
          unit &&
          (unit.status === UnitStatus.ARCHIVED ||
            unit.status === UnitStatus.UNAVAILABLE)
        ) {
          throw new ConflictException(
            'This unit is not available for a tenancy',
          );
        }
        if (input.tenancyId) {
          const tenancy = await transaction.tenancy.findFirst({
            where: {
              id: input.tenancyId,
              propertyId: property.id,
              unitId: unit?.id ?? null,
              status: { in: [TenancyStatus.UPCOMING, TenancyStatus.ACTIVE] },
            },
            include: { tenant: true, deposit: true },
          });
          if (!tenancy) {
            throw new NotFoundException(
              'The selected tenancy was not found or is no longer active',
            );
          }
          const overlappingLease = await transaction.lease.findFirst({
            where: {
              tenancyId: tenancy.id,
              status: {
                in: [
                  LeaseStatus.DRAFT,
                  LeaseStatus.ACTIVE,
                  LeaseStatus.PENDING_TENANT_REVIEW,
                  LeaseStatus.CHANGES_REQUESTED,
                  LeaseStatus.TENANT_ACCEPTED,
                ],
              },
              startDate: { lte: endDate },
              endDate: { gte: startDate },
            },
            select: { id: true },
          });
          if (overlappingLease) {
            throw new ConflictException(
              'This tenancy already has a lease covering those dates',
            );
          }
          const tenant = await transaction.tenant.update({
            where: { id: tenancy.tenantId },
            data: {
              legalName: input.tenant.legalName.trim(),
              email: input.tenant.email.trim().toLowerCase(),
              phone: input.tenant.phone?.trim() || null,
              emergencyContactName:
                input.tenant.emergencyContactName?.trim() || null,
              emergencyContactPhone:
                input.tenant.emergencyContactPhone?.trim() || null,
            },
          });
          if (tenancy.deposit) {
            await transaction.deposit.update({
              where: { tenancyId: tenancy.id },
              data: { requiredAmount: new Prisma.Decimal(input.lease.depositAmount) },
            });
          } else {
            await transaction.deposit.create({
              data: {
                tenancyId: tenancy.id,
                requiredAmount: new Prisma.Decimal(input.lease.depositAmount),
                receivedAmount: new Prisma.Decimal(0),
                heldBalance: new Prisma.Decimal(0),
                status: DepositStatus.NOT_RECEIVED,
              },
            });
          }
          if (agreementDepositWasPaid(input.lease.agreement)) {
            await this.recordPaidDeposit(
              transaction,
              tenancy.id,
              managerUserId,
              input.lease.depositAmount,
              input.lease.agreement?.depositPaidDate,
            );
          }
          const lease = await transaction.lease.create({
            data: {
              tenancyId: tenancy.id,
              startDate,
              endDate,
              rentAmount: new Prisma.Decimal(input.lease.rentAmount),
              dueDay: input.lease.dueDay,
              paymentFrequency: input.lease.paymentFrequency.trim(),
              terms: input.lease.terms as Prisma.InputJsonValue | undefined,
              status: LeaseStatus.PENDING_TENANT_REVIEW,
            },
          });
          const onboarding = await transaction.tenantLeaseOnboarding.create({
            data: {
              leaseId: lease.id,
              managerUserId,
              tokenHash: tokenHash(token),
              expiresAt,
            },
          });
          const agreement = this.buildAgreement({
            lease,
            tenant,
            property,
            unit,
            tenancy,
            depositAmount: input.lease.depositAmount,
            agreementFields: input.lease.agreement,
            version: 1,
          });
          await transaction.leaseAgreementSnapshot.create({
            data: {
              onboardingId: onboarding.id,
              leaseId: lease.id,
              version: 1,
              createdByUserId: managerUserId,
              agreement: agreement as Prisma.InputJsonObject,
            },
          });
          return {
            tenantId: tenant.id,
            tenancyId: tenancy.id,
            leaseId: lease.id,
            onboardingId: onboarding.id,
            status: lease.status,
            expiresAt,
            tenantEmail: tenant.email!,
            tenantName: tenant.legalName,
            propertyName: property.name,
          };
        }
        const conflictingTenancy = await transaction.tenancy.findFirst({
          where: {
            ...(unit ? { unitId: unit.id } : { propertyId: property.id }),
            status: { in: [TenancyStatus.UPCOMING, TenancyStatus.ACTIVE] },
            moveInDate: {
              lte: moveOutDate ?? new Date('9999-12-31T00:00:00.000Z'),
            },
            OR: [{ moveOutDate: null }, { moveOutDate: { gte: moveInDate } }],
          },
          select: { id: true },
        });
        if (conflictingTenancy) {
          throw new ConflictException(
            'This rental space already has a tenancy during those dates',
          );
        }

        const tenant = await transaction.tenant.create({
          data: {
            organisationId,
            legalName: input.tenant.legalName.trim(),
            email: input.tenant.email.trim().toLowerCase(),
            phone: input.tenant.phone?.trim() || null,
            emergencyContactName:
              input.tenant.emergencyContactName?.trim() || null,
            emergencyContactPhone:
              input.tenant.emergencyContactPhone?.trim() || null,
          },
        });
        const tenancy = await transaction.tenancy.create({
          data: {
            tenantId: tenant.id,
            propertyId: property.id,
            unitId: unit?.id ?? null,
            rentalSpaceLabel: unit ? unit.unitNumber : property.name,
            moveInDate,
            moveOutDate,
            status: TenancyStatus.UPCOMING,
            deposit: {
              create: {
                requiredAmount: input.lease.depositAmount,
                receivedAmount: new Prisma.Decimal(0),
                heldBalance: new Prisma.Decimal(0),
                status: DepositStatus.NOT_RECEIVED,
              },
            },
          },
        });
        if (agreementDepositWasPaid(input.lease.agreement)) {
          await this.recordPaidDeposit(
            transaction,
            tenancy.id,
            managerUserId,
            input.lease.depositAmount,
            input.lease.agreement?.depositPaidDate,
          );
        }
        const lease = await transaction.lease.create({
          data: {
            tenancyId: tenancy.id,
            startDate,
            endDate,
            rentAmount: new Prisma.Decimal(input.lease.rentAmount),
            dueDay: input.lease.dueDay,
            paymentFrequency: input.lease.paymentFrequency.trim(),
            terms: input.lease.terms as Prisma.InputJsonValue | undefined,
            status: LeaseStatus.PENDING_TENANT_REVIEW,
          },
        });
        const onboarding = await transaction.tenantLeaseOnboarding.create({
          data: {
            leaseId: lease.id,
            managerUserId,
            tokenHash: tokenHash(token),
            expiresAt,
          },
        });
        const agreement = this.buildAgreement({
          lease,
          tenant,
          property,
          unit,
          tenancy,
          depositAmount: input.lease.depositAmount,
          agreementFields: input.lease.agreement,
          version: 1,
        });
        await transaction.leaseAgreementSnapshot.create({
          data: {
            onboardingId: onboarding.id,
            leaseId: lease.id,
            version: 1,
            createdByUserId: managerUserId,
            agreement: agreement as Prisma.InputJsonObject,
          },
        });
        return {
          tenantId: tenant.id,
          tenancyId: tenancy.id,
          leaseId: lease.id,
          onboardingId: onboarding.id,
          status: lease.status,
          expiresAt,
          tenantEmail: tenant.email!,
          tenantName: tenant.legalName,
          propertyName: property.name,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    const emailSent = await this.sendReviewEmail(
      created.tenantEmail,
      created.tenantName,
      created.propertyName,
      token,
      expiresAt,
    );
    return {
      tenantId: created.tenantId,
      tenancyId: created.tenancyId,
      leaseId: created.leaseId,
      onboardingId: created.onboardingId,
      status: created.status,
      expiresAt: created.expiresAt,
      emailSent,
    };
  }

  async preview(
    organisationId: string,
    managerUserId: string,
    role: MembershipRole | undefined,
    input: CreateTenantLeaseOnboardingInput,
  ): Promise<Buffer> {
    assertCanManage(role);
    validateAgreementFields(input.lease.agreement, input.tenant.phone);
    await this.assertAgreementCurrency(organisationId, input.lease.agreement);
    const property = await this.prisma.property.findFirst({
      where: {
        id: input.propertyId,
        organisationId,
        ...(role === MembershipRole.MANAGER
          ? { assignments: { some: { userId: managerUserId } } }
          : {}),
      },
      select: { id: true, name: true, address: true },
    });
    if (!property) {
      throw new NotFoundException('Property was not found in this organisation');
    }
    const unit = input.unitId
      ? await this.prisma.unit.findFirst({
          where: { id: input.unitId, propertyId: property.id },
          select: { id: true, unitNumber: true },
        })
      : null;
    if (input.unitId && !unit) {
      throw new NotFoundException('Unit was not found in this property');
    }
    const agreement = this.buildAgreement({
      lease: {
        id: 'preview',
        startDate: asDate(input.lease.startDate),
        endDate: asDate(input.lease.endDate),
        rentAmount: new Prisma.Decimal(input.lease.rentAmount),
        dueDay: input.lease.dueDay,
        paymentFrequency: input.lease.paymentFrequency,
        terms: JSON.parse(
          JSON.stringify(input.lease.terms ?? {}),
        ) as Prisma.JsonValue,
      },
      tenant: {
        id: 'preview',
        legalName: input.tenant.legalName,
        email: input.tenant.email,
        phone: input.tenant.phone ?? null,
        emergencyContactName: input.tenant.emergencyContactName ?? null,
        emergencyContactPhone: input.tenant.emergencyContactPhone ?? null,
      },
      property,
      unit,
      tenancy: {
        id: 'preview',
        moveInDate: asDate(input.moveInDate),
        moveOutDate: input.moveOutDate ? asDate(input.moveOutDate) : null,
        rentalSpaceLabel: unit?.unitNumber ?? property.name,
      },
      depositAmount: input.lease.depositAmount,
      agreementFields: input.lease.agreement,
      version: 1,
    });
    return this.pdf.renderDocument(
      'Residential Rental Agreement — Draft Preview',
      snapshotSections(agreement),
    );
  }

  async getPublicReview(token: string) {
    const { onboarding, snapshot } = await this.loadReview(token);
    const signature = snapshotSignature(snapshot.agreement);
    return {
      status: onboarding.lease.status,
      response: onboarding.responseAction,
      responseAt: onboarding.responseAt,
      tenantSignatureName: signature?.name ?? null,
      tenantSignedAt: signature?.signedAt ?? null,
      expiresAt: onboarding.expiresAt,
      agreementVersion: snapshot.version,
      agreement: snapshot.agreement,
    };
  }

  async getPublicDocument(token: string): Promise<Buffer> {
    const { snapshot } = await this.loadReview(token);
    return this.pdf.renderDocument(
      `Lease agreement — version ${snapshot.version}`,
      snapshotSections(
        snapshotJson(snapshot.agreement),
        snapshotSignature(snapshot.agreement),
      ),
    );
  }

  async getManagerSignedDocument(
    organisationId: string,
    managerUserId: string,
    role: MembershipRole | undefined,
    leaseId: string,
  ): Promise<Buffer> {
    assertCanManage(role);
    const onboarding = await this.prisma.tenantLeaseOnboarding.findFirst({
      where: {
        leaseId,
        lease: {
          tenancy: {
            property: {
              organisationId,
              ...(role === MembershipRole.MANAGER
                ? { assignments: { some: { userId: managerUserId } } }
                : {}),
            },
          },
        },
      },
      include: {
        lease: true,
        snapshots: { orderBy: { version: 'desc' }, take: 1 },
      },
    });
    if (!onboarding) {
      throw new NotFoundException('Lease was not found in this organisation');
    }
    if (
      onboarding.responseAction !== TenantLeaseReviewAction.ACCEPTED ||
      !onboarding.responseAt
    ) {
      throw new ConflictException('The tenant has not signed this lease yet');
    }
    const snapshot = onboarding.snapshots[0];
    if (!snapshot) {
      throw new ConflictException('No agreement snapshot is available');
    }
    const signature = snapshotSignature(snapshot.agreement);
    if (!signature) {
      throw new ConflictException('No tenant signature is available for this lease');
    }
    return this.pdf.renderDocument(
      `Signed lease agreement — version ${snapshot.version}`,
      snapshotSections(snapshotJson(snapshot.agreement), signature),
    );
  }

  async getManagerAgreementDocument(
    organisationId: string,
    managerUserId: string,
    role: MembershipRole | undefined,
    leaseId: string,
  ): Promise<Buffer> {
    assertCanManage(role);
    const onboarding = await this.prisma.tenantLeaseOnboarding.findFirst({
      where: {
        leaseId,
        lease: {
          tenancy: {
            property: {
              organisationId,
              ...(role === MembershipRole.MANAGER
                ? { assignments: { some: { userId: managerUserId } } }
                : {}),
            },
          },
        },
      },
      include: {
        snapshots: { orderBy: { version: 'desc' }, take: 1 },
      },
    });
    if (!onboarding) {
      throw new NotFoundException('Lease agreement was not found in this organisation');
    }
    const snapshot = onboarding.snapshots[0];
    if (!snapshot) {
      throw new ConflictException('No generated agreement is available for this lease');
    }
    return this.pdf.renderDocument(
      `${snapshotSignature(snapshot.agreement) ? 'Signed lease agreement' : 'Lease agreement'} — version ${snapshot.version}`,
      snapshotSections(
        snapshotJson(snapshot.agreement),
        snapshotSignature(snapshot.agreement),
      ),
    );
  }

  async respond(token: string, input: TenantLeaseReviewInput) {
    const { onboarding, snapshot } = await this.loadReview(token);
    if (
      onboarding.responseAt ||
      onboarding.lease.status !== LeaseStatus.PENDING_TENANT_REVIEW
    ) {
      throw new ConflictException('This lease offer has already been reviewed');
    }
    if (
      input.response === TenantLeaseReviewAction.CHANGES_REQUESTED &&
      !input.message?.trim()
    ) {
      throw new BadRequestException(
        'A note is required when requesting changes',
      );
    }
    if (input.response === TenantLeaseReviewAction.ACCEPTED) {
      const signatureName = input.signatureName?.trim();
      const tenantName = onboarding.lease.tenancy.tenant.legalName.trim();
      if (!input.signatureConsent || !signatureName) {
        throw new BadRequestException(
          'Enter your legal name and confirm that you intend to sign this agreement',
        );
      }
      if (signatureName.toLocaleLowerCase() !== tenantName.toLocaleLowerCase()) {
        throw new BadRequestException(
          'The electronic signature must match the tenant name on the agreement',
        );
      }
    }

    const now = new Date();
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    if (
      input.response === TenantLeaseReviewAction.ACCEPTED &&
      onboarding.lease.endDate < today
    ) {
      throw new ConflictException(
        'This lease offer has expired. Contact your property manager for an updated offer.',
      );
    }
    const status =
      input.response === TenantLeaseReviewAction.ACCEPTED
        ? onboarding.lease.startDate <= today
          ? LeaseStatus.ACTIVE
          : LeaseStatus.TENANT_ACCEPTED
        : input.response === TenantLeaseReviewAction.CHANGES_REQUESTED
          ? LeaseStatus.CHANGES_REQUESTED
          : LeaseStatus.TENANT_DECLINED;

    await this.prisma.$transaction(
      async (transaction) => {
        const claimed = await transaction.tenantLeaseOnboarding.updateMany({
          where: {
            id: onboarding.id,
            tokenHash: tokenHash(token),
            expiresAt: { gt: now },
            responseAt: null,
          },
          data: {
            responseAt: now,
            responseAction: input.response,
            responseNote: input.message?.trim() || null,
          },
        });
        if (claimed.count !== 1) {
          throw new ConflictException(
            'This lease offer has already been reviewed',
          );
        }
        const updatedLease = await transaction.lease.updateMany({
          where: {
            id: onboarding.leaseId,
            status: LeaseStatus.PENDING_TENANT_REVIEW,
          },
          data: {
            status,
            ...(input.response === TenantLeaseReviewAction.ACCEPTED ? { signedAt: now } : {}),
          },
        });
        if (updatedLease.count !== 1) {
          throw new ConflictException(
            'This lease offer is no longer reviewable',
          );
        }
        if (input.response === TenantLeaseReviewAction.ACCEPTED) {
          const tenancy = await transaction.tenancy.findUniqueOrThrow({
            where: { id: onboarding.lease.tenancyId },
            select: {
              id: true,
              unitId: true,
              moveInDate: true,
              moveOutDate: true,
            },
          });
          if (tenancy.moveOutDate && tenancy.moveOutDate < today) {
            throw new ConflictException('This tenancy has already ended');
          }
          const tenancyStatus =
            tenancy.moveInDate <= today && onboarding.lease.startDate <= today
              ? TenancyStatus.ACTIVE
              : TenancyStatus.UPCOMING;
          await transaction.tenancy.update({
            where: { id: tenancy.id },
            data: { status: tenancyStatus },
          });
          if (tenancy.unitId && tenancyStatus === TenancyStatus.ACTIVE) {
            await transaction.unit.updateMany({
              where: {
                id: tenancy.unitId,
                status: { not: UnitStatus.ARCHIVED },
              },
              data: { status: UnitStatus.OCCUPIED },
            });
          }
          await transaction.leaseAgreementSnapshot.create({
            data: {
              onboardingId: onboarding.id,
              leaseId: onboarding.leaseId,
              version: snapshot.version + 1,
              createdByUserId: onboarding.managerUserId,
              agreement: {
                ...snapshotJson(snapshot.agreement),
                execution: {
                  tenantSignatureName: input.signatureName!.trim(),
                  tenantSignedAt: now.toISOString(),
                },
              } as Prisma.InputJsonObject,
            },
          });
        } else if (input.response === TenantLeaseReviewAction.DECLINED) {
          await transaction.tenancy.update({
            where: { id: onboarding.lease.tenancyId },
            data: { status: TenancyStatus.TERMINATED },
          });
        }
        await transaction.notification.create({
          data: {
            organisationId: onboarding.lease.tenancy.property.organisationId,
            userId: onboarding.managerUserId,
            channel: 'IN_APP',
            template: 'tenant_lease_review_response',
            status: 'SENT',
            sentAt: now,
            deduplicationKey: `tenant-lease-response:${onboarding.id}:${onboarding.generation}`,
            payload: {
              title: 'Tenant lease response',
              message: this.responseMessage(
                input.response,
                onboarding.lease.tenancy.tenant.legalName,
              ),
              leaseId: onboarding.leaseId,
              tenancyId: onboarding.lease.tenancyId,
              response: input.response,
              responseMessage: input.message?.trim() ?? '',
              ...(input.response === TenantLeaseReviewAction.ACCEPTED
                ? {
                    tenantSignatureName: input.signatureName!.trim(),
                    tenantSignedAt: now.toISOString(),
                  }
                : {}),
            } satisfies Prisma.InputJsonObject,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return {
      leaseId: onboarding.leaseId,
      status,
      response: input.response,
      responseAt: now,
      tenantSignatureName:
        input.response === TenantLeaseReviewAction.ACCEPTED
          ? input.signatureName!.trim()
          : null,
      tenantSignedAt:
        input.response === TenantLeaseReviewAction.ACCEPTED ? now : null,
    };
  }

  async resend(
    organisationId: string,
    managerUserId: string,
    role: MembershipRole | undefined,
    leaseId: string,
    input: ResendTenantLeaseOnboardingInput,
  ) {
    assertCanManage(role);
    await this.assertAgreementCurrency(organisationId, input.lease?.agreement);
    const token = createReviewToken();
    const expiresAt = new Date(Date.now() + tokenLifetimeMs);
    const updated = await this.prisma.$transaction(
      async (transaction) => {
        const onboarding = await transaction.tenantLeaseOnboarding.findFirst({
          where: {
            leaseId,
            lease: {
              tenancy: {
                property: {
                  organisationId,
                  ...(role === MembershipRole.MANAGER
                    ? { assignments: { some: { userId: managerUserId } } }
                    : {}),
                },
              },
            },
          },
          include: {
            lease: {
              include: {
                tenancy: {
                  include: {
                    tenant: true,
                    property: {
                      select: { id: true, name: true, address: true },
                    },
                    unit: {
                      select: { id: true, unitNumber: true },
                    },
                    deposit: true,
                  },
                },
              },
            },
            snapshots: { orderBy: { version: 'desc' }, take: 1 },
          },
        });
        if (!onboarding) {
          throw new NotFoundException(
            'Lease offer was not found in this organisation',
          );
        }
        if (
          onboarding.lease.status !== LeaseStatus.CHANGES_REQUESTED &&
          onboarding.lease.status !== LeaseStatus.PENDING_TENANT_REVIEW
        ) {
          throw new ConflictException(
            'Only pending or change-requested offers can be resent',
          );
        }
        const hasEdits = Object.values(input).some(
          (value) => value !== undefined,
        );
        const current = onboarding.lease;
        const tenant = current.tenancy.tenant;
        const latestAgreement = onboarding.snapshots[0]
          ? snapshotJson(onboarding.snapshots[0].agreement)
          : {};
        const latestLease =
          latestAgreement.lease && typeof latestAgreement.lease === 'object'
            ? (latestAgreement.lease as Record<string, unknown>)
            : {};
        const previousAgreementFields =
          latestLease.agreement && typeof latestLease.agreement === 'object'
            ? (latestLease.agreement as LeaseAgreementFieldsInput)
            : undefined;
        const agreementFields =
          input.lease?.agreement ?? previousAgreementFields;
        validateAgreementFields(
          agreementFields,
          input.tenant?.phone ?? tenant.phone ?? undefined,
        );
        const lease = current;
        const tenancy = current.tenancy;
        const startDate = input.lease?.startDate
          ? asDate(input.lease.startDate)
          : lease.startDate;
        const endDate = input.lease?.endDate
          ? asDate(input.lease.endDate)
          : lease.endDate;
        const moveInDate = input.moveInDate
          ? asDate(input.moveInDate)
          : tenancy.moveInDate;
        const moveOutDate =
          input.moveOutDate === undefined
            ? tenancy.moveOutDate
            : input.moveOutDate
              ? asDate(input.moveOutDate)
              : null;
        if (endDate < startDate) {
          throw new BadRequestException(
            'Lease end date must be on or after its start date',
          );
        }
        if (moveOutDate && moveOutDate < moveInDate) {
          throw new BadRequestException(
            'Move-out date cannot be before move-in date',
          );
        }
        const conflictingTenancy = await transaction.tenancy.findFirst({
          where: {
            id: { not: tenancy.id },
            ...(tenancy.unitId
              ? { unitId: tenancy.unitId }
              : { propertyId: tenancy.propertyId }),
            status: { in: [TenancyStatus.UPCOMING, TenancyStatus.ACTIVE] },
            moveInDate: {
              lte: moveOutDate ?? new Date('9999-12-31T00:00:00.000Z'),
            },
            OR: [{ moveOutDate: null }, { moveOutDate: { gte: moveInDate } }],
          },
          select: { id: true },
        });
        if (conflictingTenancy) {
          throw new ConflictException(
            'This rental space already has a tenancy during those dates',
          );
        }
        const updatedTenant = await transaction.tenant.update({
          where: { id: tenant.id },
          data: {
            legalName: input.tenant?.legalName?.trim(),
            email: input.tenant?.email?.trim().toLowerCase(),
            phone:
              input.tenant?.phone === undefined
                ? undefined
                : input.tenant.phone.trim() || null,
            emergencyContactName:
              input.tenant?.emergencyContactName === undefined
                ? undefined
                : input.tenant.emergencyContactName.trim() || null,
            emergencyContactPhone:
              input.tenant?.emergencyContactPhone === undefined
                ? undefined
                : input.tenant.emergencyContactPhone.trim() || null,
          },
        });
        const rentAmount =
          input.lease?.rentAmount ?? lease.rentAmount.toString();
        const depositAmount =
          input.lease?.depositAmount ??
          current.tenancy.deposit?.requiredAmount.toString() ??
          '0';
        await assertWholeFrancsIfRwf(transaction, organisationId, [
          input.lease?.rentAmount,
          input.lease?.depositAmount,
        ]);
        const updatedLease = await transaction.lease.update({
          where: { id: lease.id },
          data: {
            startDate,
            endDate,
            rentAmount: new Prisma.Decimal(rentAmount),
            dueDay: input.lease?.dueDay,
            paymentFrequency:
              input.lease?.paymentFrequency?.trim() || undefined,
            terms: input.lease?.terms
              ? (input.lease.terms as Prisma.InputJsonValue)
              : undefined,
            status: LeaseStatus.PENDING_TENANT_REVIEW,
          },
        });
        await transaction.tenancy.update({
          where: { id: tenancy.id },
          data: {
            moveInDate,
            moveOutDate,
            status: TenancyStatus.UPCOMING,
          },
        });
        if (current.tenancy.deposit) {
          await transaction.deposit.update({
            where: { tenancyId: tenancy.id },
            data: {
              requiredAmount: new Prisma.Decimal(depositAmount),
            },
          });
        }

        const nextGeneration = onboarding.generation + 1;
        const updatedOnboarding =
          await transaction.tenantLeaseOnboarding.update({
            where: { id: onboarding.id },
            data: {
              tokenHash: tokenHash(token),
              expiresAt,
              generation: nextGeneration,
              responseAt: null,
              responseAction: null,
              responseNote: null,
            },
          });
        if (hasEdits) {
          const agreement = this.buildAgreement({
            lease: updatedLease,
            tenant: updatedTenant,
            property: current.tenancy.property,
            unit: current.tenancy.unit,
            tenancy: {
              ...tenancy,
              moveInDate,
              moveOutDate,
            },
            depositAmount,
            agreementFields,
            version: (onboarding.snapshots[0]?.version ?? 0) + 1,
          });
          await transaction.leaseAgreementSnapshot.create({
            data: {
              onboardingId: onboarding.id,
              leaseId: lease.id,
              version: (onboarding.snapshots[0]?.version ?? 0) + 1,
              createdByUserId: managerUserId,
              agreement: agreement as Prisma.InputJsonObject,
            },
          });
        }
        return {
          tenantEmail: updatedTenant.email ?? '',
          tenantName: updatedTenant.legalName,
          propertyName: current.tenancy.property.name,
          leaseId: updatedLease.id,
          onboardingId: updatedOnboarding.id,
          generation: nextGeneration,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    const emailSent = await this.sendReviewEmail(
      updated.tenantEmail,
      updated.tenantName,
      updated.propertyName,
      token,
      expiresAt,
    );
    return {
      leaseId: updated.leaseId,
      onboardingId: updated.onboardingId,
      status: LeaseStatus.PENDING_TENANT_REVIEW,
      generation: updated.generation,
      expiresAt,
      emailSent,
    };
  }

  private async loadReview(token: string) {
    if (!token || token.length > 128) {
      throw new NotFoundException('Lease review link is invalid or expired');
    }
    const onboarding = await this.prisma.tenantLeaseOnboarding.findUnique({
      where: { tokenHash: tokenHash(token) },
      include: {
        lease: {
          include: {
            tenancy: {
              select: {
                id: true,
                propertyId: true,
                property: { select: { organisationId: true } },
                tenant: { select: { legalName: true } },
              },
            },
          },
        },
        snapshots: { orderBy: { version: 'desc' }, take: 1 },
      },
    });
    if (!onboarding || onboarding.expiresAt <= new Date()) {
      throw new GoneException('Lease review link is invalid or expired');
    }
    const snapshot = onboarding.snapshots[0];
    if (!snapshot) {
      throw new ConflictException('No agreement snapshot is available');
    }
    return { onboarding, snapshot };
  }

  private async assertAgreementCurrency(
    organisationId: string,
    fields?: LeaseAgreementFieldsInput,
  ): Promise<void> {
    if (!fields?.currency) return;
    const organisation = await this.prisma.organisation.findUnique({
      where: { id: organisationId },
      select: { currency: true },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation was not found');
    }
    if (fields.currency !== organisation.currency) {
      throw new BadRequestException(
        'Lease currency must match the organisation currency',
      );
    }
  }

  private async recordPaidDeposit(
    transaction: Prisma.TransactionClient,
    tenancyId: string,
    recordedBy: string,
    amountValue: string,
    paidDate?: string,
  ): Promise<void> {
    const amount = new Prisma.Decimal(amountValue);
    if (amount.lte(0)) return;
    const deposit = await transaction.deposit.findUnique({
      where: { tenancyId },
    });
    if (!deposit) {
      throw new ConflictException('The tenancy deposit record is missing');
    }
    if (deposit.receivedAmount.gte(amount)) return;

    const additionalReceipt = amount.minus(deposit.receivedAmount);
    const receivedAmount = deposit.receivedAmount.plus(additionalReceipt);
    const heldBalance = deposit.heldBalance.plus(additionalReceipt);
    await transaction.deposit.update({
      where: { tenancyId },
      data: {
        receivedAmount,
        heldBalance,
        status: receivedAmount.gte(deposit.requiredAmount)
          ? DepositStatus.HELD
          : DepositStatus.PARTIALLY_RECEIVED,
      },
    });
    await transaction.depositTransaction.create({
      data: {
        depositId: deposit.id,
        type: DepositTransactionType.RECEIPT,
        amount: additionalReceipt,
        date: paidDate ? asDate(paidDate) : asDate(new Date().toISOString()),
        reason: 'Deposit recorded as paid in the lease agreement',
        recordedBy,
      },
    });
  }

  private buildAgreement(input: {
    lease: {
      id: string;
      startDate: Date;
      endDate: Date;
      rentAmount: Prisma.Decimal;
      dueDay: number;
      paymentFrequency: string;
      terms: Prisma.JsonValue | null;
    };
    tenant: {
      id: string;
      legalName: string;
      email: string | null;
      phone: string | null;
      emergencyContactName?: string | null;
      emergencyContactPhone?: string | null;
    };
    property: { id: string; name: string; address: string };
    unit: { id: string; unitNumber: string } | null;
    tenancy: {
      id: string;
      moveInDate: Date;
      moveOutDate: Date | null;
      rentalSpaceLabel: string | null;
    };
    depositAmount: string;
    agreementFields?: LeaseAgreementFieldsInput;
    version: number;
  }): Prisma.JsonObject {
    return {
      version: input.version,
      leaseId: input.lease.id,
      tenant: {
        id: input.tenant.id,
        legalName: input.tenant.legalName,
        email: input.tenant.email,
        phone: input.tenant.phone,
        emergencyContactName: input.tenant.emergencyContactName ?? null,
        emergencyContactPhone: input.tenant.emergencyContactPhone ?? null,
      },
      property: {
        id: input.property.id,
        name: input.property.name,
        address: input.property.address,
      },
      rentalSpace: {
        id: input.unit?.id ?? null,
        label:
          input.unit?.unitNumber ??
          input.tenancy.rentalSpaceLabel ??
          'Entire property',
      },
      tenancy: {
        id: input.tenancy.id,
        moveInDate: input.tenancy.moveInDate.toISOString().slice(0, 10),
        moveOutDate:
          input.tenancy.moveOutDate?.toISOString().slice(0, 10) ?? null,
      },
      lease: {
        id: input.lease.id,
        startDate: input.lease.startDate.toISOString().slice(0, 10),
        endDate: input.lease.endDate.toISOString().slice(0, 10),
        rentAmount: input.lease.rentAmount.toString(),
        depositAmount: new Prisma.Decimal(input.depositAmount).toString(),
        dueDay: input.lease.dueDay,
        paymentFrequency: input.lease.paymentFrequency,
        terms: input.lease.terms ?? {},
        agreement: {
          agreementDate: new Date().toISOString().slice(0, 10),
          ...(input.agreementFields as Record<string, Prisma.InputJsonValue> | undefined),
        },
      },
    };
  }

  private async sendReviewEmail(
    email: string,
    tenantName: string,
    propertyName: string,
    token: string,
    expiresAt: Date,
  ): Promise<boolean> {
    if (!email) return false;
    try {
      const url = reviewUrl(this.config, token);
      await this.email.send(
        email,
        `Review your lease for ${propertyName}`,
        [
          `Hello ${tenantName},`,
          '',
          `Your lease offer for ${propertyName} is ready for review.`,
          `Review it securely here: ${url}`,
          '',
          `This link expires on ${expiresAt.toISOString()}.`,
          'If you were not expecting this offer, contact your property manager.',
        ].join('\n'),
      );
      return true;
    } catch {
      return false;
    }
  }

  private responseMessage(
    action: TenantLeaseReviewAction,
    tenantName: string,
  ): string {
    switch (action) {
      case TenantLeaseReviewAction.ACCEPTED:
        return `${tenantName} accepted the lease offer.`;
      case TenantLeaseReviewAction.CHANGES_REQUESTED:
        return `${tenantName} requested changes to the lease offer.`;
      case TenantLeaseReviewAction.DECLINED:
        return `${tenantName} declined the lease offer.`;
    }
  }
}
