import { BillingCycle } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, Matches } from 'class-validator';

export class ReportQuery {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class SelectPlanInput {
  @IsString()
  @Matches(/^[a-z0-9-]{2,80}$/)
  planSlug!: string;

  @IsEnum(BillingCycle)
  billingCycle!: BillingCycle;
}
