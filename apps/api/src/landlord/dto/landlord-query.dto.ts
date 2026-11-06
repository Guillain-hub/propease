import { BillingCycle } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, Matches } from 'class-validator';

export class ReportQuery {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  ownerId?: string;
}

export class SelectPlanInput {
  @IsString()
  @Matches(/^[a-z0-9-]{2,80}$/)
  planSlug!: string;

  @IsEnum(BillingCycle)
  billingCycle!: BillingCycle;
}
