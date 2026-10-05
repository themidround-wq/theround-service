import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import type { EmailReplyStatus } from './email-reply.entity';

export class ListEmailRepliesDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiProperty({ required: false, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 25;

  @ApiProperty({
    required: false,
    enum: ['all', 'unread', 'read', 'archived'],
    default: 'all',
  })
  @IsOptional()
  @IsIn(['all', 'unread', 'read', 'archived', ''])
  status?: string;

  @ApiProperty({ required: false, description: 'Search sender, email, subject or body' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  broadcastId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class UpdateEmailReplyStatusDto {
  @ApiProperty({ enum: ['unread', 'read', 'archived'] })
  @IsEnum(['unread', 'read', 'archived'])
  status: EmailReplyStatus;
}

export class SendEmailReplyDto {
  @ApiProperty({ description: 'The text response to send back to the user' })
  @IsString()
  @IsNotEmpty()
  bodyText: string;
}

export class TestInboundReplyDto {
  @ApiProperty({ example: 'sarah@example.com' })
  @IsString()
  @IsNotEmpty()
  from: string;

  @ApiProperty({ example: 'Sarah Connor', required: false })
  @IsOptional()
  @IsString()
  fromName?: string;

  @ApiProperty({ example: 'replies@the-round.app', required: false })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiProperty({ example: 'Re: Welcome to The Round' })
  @IsString()
  @IsNotEmpty()
  subject: string;

  @ApiProperty({ example: 'Thanks for having me! When will the new cardiology questions drop?' })
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  html?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  broadcastId?: string;
}
