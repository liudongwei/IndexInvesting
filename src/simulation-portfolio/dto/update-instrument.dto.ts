import { PartialType } from '@nestjs/mapped-types';
import { CreateInstrumentDto } from './create-instrument.dto';
import { IsOptional, IsString } from 'class-validator';

export class UpdateInstrumentDto extends PartialType(CreateInstrumentDto) {
  // 明确允许这些字段，但标记为可选
  @IsString()
  @IsOptional()
  id?: string;

  @IsOptional()
  createdAt?: Date;

  @IsOptional()
  updatedAt?: Date;
}
