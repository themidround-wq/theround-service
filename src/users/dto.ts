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

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsIn(STAGES)
  stage?: Stage;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  course?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  year?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  semester?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  avatarId?: number;

  @IsOptional()
  @IsIn(GOALS)
  goal?: Goal;

  @IsOptional()
  @Type(() => Number)
  @IsIn(RESPONSE_SECONDS)
  defaultResponseSeconds?: number;

  @IsOptional()
  @IsBoolean()
  soundCues?: boolean;
}
