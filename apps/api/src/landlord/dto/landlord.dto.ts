import {
  BillingCycle,
  InspectionType,
  LeaseStatus,
  MaintenancePriority,
  MaintenanceStatus,
  NoticeType,
  PaymentMethod,
  PropertyType,
  PropertyStatus,
  UnitStatus,
  DepositTransactionType,
  DocumentStatus,
  MembershipRole,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  ArrayUnique,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const moneyPattern = /^\d{1,10}(\.\d{1,2})?$/;

export class PropertyInput {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @IsEnum(PropertyType)
  type!: PropertyType;

  @IsString()
  @MinLength(4)
  @MaxLength(500)
  address!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  propertyOwnerId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  photoFileId?: string;
}

export class PropertyUpdateInput {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name?: string;

  @IsOptional()
  @IsEnum(PropertyType)
  type?: PropertyType;

  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  propertyOwnerId?: string | null;

  @IsOptional()
  @IsEnum(PropertyStatus)
  status?: PropertyStatus;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  photoFileId?: string | null;
}

export class UnitInput {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  unitNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  floor?: string;

  @Matches(moneyPattern)
  rentAmount!: string;

  @Matches(moneyPattern)
  depositAmount!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  bedrooms?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  bathrooms?: number;

  @IsOptional()
  @Matches(moneyPattern)
  sizeSqm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  utilityArrangement?: string;

  @IsOptional()
  @IsEnum(UnitStatus)
  status?: UnitStatus;
}

export class UnitUpdateInput {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  unitNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  floor?: string;

  @IsOptional()
  @Matches(moneyPattern)
  rentAmount?: string;

  @IsOptional()
  @Matches(moneyPattern)
  depositAmount?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  bedrooms?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  bathrooms?: number;

  @IsOptional()
  @Matches(moneyPattern)
  sizeSqm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  utilityArrangement?: string;

  @IsOptional()
  @IsEnum(UnitStatus)
  status?: UnitStatus;
}

export class TenantInput {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  legalName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  emergencyContactPhone?: string;
}

export class TenantUpdateInput {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  emergencyContactPhone?: string;
}

export class TenancyInput {
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  tenantId!: string;

  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  unitId!: string;

  @IsDateString()
  moveInDate!: string;

  @IsOptional()
  @IsDateString()
  moveOutDate?: string;
}

export class MoveOutInput {
  @IsDateString()
  moveOutDate!: string;
}

export class LeaseInput {
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  tenancyId!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @Matches(moneyPattern)
  rentAmount!: string;

  @IsInt()
  @Min(1)
  @Max(28)
  dueDay!: number;

  @IsOptional()
  @IsEnum(LeaseStatus)
  status?: LeaseStatus;

  @IsOptional()
  @IsDateString()
  signedAt?: string;

  @IsOptional()
  terms?: Record<string, unknown>;
}

export class LeaseStatusInput {
  @IsEnum(LeaseStatus)
  status!: LeaseStatus;

  @IsOptional()
  @IsDateString()
  signedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  terminationReason?: string;
}

export class InspectionItemInput {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  area!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  condition!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

export class InspectionInput {
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  unitId!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  tenancyId?: string;

  @IsEnum(InspectionType)
  type!: InspectionType;

  @IsDateString()
  inspectedAt!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i)
  inspectorId?: string;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InspectionItemInput)
  items?: InspectionItemInput[];
}

export class InspectionMediaInput {
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  fileId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  caption?: string;
}

export class LeaseDocumentInput {
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  fileId!: string;

  @IsEnum(DocumentStatus)
  documentStatus!: DocumentStatus;
}

export class FileEvidenceInput {
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  fileId!: string;
}

export class ChargeInput {
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  tenancyId!: string;

  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period!: string;

  @IsDateString()
  dueDate!: string;

  @Matches(moneyPattern)
  amount!: string;
}

export class PaymentAllocationInput {
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  rentChargeId!: string;

  @Matches(moneyPattern)
  amount!: string;
}

export class PaymentInput {
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  tenantId!: string;

  @Matches(moneyPattern)
  amount!: string;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  reference?: string;

  @IsDateString()
  receivedAt!: string;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationInput)
  allocations!: PaymentAllocationInput[];
}

export class ReversalInput {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class DepositTransactionInput {
  @IsEnum(DepositTransactionType)
  type!: DepositTransactionType;

  @Matches(moneyPattern)
  amount!: string;

  @IsDateString()
  date!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ExpenseInput {
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  propertyId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  category!: string;

  @Matches(moneyPattern)
  amount!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  supplier?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  evidenceFileId?: string;
}

export class UtilityAllocationInput {
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  unitId!: string;

  @Matches(moneyPattern)
  amount!: string;

  @IsString()
  @MaxLength(80)
  calculationMethod!: string;
}

export class UtilityInput {
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  propertyId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  utilityType!: string;

  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  period!: string;

  @Matches(moneyPattern)
  totalAmount!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  evidenceFileId?: string;

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => UtilityAllocationInput)
  allocations!: UtilityAllocationInput[];
}

export class MaintenanceInput {
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  unitId!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  tenantId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  category!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(10000)
  description!: string;

  @IsEnum(MaintenancePriority)
  priority!: MaintenancePriority;
}

export class MaintenanceUpdateInput {
  @IsEnum(MaintenanceStatus)
  status!: MaintenanceStatus;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  assignedToUserId?: string;

  @IsOptional()
  @Matches(moneyPattern)
  estimatedCost?: string;

  @IsOptional()
  @Matches(moneyPattern)
  actualCost?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  resolutionNotes?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  invoiceFileId?: string;
}

export class NoticeInput {
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  tenancyId!: string;

  @IsEnum(NoticeType)
  type!: NoticeType;

  @IsDateString()
  issueDate!: string;

  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  recipient?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  deliveryMethod?: string;
}

export class TeamInviteInput {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsEnum(MembershipRole)
  role!: MembershipRole;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, { each: true })
  propertyIds?: string[];
}

export class TeamRoleInput {
  @IsEnum(MembershipRole)
  role!: MembershipRole;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, { each: true })
  propertyIds?: string[];
}

export class PropertyOwnerInput {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;
}

export class PropertyOwnerUpdateInput {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string | null;
}

export class OrganisationSettingsInput {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @IsString()
  @Matches(/^[A-Z]{2}$/)
  country!: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
}

export class SubscriptionCycleInput {
  @IsEnum(BillingCycle)
  billingCycle!: BillingCycle;
}

export class SubscriptionPaymentInput {
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  reference!: string;

  @Matches(moneyPattern)
  amount!: string;

  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  proofFileId!: string;
}
