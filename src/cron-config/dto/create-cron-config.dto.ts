import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class CreateCronConfigDto {
  @IsString()
  taskName: string;

  @IsString()
  cronExpression: string;

  @IsString()
  displayName: string;

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
