import { OrganisationType } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class GoogleAuthStartDto {
  @IsEnum(['login', 'register'])
  flow!: 'login' | 'register';

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  organisationName?: string;

  @IsOptional()
  @IsEnum(OrganisationType)
  organisationType?: OrganisationType;

  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/i)
  invitationToken?: string;
}
