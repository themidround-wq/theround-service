import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { EmailService } from '../email/email.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  private readonly google = new OAuth2Client();

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  async loginWithGoogle(idToken: string) {
    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.google.verifyIdToken({
        idToken,
        audience: this.config.getOrThrow('GOOGLE_CLIENT_ID'),
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google token');
    }
    if (!payload?.sub || !payload.email || !payload.email_verified) {
      throw new UnauthorizedException('Google account has no verified email');
    }
    const { user, isNewUser } = await this.users.upsertFromGoogle({
      googleId: payload.sub,
      email: payload.email,
      name: payload.given_name ?? payload.name,
      pictureUrl: payload.picture,
    });
    // Not awaited, so sign-in never waits on Resend; sendWelcome never rejects.
    if (isNewUser) void this.email.sendWelcome(user.email, user.id, user.name);
    return {
      accessToken: await this.jwt.signAsync({ sub: user.id }),
      isNewUser,
      user: this.users.toDto(user),
    };
  }
}
