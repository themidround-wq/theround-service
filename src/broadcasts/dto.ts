import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PageQueryDto } from '../admin/dto';
import { AUDIENCES, BROADCAST_KINDS } from './broadcast.entities';
import type { Audience, BroadcastKind } from './broadcast.entities';

export class BroadcastContentDto {
  @ApiPropertyOptional({ enum: BROADCAST_KINDS })
  @IsOptional()
  @IsIn(BROADCAST_KINDS)
  kind?: BroadcastKind;

  @ApiPropertyOptional({ example: 'What’s new in The Round this month' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  subject?: string;

  @ApiPropertyOptional({ example: 'Three new topics and a faster wheel.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  preheader?: string;

  @ApiPropertyOptional({
    description: 'Title inside the email; defaults to the subject.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  headline?: string;

  @ApiPropertyOptional({
    description:
      'Editor HTML. Sanitised on save. `{{name}}` becomes the first name.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200_000)
  bodyHtml?: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  ctaLabel?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  ctaUrl?: string | null;

  @ApiPropertyOptional({ enum: AUDIENCES })
  @IsOptional()
  @IsIn(AUDIENCES)
  audience?: Audience;
}

export class ScheduleDto {
  @ApiProperty({ example: '2026-10-05T09:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  scheduledAt: Date;
}

export class TestSendDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'Defaults to your own email.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((v: unknown) =>
          typeof v === 'string' ? v.trim().toLowerCase() : v,
        )
      : value,
  )
  @IsEmail({}, { each: true })
  to?: string[];
}

export class ListBroadcastsDto extends PageQueryDto {
  @ApiPropertyOptional({
    enum: ['draft', 'scheduled', 'sending', 'sent', 'cancelled'],
  })
  @IsOptional()
  @IsIn(['draft', 'scheduled', 'sending', 'sent', 'cancelled'])
  status?: string;
}

export class ListRecipientsDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ['pending', 'sent', 'failed'] })
  @IsOptional()
  @IsIn(['pending', 'sent', 'failed'])
  status?: 'pending' | 'sent' | 'failed';
}

export class AudienceQueryDto {
  @ApiPropertyOptional({ enum: BROADCAST_KINDS })
  @IsOptional()
  @IsIn(BROADCAST_KINDS)
  kind?: BroadcastKind;
}

export class UnsubscribeDto {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email: string;
}
