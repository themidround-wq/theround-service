import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { GOALS, RESPONSE_SECONDS, STAGES } from './user.entity';
import type { Goal, Stage } from './user.entity';

/** All fields optional — send only what changed. */
export class UpdateProfileDto {
  @ApiPropertyOptional({
    example: 'Nkem',
    description: 'What to call the user',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({ enum: STAGES, example: 'student' })
  @IsOptional()
  @IsIn(STAGES)
  stage?: Stage;

  @ApiPropertyOptional({ example: 'Midwifery' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  course?: string;

  @ApiPropertyOptional({ example: 'Year 2' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  year?: string;

  @ApiPropertyOptional({ example: 'Semester 1' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  semester?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 8,
    example: 4,
    description: 'Preset avatar id',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  avatarId?: number;

  @ApiPropertyOptional({ enum: GOALS, example: 'build_confidence' })
  @IsOptional()
  @IsIn(GOALS)
  goal?: Goal;

  @ApiPropertyOptional({
    enum: RESPONSE_SECONDS,
    example: 90,
    description: '90 = Quick, 240 = Case',
  })
  @IsOptional()
  @Type(() => Number)
  @IsIn(RESPONSE_SECONDS)
  defaultResponseSeconds?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  soundCues?: boolean;
}
