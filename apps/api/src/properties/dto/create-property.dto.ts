import { PropertyType } from '@prisma/client';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePropertyDto {
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
}
