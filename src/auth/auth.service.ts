import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { Repository } from 'typeorm';
import { TwoFactor, totpKeyFrom } from '../common/two-factor';
import { EmailService } from '../email/email.service';
import { SettingsService } from '../settings/settings.service';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';

/** How long the app has to send the 2FA code after Google sign-in. */
const CHALLENGE_SECONDS = 5 * 60;
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60_000;

type ChallengeClaims = { sub: string; typ: 'user_2fa' };

@Injectable()
export class AuthService {
  private readonly google = new OAuth2Client();
  /** Wrong 2FA codes per user, in memory: slows guessing per instance. */
  private readonly failures = new Map<string, { n: number; until: number }>();
  private tf: TwoFactor<User> | null = null;

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
    private readonly settings: SettingsService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  /** Built on first use, so environments without a key still boot. */
  private get twoFactor() {
    this.tf ??= new TwoFactor(
      this.userRepo,
      totpKeyFrom((k) => this.config.get<string>(k)),
      'The Round',
    );
    return this.tf;
  }

  /**
   * Google sign-in. With two-factor on, returns `twoFactorRequired: true`
   * and a 5-minute `challengeToken` instead of an access token; the app then
   * calls POST /auth/2fa with a code. The challenge can't call anything else.
   */
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
    const settings = await this.settings.all();
    const { user, isNewUser } = await this.users.upsertFromGoogle(
      {
        googleId: payload.sub,
        email: payload.email,
        name: payload.given_name ?? payload.name,
        pictureUrl: payload.picture,
      },
      {
        allowCreate: settings['signups.open'],
        defaultResponseSeconds: settings['practice.defaultResponseSeconds'],
      },
    );
    if (user.suspendedAt) throw new ForbiddenException('Account suspended');

    if (user.totpEnabledAt) {
      const claims: ChallengeClaims = { sub: user.id, typ: 'user_2fa' };
      return {
        twoFactorRequired: true as const,
        challengeToken: await this.jwt.signAsync(claims, {
          expiresIn: CHALLENGE_SECONDS,
        }),
      };
    }

    // Not awaited, so sign-in never waits on Resend; sendWelcome never rejects.
    if (isNewUser) void this.email.sendWelcome(user.email, user.id, user.name);
    return this.session(user, isNewUser);
  }

  /** Second step: an authenticator code or a one-time recovery code. */
  async loginTwoFactor(challengeToken: string, code: string) {
    const claims = await this.jwt
      .verifyAsync<ChallengeClaims>(challengeToken)
      .catch(() => null);
    if (!claims || claims.typ !== 'user_2fa') {
      throw new UnauthorizedException(
        'Sign-in expired. Continue with Google again.',
      );
    }
    const key = claims.sub;
    const lock = this.failures.get(key);
    if (lock && lock.n >= MAX_FAILURES && lock.until > Date.now()) {
      throw new HttpException(
        'Too many attempts. Try again in a few minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.userRepo.findOneBy({ id: claims.sub });
    if (!user || !user.totpEnabledAt) {
      throw new UnauthorizedException('Continue with Google again.');
    }
    if (user.suspendedAt) throw new ForbiddenException('Account suspended');

    if (!(await this.twoFactor.verify(user, code))) {
      const prev = lock && lock.until > Date.now() ? lock.n : 0;
      this.failures.set(key, { n: prev + 1, until: Date.now() + LOCKOUT_MS });
      throw new UnauthorizedException(
        "That code didn't work. Try the newest one.",
      );
    }
    this.failures.delete(key);
    return this.session(user, false);
  }

  private async session(user: User, isNewUser: boolean) {
    return {
      twoFactorRequired: false as const,
      accessToken: await this.jwt.signAsync({ sub: user.id }),
      isNewUser,
      user: this.users.toDto(user),
    };
  }

  // ---- managing two-factor (signed-in user) --------------------------------

  async twoFactorStatus(userId: string) {
    return this.twoFactor.status(await this.users.findById(userId));
  }

  async setupTwoFactor(userId: string) {
    const user = await this.users.findById(userId);
    return this.twoFactor.setup(user, user.email);
  }

  async enableTwoFactor(userId: string, code: string) {
    return this.twoFactor.enable(await this.users.findById(userId), code);
  }

  /** Google accounts have no password here, so a code (or recovery code) is the proof. */
  async disableTwoFactor(userId: string, code: string) {
    await this.twoFactor.disable(await this.users.findById(userId), code);
  }

  async regenerateRecoveryCodes(userId: string, code: string) {
    return this.twoFactor.regenerate(await this.users.findById(userId), code);
  }

  /** Support reset (lost phone), called from the admin API. */
  async resetTwoFactor(userId: string) {
    await this.users.findById(userId);
    await this.twoFactor.clear(userId);
  }
}
