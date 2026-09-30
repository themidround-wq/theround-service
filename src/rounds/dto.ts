import { ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiPropertyOptional({
    enum: RESPONSE_SECONDS,
    example: 90,
    description: '90 = Quick, 240 = Case. Defaults to the user preference.',
  })
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
  @ApiPropertyOptional({ enum: REFLECTIONS, example: 'clear' })
  @IsOptional()
  @IsIn(REFLECTIONS)
  reflection?: Reflection;

  @ApiPropertyOptional({
    example:
      'I kept the structure clear. Next time I want to mention escalation earlier.',
    description: '"One note for next time"',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class UpdateRoundDto extends SaveRoundDto {
  @ApiPropertyOptional({
    example: true,
    description: 'The "Saved" bookmark toggle',
  })
  @IsOptional()
  @IsBoolean()
  bookmarked?: boolean;
}

export class ListRoundsDto {
  @ApiPropertyOptional({
    example: 'haemorrhage',
    description: 'Matches question text or topic name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    example: '4663e1a3-7290-4027-8896-3f5bedef5222',
    description: 'Category id from GET /catalog',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ example: 10, default: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 10;
}
