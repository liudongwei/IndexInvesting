import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ description: '当前密码' })
  @IsString()
  @MinLength(6)
  currentPassword: string;

  @ApiProperty({ description: '新密码（最少6位）' })
  @IsString()
  @MinLength(6)
  newPassword: string;
}
