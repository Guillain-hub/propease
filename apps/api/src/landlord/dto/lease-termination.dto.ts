import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateLeaseTerminationRequestInput {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class LeaseTerminationResponseInput {
  @IsBoolean()
  accepted!: boolean;
}
