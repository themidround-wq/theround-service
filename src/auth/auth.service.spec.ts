import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { EmailService } from '../email/email.service';
import { SettingsService } from '../settings/settings.service';
import { SETTINGS } from '../settings/settings';
import { UsersModule } from '../users/users.module';
import { totpNow } from '../common/totp';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

const verifyIdToken = jest.fn();
const sendWelcome = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn(() => ({ verifyIdToken })),
}));

const google = (over: object = {}) => ({
  getPayload: () => ({
    sub: 'g-1',
    email: 'nkem@example.com',
    email_verified: true,
    given_name: 'Nkem',
    name: 'Nkem Obi',
    picture: 'https://pic/1.png',
    ...over,
  }),
});

describe('AuthService.loginWithGoogle', () => {
  let auth: AuthService;
  let users: UsersService;

  /** Sign in and expect a session (no 2FA challenge). */
  const signIn = async () => {
    const res = await auth.loginWithGoogle('tok');
    if (res.twoFactorRequired) throw new Error('unexpected 2FA challenge');
    return res;
  };

  beforeEach(async () => {
    process.env.GOOGLE_CLIENT_ID = 'cid';
    process.env.TOTP_KEY = 'test-totp-key';
    const mod = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true }),
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          autoLoadEntities: true,
          synchronize: true,
        }),
        JwtModule.register({ secret: 'test', global: true }),
        UsersModule,
      ],
      providers: [
        AuthService,
        { provide: EmailService, useValue: { sendWelcome } },
        {
          provide: SettingsService,
          useValue: {
            all: () =>
              Promise.resolve(
                Object.fromEntries(
                  Object.entries(SETTINGS).map(([k, v]) => [k, v.default]),
                ),
              ),
          },
        },
      ],
    }).compile();
    auth = mod.get(AuthService);
    users = mod.get(UsersService);
    verifyIdToken.mockReset();
    sendWelcome.mockReset();
  });

  it('prefills a new user from Google and returns token + safe user', async () => {
    verifyIdToken.mockResolvedValue(google());
    const res = await signIn();
    expect(res.isNewUser).toBe(true);
    expect(res.accessToken).toEqual(expect.any(String));
    expect(res.user).toMatchObject({
      email: 'nkem@example.com',
      name: 'Nkem',
      pictureUrl: 'https://pic/1.png',
      onboarded: false,
    });
    expect(res.user).not.toHaveProperty('googleId');
    expect(sendWelcome).toHaveBeenCalledWith(
      'nkem@example.com',
      res.user.id,
      'Nkem',
    );
  });

  it('keeps an edited name on later logins but refreshes the photo', async () => {
    verifyIdToken.mockResolvedValue(google());
    const first = await signIn();
    await users.update(first.user.id, { name: 'Nk' });

    verifyIdToken.mockResolvedValue(google({ picture: 'https://pic/2.png' }));
    const second = await signIn();
    expect(second.isNewUser).toBe(false);
    expect(second.user.id).toBe(first.user.id);
    expect(second.user.name).toBe('Nk');
    expect(second.user.pictureUrl).toBe('https://pic/2.png');
    expect(sendWelcome).toHaveBeenCalledTimes(1); // first sign-in only
  });

  it('rejects unverified emails and invalid tokens', async () => {
    verifyIdToken.mockResolvedValue(google({ email_verified: false }));
    await expect(auth.loginWithGoogle('tok')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    verifyIdToken.mockRejectedValue(new Error('bad'));
    await expect(auth.loginWithGoogle('tok')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  describe('two-factor', () => {
    /** Signs up, turns 2FA on, and returns the secret and recovery codes. */
    const withTwoFactor = async () => {
      verifyIdToken.mockResolvedValue(google());
      const { user } = await signIn();
      const { secret, otpauthUri } = await auth.setupTwoFactor(user.id);
      expect(otpauthUri).toMatch(
        /^otpauth:\/\/totp\/The%20Round%3Ankem%40example\.com\?/,
      );
      // The code used to enable is spent; enable with last step's code so
      // the current one stays usable for sign-in.
      const { recoveryCodes } = await auth.enableTwoFactor(
        user.id,
        totpNow(secret, Date.now() - 30_000),
      );
      return { userId: user.id, secret, recoveryCodes };
    };

    const challenge = async () => {
      const res = await auth.loginWithGoogle('tok');
      if (!res.twoFactorRequired) throw new Error('expected a 2FA challenge');
      return res.challengeToken;
    };

    it('asks for a code instead of signing in, then accepts a valid one once', async () => {
      const { secret } = await withTwoFactor();
      const res = await auth.loginWithGoogle('tok');
      expect(res.twoFactorRequired).toBe(true);
      expect(Object.keys(res).sort()).toEqual([
        'challengeToken',
        'twoFactorRequired',
      ]);

      const token = await challenge();
      await expect(auth.loginTwoFactor(token, '000000')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      const code = totpNow(secret);
      const session = await auth.loginTwoFactor(token, code);
      expect(session.accessToken).toEqual(expect.any(String));
      expect(session.user.twoFactorEnabled).toBe(true);
      // Replaying the same code fails.
      await expect(auth.loginTwoFactor(token, code)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('accepts each recovery code once', async () => {
      const { userId, recoveryCodes } = await withTwoFactor();
      expect(recoveryCodes).toHaveLength(10);
      const token = await challenge();
      await expect(
        auth.loginTwoFactor(token, recoveryCodes[0].toUpperCase()),
      ).resolves.toHaveProperty('accessToken');
      await expect(
        auth.loginTwoFactor(token, recoveryCodes[0]),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect((await auth.twoFactorStatus(userId)).recoveryCodesLeft).toBe(9);
    });

    it('rejects a forged or expired challenge', async () => {
      await withTwoFactor();
      await expect(
        auth.loginTwoFactor('not-a-token', '123456'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('turns off with a code, after which sign-in is one step again', async () => {
      const { userId, recoveryCodes } = await withTwoFactor();
      await auth.disableTwoFactor(userId, recoveryCodes[1]);
      expect((await auth.twoFactorStatus(userId)).enabled).toBe(false);
      await expect(signIn()).resolves.toHaveProperty('accessToken');
    });

    it('can be reset by support', async () => {
      const { userId } = await withTwoFactor();
      await auth.resetTwoFactor(userId);
      await expect(signIn()).resolves.toHaveProperty('accessToken');
    });
  });
});
