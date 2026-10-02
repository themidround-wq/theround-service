import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiTooManyRequestsResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  LoginResponse,
  TwoFactorChallengeResponse,
} from '../common/api.response';
import { AuthService } from './auth.service';

class GoogleLoginDto {
  /** Google ID token (credential) from Google Identity Services. */
  @ApiProperty({
    example:
      'eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMyJ9.eyJpc3MiOiJhY2NvdW50cy5nb29nbGUuY29tIn0.sig',
  })
  @IsString()
  @IsNotEmpty()
  idToken: string;
}

class TwoFactorLoginDto {
  /** challengeToken from POST /auth/google. */
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiJ9.eyJ0eXAiOiJ1c2VyXzJmYSJ9.sig' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  challengeToken: string;

  /** 6-digit authenticator code, or a recovery code like abcd-efgh-jk. */
  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  code: string;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @ApiOperation({
    summary: 'Sign in with Google',
    description:
      'Exchange the Google ID token from "Continue with Google" for an app JWT. The user is created on first sign-in and prefilled from Google (first name, email, photo) so onboarding can show editable defaults.',
  })
  @ApiOkResponse({
    description:
      'A session (`twoFactorRequired: false`), or a 2FA challenge (`twoFactorRequired: true`, see TwoFactorChallengeResponse) for users with two-factor on.',
    type: LoginResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid Google token or unverified email',
    schema: {
      example: {
        statusCode: 401,
        message: 'Invalid Google token',
        error: 'Unauthorized',
      },
    },
  })
  @Post('google')
  @HttpCode(200)
  google(@Body() dto: GoogleLoginDto) {
    return this.auth.loginWithGoogle(dto.idToken);
  }

  @ApiOperation({
    summary: 'Second sign-in step (two-factor)',
    description:
      'Only for users with two-factor on. Exchange the challengeToken from /auth/google and a 6-digit authenticator code (or a one-time recovery code) for the normal sign-in response. Five wrong codes lock it for 15 minutes.',
  })
  @ApiOkResponse({ type: LoginResponse })
  @ApiExtraModels(TwoFactorChallengeResponse)
  @ApiUnauthorizedResponse({
    description: 'Wrong code, or the challenge expired',
  })
  @ApiTooManyRequestsResponse({ description: 'Too many wrong codes' })
  @Post('2fa')
  @HttpCode(200)
  twoFactor(@Body() dto: TwoFactorLoginDto) {
    return this.auth.loginTwoFactor(dto.challengeToken, dto.code);
  }
}
