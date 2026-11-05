import { OrganisationType } from '@prisma/client';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateOrganisationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @IsEnum(OrganisationType)
  type!: OrganisationType;
}
