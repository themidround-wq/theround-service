import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { IsString, IsNotEmpty } from 'class-validator';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { LoginResponse } from '../common/api.response';
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

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @ApiOperation({
    summary: 'Sign in with Google',
    description:
      'Exchange the Google ID token from "Continue with Google" for an app JWT. The user is created on first sign-in and prefilled from Google (first name, email, photo) so onboarding can show editable defaults.',
  })
  @ApiOkResponse({ type: LoginResponse })
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
}
