import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { RESPONSE_SECONDS } from '../users/user.entity';
import { REFLECTIONS } from './round.entity';
import type { Reflection } from './round.entity';

export class StartRoundDto {
  @IsOptional()
  @Type(() => Number)
  @IsIn(RESPONSE_SECONDS)
  durationSeconds?: number;
}

export class CompleteRoundDto {
  /** How long the user actually spoke (client-measured). */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  spokenSeconds: number;
}

export class SaveRoundDto {
  @IsOptional()
  @IsIn(REFLECTIONS)
  reflection?: Reflection;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class UpdateRoundDto extends SaveRoundDto {
  @IsOptional()
  @IsBoolean()
  bookmarked?: boolean;
}

export class ListRoundsDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 10;
}
