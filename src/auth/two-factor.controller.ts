import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import {
  RecoveryCodesResponse,
  TwoFactorSetupResponse,
  TwoFactorStatusResponse,
} from '../common/api.response';
import { AuthGuard, UserId } from './auth.guard';
import { AuthService } from './auth.service';

class CodeDto {
  /** 6-digit authenticator code (or a recovery code where noted). */
  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  code: string;
}

/**
 * Optional two-factor for app users. API only for now; the app screens come
 * later. Flow: setup → show QR (otpauthUri) → enable with a code → show the
 * recovery codes once.
 */
@ApiTags('Two-factor')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
@Controller('me/2fa')
@UseGuards(AuthGuard)
export class TwoFactorController {
  constructor(private readonly auth: AuthService) {}

  @ApiOperation({ summary: 'Two-factor status' })
  @ApiOkResponse({ type: TwoFactorStatusResponse })
  @Get()
  status(@UserId() userId: string) {
    return this.auth.twoFactorStatus(userId);
  }

  @ApiOperation({
    summary: 'Start setup',
    description:
      'Returns a new secret and an otpauth:// URI to show as a QR code. Sign-in is unchanged until /enable confirms it. Calling again replaces the pending secret.',
  })
  @ApiOkResponse({ type: TwoFactorSetupResponse })
  @Post('setup')
  @HttpCode(200)
  setup(@UserId() userId: string) {
    return this.auth.setupTwoFactor(userId);
  }

  @ApiOperation({
    summary: 'Turn on with a code from the app',
    description: 'Returns 10 recovery codes. They are never shown again.',
  })
  @ApiOkResponse({ type: RecoveryCodesResponse })
  @ApiBadRequestResponse({
    description: "Code didn't match, or setup wasn't started",
  })
  @Post('enable')
  @HttpCode(200)
  enable(@UserId() userId: string, @Body() dto: CodeDto) {
    return this.auth.enableTwoFactor(userId, dto.code);
  }

  @ApiOperation({
    summary: 'Turn off',
    description: 'Needs a current authenticator code or a recovery code.',
  })
  @ApiNoContentResponse()
  @Post('disable')
  @HttpCode(204)
  disable(@UserId() userId: string, @Body() dto: CodeDto) {
    return this.auth.disableTwoFactor(userId, dto.code);
  }

  @ApiOperation({
    summary: 'Replace recovery codes',
    description: 'Needs a current authenticator code. Old codes stop working.',
  })
  @ApiOkResponse({ type: RecoveryCodesResponse })
  @Post('recovery-codes')
  @HttpCode(200)
  recoveryCodes(@UserId() userId: string, @Body() dto: CodeDto) {
    return this.auth.regenerateRecoveryCodes(userId, dto.code);
  }
}
