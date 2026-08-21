import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class UpdateCronConfigDto {
  @IsString()
  @IsOptional()
  cronExpression?: string;

  @IsString()
  @IsOptional()
  displayName?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;

  @IsString()
  @IsOptional()
  category?: string;
}
