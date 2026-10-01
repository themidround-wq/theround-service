import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { EmailService } from '../email/email.service';
import { UsersModule } from '../users/users.module';
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

  beforeEach(async () => {
    process.env.GOOGLE_CLIENT_ID = 'cid';
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
      ],
    }).compile();
    auth = mod.get(AuthService);
    users = mod.get(UsersService);
    verifyIdToken.mockReset();
    sendWelcome.mockReset();
  });

  it('prefills a new user from Google and returns token + safe user', async () => {
    verifyIdToken.mockResolvedValue(google());
    const res = await auth.loginWithGoogle('tok');
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
    const first = await auth.loginWithGoogle('tok');
    await users.update(first.user.id, { name: 'Nk' });

    verifyIdToken.mockResolvedValue(google({ picture: 'https://pic/2.png' }));
    const second = await auth.loginWithGoogle('tok');
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
});
