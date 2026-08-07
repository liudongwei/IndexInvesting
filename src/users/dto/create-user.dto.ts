import { IsString, IsEmail, IsOptional, IsBoolean, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ description: '用户名', example: 'john_doe' })
  @IsString()
  @MinLength(3)
  username: string;

  @ApiProperty({ description: '邮箱', example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: '密码', example: 'password123' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ description: '角色ID', example: 'uuid-role-id', required: false })
  @IsString()
  @IsOptional()
  roleId?: string;

  @ApiProperty({ description: '是否激活', example: true, required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
