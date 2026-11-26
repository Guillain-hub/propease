import { TenantLeaseReviewAction } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const moneyPattern = /^\d{1,10}(\.\d{1,2})?$/;
const utilityPayers = ['LANDLORD', 'TENANT'];

export class TenantLeaseUtilityPayersInput {
  @IsOptional()
  @IsIn(utilityPayers)
  water?: string;

  @IsOptional()
  @IsIn(utilityPayers)
  electricity?: string;

  @IsOptional()
  @IsIn(utilityPayers)
  garbage?: string;

  @IsOptional()
  @IsIn(utilityPayers)
  security?: string;

  @IsOptional()
  @IsIn(utilityPayers)
  internet?: string;

  @IsOptional()
  @IsIn(utilityPayers)
  serviceCharges?: string;
}

export class LeaseAgreementFieldsInput {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(180)
  landlordName?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80)
  landlordId?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120)
  landlordIdPlace?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(32)
  landlordTel?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(180)
  tenantId?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120)
  tenantIdPlace?: string;
  @IsOptional() @Matches(/^[A-Z]{3}$/)
  currency?: string;
  @IsOptional() @IsInt() @Min(1) @Max(365)
  renewalNoticeDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(365)
  holdoverNoticeDays?: number;
  @IsOptional() @IsIn(['BANK_TRANSFER', 'MOBILE_MONEY', 'CASH'])
  paymentMethod?: string;
  @IsOptional() @IsString() @MaxLength(180)
  paymentAccount?: string;
  @IsOptional() @IsBoolean()
  advancePaid?: boolean;
  @IsOptional() @Matches(moneyPattern)
  advanceAmount?: string;
  @IsOptional() @IsDateString()
  advanceStart?: string;
  @IsOptional() @IsDateString()
  advanceEnd?: string;
  @IsOptional() @IsBoolean()
  lateFeeEnabled?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(365)
  lateDays?: number;
  @IsOptional() @Matches(moneyPattern)
  lateFee?: string;
  @IsOptional() @IsInt() @Min(1) @Max(365)
  lateNoticeDays?: number;
  @IsOptional() @IsBoolean()
  depositPaid?: boolean;
  @IsOptional() @IsDateString()
  depositPaidDate?: string;
  @IsOptional() @IsInt() @Min(1) @Max(365)
  depositReturnDays?: number;
  @IsOptional() @ValidateNested() @Type(() => TenantLeaseUtilityPayersInput)
  utilities?: TenantLeaseUtilityPayersInput;
  @IsOptional() @IsInt() @Min(1) @Max(720)
  inspectionNoticeHours?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100)
  maxOccupants?: number;
  @IsOptional() @IsBoolean()
  petsAllowed?: boolean;
  @IsOptional() @IsBoolean()
  subletAllowed?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(365)
  tenantExitNoticeDays?: number;
  @IsOptional() @Matches(moneyPattern)
  earlyExitPenalty?: string;
  @IsOptional() @IsInt() @Min(1) @Max(365)
  breachFixDays?: number;
  @IsOptional() @IsInt() @Min(0) @Max(600)
  rentFixedMonths?: number;
  @IsOptional() @IsInt() @Min(1) @Max(365)
  increaseNoticeDays?: number;
  @IsOptional() @IsIn(['WRITTEN_LETTER', 'EMAIL', 'WHATSAPP_SMS'])
  noticeMethod?: string;
  @IsOptional() @IsBoolean()
  witnessRequired?: boolean;
  @IsOptional() @IsString() @MaxLength(4000)
  specialConditions?: string;
}

export class TenantLeaseOfferTenantInput {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  legalName!: string;

  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  emergencyContactPhone?: string;
}

export class TenantLeaseOfferTermsInput {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @Matches(moneyPattern)
  rentAmount!: string;

  @Matches(moneyPattern)
  depositAmount!: string;

  @IsInt()
  @Min(1)
  @Max(31)
  dueDay!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(32)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsIn(['MONTHLY'])
  paymentFrequency!: string;

  @IsOptional()
  @IsObject()
  terms?: Record<string, unknown>;

  @IsOptional()
  @ValidateNested()
  @Type(() => LeaseAgreementFieldsInput)
  agreement?: LeaseAgreementFieldsInput;
}

export class CreateTenantLeaseOnboardingInput {
  @IsOptional()
  @IsString()
  @Matches(uuidPattern)
  tenancyId?: string;

  @IsString()
  @Matches(uuidPattern)
  propertyId!: string;

  @IsOptional()
  @IsString()
  @Matches(uuidPattern)
  unitId?: string | null;

  @IsDateString()
  moveInDate!: string;

  @IsOptional()
  @IsDateString()
  moveOutDate?: string;

  @ValidateNested()
  @Type(() => TenantLeaseOfferTenantInput)
  tenant!: TenantLeaseOfferTenantInput;

  @ValidateNested()
  @Type(() => TenantLeaseOfferTermsInput)
  lease!: TenantLeaseOfferTermsInput;
}

export class TenantLeaseReviewInput {
  @IsEnum(TenantLeaseReviewAction)
  response!: TenantLeaseReviewAction;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  signatureName?: string;

  @IsOptional()
  @IsBoolean()
  signatureConsent?: boolean;
}

export class TenantLeaseOfferUpdateTenantInput {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  legalName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  emergencyContactPhone?: string;
}

export class TenantLeaseOfferUpdateTermsInput {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Matches(moneyPattern)
  rentAmount?: string;

  @IsOptional()
  @Matches(moneyPattern)
  depositAmount?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dueDay?: number;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsIn(['MONTHLY'])
  paymentFrequency?: string;

  @IsOptional()
  @IsObject()
  terms?: Record<string, unknown>;

  @IsOptional()
  @ValidateNested()
  @Type(() => LeaseAgreementFieldsInput)
  agreement?: LeaseAgreementFieldsInput;
}

export class ResendTenantLeaseOnboardingInput {
  @IsOptional()
  @ValidateNested()
  @Type(() => TenantLeaseOfferUpdateTenantInput)
  tenant?: TenantLeaseOfferUpdateTenantInput;

  @IsOptional()
  @ValidateNested()
  @Type(() => TenantLeaseOfferUpdateTermsInput)
  lease?: TenantLeaseOfferUpdateTermsInput;

  @IsOptional()
  @IsDateString()
  moveInDate?: string;

  @IsOptional()
  @IsDateString()
  moveOutDate?: string;
}
