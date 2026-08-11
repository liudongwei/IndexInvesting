import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateEastmoneyCookieDto {
  @ApiProperty({
    description: '东财 Cookie 字符串',
    example:
      'qgqp_b_id=xxx; st_nvi=xxx; nid18=xxx; gviem=xxx; st_pvi=xxx; st_sp=xxx; st_inirUrl=xxx; st_sn=xxx; st_psi=xxx',
  })
  @IsString()
  @IsNotEmpty({ message: 'Cookie 不能为空' })
  cookie: string;
}
