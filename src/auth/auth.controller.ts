import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { IsString, IsNotEmpty } from 'class-validator';
import { AuthService } from './auth.service';

class GoogleLoginDto {
  @IsString()
  @IsNotEmpty()
  idToken: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Exchange a Google ID token (from "Continue with Google") for an app JWT. */
  @Post('google')
  @HttpCode(200)
  google(@Body() dto: GoogleLoginDto) {
    return this.auth.loginWithGoogle(dto.idToken);
  }
}
