import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ADMIN_ROLES } from './admin.entities';
import type { AdminRole } from './admin.entities';
import { STAGES } from '../users/user.entity';
import type { Stage } from '../users/user.entity';

const lowerTrim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// ---- auth & profile --------------------------------------------------------

export class AdminLoginDto {
  @ApiProperty({ example: 'founder@gettheround.com' })
  @Transform(lowerTrim)
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'correct horse battery staple' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password: string;
}

export class LoginTwoFactorDto {
  @ApiProperty({ description: 'challengeToken from the login response' })
  @IsString()
  @MaxLength(2000)
  challengeToken: string;

  @ApiProperty({
    example: '123456',
    description: 'App code, or a recovery code',
  })
  @IsString()
  @MaxLength(40)
  code: string;
}

export class TwoFactorCodeDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @MaxLength(40)
  code: string;
}

export class DisableTwoFactorDto extends TwoFactorCodeDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  password: string;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @Transform(lowerTrim)
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  password: string;
}

export class UpdateAdminProfileDto {
  @ApiProperty({ example: 'Ani' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  currentPassword: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  newPassword: string;
}

// ---- shared ----------------------------------------------------------------

export class PageQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 25, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class RangeQueryDto {
  @ApiPropertyOptional({ enum: [7, 14, 30, 90], default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsIn([7, 14, 30, 90])
  days = 30;
}

export class IdsDto {
  @ApiProperty({ type: [Number], example: [12, 13] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @Type(() => Number)
  @IsInt({ each: true })
  ids: number[];
}

// ---- waitlist --------------------------------------------------------------

export const WAITLIST_STATUSES = ['pending', 'invited', 'joined'] as const;

export class ListWaitlistDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: WAITLIST_STATUSES })
  @IsOptional()
  @IsIn(WAITLIST_STATUSES)
  status?: (typeof WAITLIST_STATUSES)[number];
}

export class AddWaitlistDto {
  @ApiProperty({ type: [String], example: ['nkem@example.com'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((v: unknown) =>
          typeof v === 'string' ? v.trim().toLowerCase() : v,
        )
      : value,
  )
  @IsEmail({}, { each: true })
  emails: string[];
}

// ---- users -----------------------------------------------------------------

export class ListUsersDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: STAGES })
  @IsOptional()
  @IsIn(STAGES)
  stage?: Stage;

  @ApiPropertyOptional({ enum: ['onboarded', 'onboarding', 'suspended'] })
  @IsOptional()
  @IsIn(['onboarded', 'onboarding', 'suspended'])
  status?: 'onboarded' | 'onboarding' | 'suspended';
}

export class SuspendUserDto {
  @ApiProperty()
  @IsBoolean()
  suspended: boolean;
}

// ---- rounds ----------------------------------------------------------------

export class ListAdminRoundsDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ['spun', 'in_progress', 'completed', 'saved'] })
  @IsOptional()
  @IsIn(['spun', 'in_progress', 'completed', 'saved'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;
}

// ---- catalog ---------------------------------------------------------------

export class CreateCategoryDto {
  @ApiProperty({ example: 'Neonatal Resuscitation' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({
    description: 'Hidden categories never appear on the wheel.',
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ReorderCategoriesDto {
  @ApiProperty({
    type: [String],
    description: 'Every category id, in wheel order.',
  })
  @IsArray()
  @IsUUID('all', { each: true })
  ids: string[];
}

export class CreateTopicDto {
  @ApiProperty()
  @IsUUID()
  categoryId: string;

  @ApiProperty({ example: 'Cord prolapse' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;
}

export class UpdateTopicDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;
}

export class CreateQuestionDto {
  @ApiProperty()
  @IsUUID()
  topicId: string;

  @ApiProperty({ example: 'How would you manage a cord prolapse?' })
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  text: string;
}

export class UpdateQuestionDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  text: string;
}

// ---- team ------------------------------------------------------------------

export class CreateAdminDto {
  @ApiProperty()
  @Transform(lowerTrim)
  @IsEmail()
  email: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @ApiProperty({ enum: ADMIN_ROLES })
  @IsIn(ADMIN_ROLES)
  role: AdminRole;

  @ApiProperty({
    minLength: 10,
    description: 'Temporary password to share with them.',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  password: string;
}

export class UpdateAdminDto {
  @ApiPropertyOptional({ enum: ADMIN_ROLES })
  @IsOptional()
  @IsIn(ADMIN_ROLES)
  role?: AdminRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    description: 'Turns off their 2FA (lost phone) and signs them out.',
  })
  @IsOptional()
  @IsBoolean()
  resetTwoFactor?: boolean;

  @ApiPropertyOptional({
    minLength: 10,
    description: 'Sets a new password and signs them out everywhere.',
  })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  password?: string;
}

// ---- settings --------------------------------------------------------------

export class UpdateSettingsDto {
  @ApiProperty({ example: { 'waitlist.open': false } })
  @IsObject()
  values: Record<string, unknown>;
}

export class AuditQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ example: 'waitlist' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  action?: string;
}
