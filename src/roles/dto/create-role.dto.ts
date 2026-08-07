import { IsString, IsOptional, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({ description: '角色名称', example: 'admin' })
  @IsString()
  name: string;

  @ApiProperty({ description: '角色描述', example: '系统管理员', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: '权限列表', example: ['user:create', 'user:delete'], required: false })
  @IsArray()
  @IsOptional()
  permissions?: string[];
}
