import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateUploadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @MaxLength(160)
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(20 * 1024 * 1024)
  sizeBytes!: number;
}
