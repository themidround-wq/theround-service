import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { RESPONSE_SECONDS } from '../users/user.entity';
import { PRACTICE_SLUGS } from './topics';

const TOPIC_CHOICES = [...PRACTICE_SLUGS, 'surprise'] as const;

export class StartSessionDto {
  @ApiProperty({ enum: TOPIC_CHOICES, example: 'labour' })
  @IsIn(TOPIC_CHOICES)
  categoryId: (typeof TOPIC_CHOICES)[number];
}

export class PickTopicDto extends StartSessionDto {}

export class RenameSessionDto {
  @ApiProperty({ example: 'PPH revision' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  title: string;
}

export class SetDurationDto {
  @ApiProperty({ enum: RESPONSE_SECONDS, example: 90 })
  @Type(() => Number)
  @IsIn(RESPONSE_SECONDS)
  durationSeconds: number;
}

export class CompletePracticeRoundDto {
  @ApiPropertyOptional({
    example: 74,
    description: 'Client-measured speaking time',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  spokenSeconds: number;
}
