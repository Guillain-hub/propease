import { TenantLeaseReviewAction } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
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
}

export class CreateTenantLeaseOnboardingInput {
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
