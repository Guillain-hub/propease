import { OrganisationType } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Matches,
  ValidateIf,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/i)
  invitationToken?: string;

  @ValidateIf((input: RegisterDto) => !input.invitationToken)
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  organisationName?: string;

  @ValidateIf((input: RegisterDto) => !input.invitationToken)
  @IsEnum(OrganisationType)
  organisationType?: OrganisationType;
}
