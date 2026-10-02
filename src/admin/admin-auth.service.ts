import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { IsNull, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { EmailService } from '../email/email.service';
import { AdminPasswordReset, AdminSession, AdminUser } from './admin.entities';
import type { AdminClaims } from './admin.guard';
import { AuditService } from './audit.service';
import { CreateAdminDto, UpdateAdminDto } from './dto';
import { DUMMY_HASH, hashPassword, verifyPassword } from './password';
import { hashToken } from '../common/totp';
import { TwoFactor, totpKeyFrom } from '../common/two-factor';

const SESSION_HOURS = 12;
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60_000;

const CHALLENGE_SECONDS = 5 * 60;
const RESET_MINUTES = 30;
const RESETS_PER_HOUR = 3;

type Meta = { ip?: string; userAgent?: string };
type ChallengeClaims = { sub: string; typ: 'admin_2fa' };

@Injectable()
export class AdminAuthService implements OnModuleInit {
  private readonly logger = new Logger(AdminAuthService.name);
  /** Failed logins per email, in memory: enough to slow guessing per instance. */
  private readonly failures = new Map<string, { n: number; until: number }>();

  constructor(
    @InjectRepository(AdminUser)
    private readonly admins: Repository<AdminUser>,
    @InjectRepository(AdminSession)
    private readonly sessions: Repository<AdminSession>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    @InjectRepository(AdminPasswordReset)
    private readonly resets: Repository<AdminPasswordReset>,
    private readonly email: EmailService,
  ) {
    this.twoFactor = new TwoFactor(
      admins,
      totpKeyFrom((k) => config.get<string>(k)),
      'The Round Admin',
    );
    // ADMIN_URL is also what CORS allows; ADMIN_APP_URL is the older name.
    this.adminAppUrl = (
      config.get<string>('ADMIN_URL') ??
      config.get<string>('ADMIN_APP_URL') ??
      'http://localhost:3001'
    ).replace(/\/+$/, '');
  }

  private readonly twoFactor: TwoFactor<AdminUser>;
  private readonly adminAppUrl: string;

  /** Creates the first owner from ADMIN_EMAIL / ADMIN_PASSWORD when the table is empty. */
  async onModuleInit() {
    if ((await this.admins.count()) > 0) return;
    const email = this.config.get<string>('ADMIN_EMAIL')?.trim().toLowerCase();
    const password = this.config.get<string>('ADMIN_PASSWORD');
    if (!email || !password) {
      this.logger.warn(
        'No admin accounts yet: set ADMIN_EMAIL and ADMIN_PASSWORD to create the first owner.',
      );
      return;
    }
    if (password.length < 10) {
      this.logger.error('ADMIN_PASSWORD must be at least 10 characters.');
      return;
    }
    await this.admins.save(
      this.admins.create({
        email,
        name: email.split('@')[0],
        role: 'owner',
        passwordHash: await hashPassword(password),
      }),
    );
    this.logger.log(`Created first admin owner ${email}`);
  }

  toDto(a: AdminUser) {
    return {
      id: a.id,
      email: a.email,
      name: a.name,
      role: a.role,
      active: a.active,
      lastLoginAt: a.lastLoginAt,
      createdAt: a.createdAt,
      twoFactorEnabled: !!a.totpEnabledAt,
    };
  }

  // ---- throttling ----------------------------------------------------------

  private assertNotLocked(key: string) {
    const lock = this.failures.get(key);
    if (lock && lock.n >= MAX_FAILURES && lock.until > Date.now()) {
      throw new HttpException(
        'Too many attempts. Try again in a few minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private recordFailure(key: string) {
    const lock = this.failures.get(key);
    const prev = lock && lock.until > Date.now() ? lock.n : 0;
    this.failures.set(key, { n: prev + 1, until: Date.now() + LOCKOUT_MS });
  }

  // ---- login / logout ------------------------------------------------------

  /**
   * Step one. Without 2FA this signs in straight away. With 2FA it returns a
   * short-lived challenge token instead, which /login/2fa exchanges (with a
   * code) for a session. The challenge alone can't call anything.
   */
  async login(email: string, password: string, meta: Meta) {
    this.assertNotLocked(email);
    const admin = await this.admins.findOneBy({ email });
    const ok = await verifyPassword(
      password,
      admin?.passwordHash ?? (await DUMMY_HASH),
    );
    if (!admin || !ok || !admin.active) {
      this.recordFailure(email);
      throw new UnauthorizedException('Wrong email or password');
    }
    this.failures.delete(email);

    if (admin.totpEnabledAt) {
      const claims: ChallengeClaims = { sub: admin.id, typ: 'admin_2fa' };
      return {
        twoFactorRequired: true as const,
        challengeToken: await this.jwt.signAsync(claims, {
          expiresIn: CHALLENGE_SECONDS,
        }),
      };
    }
    return this.startSession(admin, meta, { method: 'password' });
  }

  /** Step two: a 6-digit app code or a one-time recovery code. */
  async loginTwoFactor(challengeToken: string, code: string, meta: Meta) {
    const claims = await this.jwt
      .verifyAsync<ChallengeClaims>(challengeToken)
      .catch(() => null);
    if (!claims || claims.typ !== 'admin_2fa') {
      throw new UnauthorizedException(
        'That sign-in took too long. Enter your password again.',
      );
    }
    const key = `2fa:${claims.sub}`;
    this.assertNotLocked(key);
    const admin = await this.admins.findOneBy({ id: claims.sub });
    if (!admin?.active || !admin.totpEnabledAt) {
      throw new UnauthorizedException('Enter your password again.');
    }

    const method = await this.checkSecondFactor(admin, code);
    if (!method) {
      this.recordFailure(key);
      throw new UnauthorizedException(
        "That code didn't work. Try the newest one.",
      );
    }
    this.failures.delete(key);
    return this.startSession(admin, meta, { method });
  }

  /** App code or recovery code; logs when a recovery code is spent. */
  private async checkSecondFactor(admin: AdminUser, code: string) {
    const method = await this.twoFactor.verify(admin, code);
    if (method === 'recovery') {
      await this.audit.record(admin, 'auth.recovery_code_used', null, {
        remaining: this.twoFactor.status(admin).recoveryCodesLeft,
      });
    }
    return method;
  }

  private async startSession(
    admin: AdminUser,
    meta: Meta,
    details: Record<string, unknown>,
  ) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_HOURS * 3600_000);
    const session = await this.sessions.save(
      this.sessions.create({
        admin,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
        lastSeenAt: now,
        expiresAt,
      }),
    );
    await this.admins.update(admin.id, { lastLoginAt: now });
    admin.lastLoginAt = now;
    await this.audit.record(admin, 'auth.login', null, details, meta.ip);

    const claims: AdminClaims = {
      sub: admin.id,
      sid: session.id,
      typ: 'admin',
    };
    return {
      twoFactorRequired: false as const,
      accessToken: await this.jwt.signAsync(claims, {
        expiresIn: SESSION_HOURS * 3600,
      }),
      expiresAt,
      admin: this.toDto(admin),
    };
  }

  // ---- two-factor setup ----------------------------------------------------

  setupTwoFactor(admin: AdminUser) {
    return this.twoFactor.setup(admin, admin.email);
  }

  async enableTwoFactor(admin: AdminUser, code: string) {
    const result = await this.twoFactor.enable(admin, code);
    await this.audit.record(admin, 'auth.2fa_enable');
    return result;
  }

  /** Admins also confirm with their password. */
  async disableTwoFactor(admin: AdminUser, password: string, code: string) {
    if (!admin.totpEnabledAt) {
      throw new BadRequestException('Two-factor is not on.');
    }
    if (!(await verifyPassword(password, admin.passwordHash))) {
      throw new BadRequestException('Password is wrong');
    }
    await this.twoFactor.disable(admin, code);
    await this.audit.record(admin, 'auth.2fa_disable');
  }

  async regenerateRecoveryCodes(admin: AdminUser, code: string) {
    const result = await this.twoFactor.regenerate(admin, code);
    await this.audit.record(admin, 'auth.2fa_recovery_regenerate');
    return result;
  }

  twoFactorStatus(admin: AdminUser) {
    return this.twoFactor.status(admin);
  }

  // ---- forgot password -----------------------------------------------------

  /**
   * Always resolves the same way, whether or not the email is an admin, so
   * the form can't be used to discover accounts.
   */
  async requestPasswordReset(email: string, ip?: string) {
    const admin = await this.admins.findOneBy({ email });
    if (!admin?.active) return;
    const recent = await this.resets.countBy({
      admin: { id: admin.id },
      createdAt: MoreThanOrEqual(new Date(Date.now() - 3600_000)),
    });
    if (recent >= RESETS_PER_HOUR) return;

    const token = randomBytes(32).toString('base64url');
    const reset = await this.resets.save(
      this.resets.create({
        admin,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000),
        ip: ip ?? null,
      }),
    );
    const url = `${this.adminAppUrl}/reset-password?token=${token}`;
    const outcome = await this.email.sendAdminPasswordReset(
      admin.email,
      reset.id,
      url,
      RESET_MINUTES,
    );
    if (
      outcome === 'disabled' &&
      this.config.get('NODE_ENV') !== 'production'
    ) {
      // Local dev only: no email provider, so show the link in the logs.
      this.logger.warn(
        `Email disabled. Password reset link for ${admin.email}: ${url}`,
      );
    }
    await this.audit.record(
      admin,
      'auth.password_reset_request',
      null,
      undefined,
      ip,
    );
  }

  /** Sets the new password, burns every outstanding link and signs out everywhere. */
  async resetPassword(token: string, password: string, ip?: string) {
    const reset = await this.resets.findOne({
      where: { tokenHash: hashToken(token) },
      relations: { admin: true },
    });
    if (
      !reset ||
      reset.usedAt ||
      reset.expiresAt <= new Date() ||
      !reset.admin.active
    ) {
      throw new BadRequestException(
        'This link has expired or was already used. Ask for a new one.',
      );
    }
    const claimed = await this.resets.update(
      { id: reset.id, usedAt: IsNull() },
      { usedAt: new Date() },
    );
    if (!claimed.affected)
      throw new BadRequestException('This link was already used.');

    await this.admins.update(reset.admin.id, {
      passwordHash: await hashPassword(password),
    });
    await this.resets.update(
      { admin: { id: reset.admin.id }, usedAt: IsNull() },
      { usedAt: new Date() },
    );
    await this.revokeAll(reset.admin.id);
    this.failures.delete(reset.admin.email);
    await this.audit.record(
      reset.admin,
      'auth.password_reset',
      null,
      undefined,
      ip,
    );
    return {
      email: reset.admin.email,
      twoFactorEnabled: !!reset.admin.totpEnabledAt,
    };
  }

  async logout(admin: AdminUser, sessionId: string) {
    await this.sessions.update(sessionId, { revokedAt: new Date() });
    await this.audit.record(admin, 'auth.logout');
  }

  // ---- own account ---------------------------------------------------------

  async updateProfile(admin: AdminUser, name: string) {
    admin.name = name;
    return this.toDto(await this.admins.save(admin));
  }

  /** Signs out every other session, keeping the one that made the change. */
  async changePassword(
    admin: AdminUser,
    sessionId: string,
    current: string,
    next: string,
  ) {
    if (!(await verifyPassword(current, admin.passwordHash))) {
      throw new BadRequestException('Current password is wrong');
    }
    admin.passwordHash = await hashPassword(next);
    await this.admins.save(admin);
    await this.revokeAll(admin.id, sessionId);
    await this.audit.record(admin, 'auth.password_change');
  }

  async listSessions(adminId: string, currentId: string) {
    const rows = await this.sessions.find({
      where: { admin: { id: adminId }, revokedAt: IsNull() },
      order: { lastSeenAt: 'DESC' },
    });
    const now = Date.now();
    return rows
      .filter((s) => s.expiresAt.getTime() > now)
      .map((s) => ({
        id: s.id,
        ip: s.ip,
        userAgent: s.userAgent,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        expiresAt: s.expiresAt,
        current: s.id === currentId,
      }));
  }

  async revokeSession(admin: AdminUser, id: string) {
    const res = await this.sessions.update(
      { id, admin: { id: admin.id }, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    if (!res.affected) throw new NotFoundException('Session not found');
    await this.audit.record(admin, 'auth.session_revoke', id);
  }

  async revokeOthers(admin: AdminUser, keepId: string) {
    await this.revokeAll(admin.id, keepId);
    await this.audit.record(admin, 'auth.sessions_revoke_others');
  }

  private revokeAll(adminId: string, keepId?: string) {
    return this.sessions.update(
      {
        admin: { id: adminId },
        revokedAt: IsNull(),
        ...(keepId ? { id: Not(keepId) } : {}),
      },
      { revokedAt: new Date() },
    );
  }

  // ---- team (owners only) --------------------------------------------------

  async listAdmins() {
    const rows = await this.admins.find({ order: { createdAt: 'ASC' } });
    return rows.map((a) => this.toDto(a));
  }

  async createAdmin(by: AdminUser, dto: CreateAdminDto) {
    if (await this.admins.existsBy({ email: dto.email })) {
      throw new ConflictException('An admin with that email already exists');
    }
    const admin = await this.admins.save(
      this.admins.create({
        email: dto.email,
        name: dto.name,
        role: dto.role,
        passwordHash: await hashPassword(dto.password),
      }),
    );
    await this.audit.record(by, 'team.create', admin.email, { role: dto.role });
    return this.toDto(admin);
  }

  async updateAdmin(by: AdminUser, id: string, dto: UpdateAdminDto) {
    const admin = await this.admins.findOneBy({ id });
    if (!admin) throw new NotFoundException('Admin not found');
    if (
      admin.id === by.id &&
      (dto.active === false || (dto.role && dto.role !== 'owner'))
    ) {
      throw new ForbiddenException(
        "You can't demote or deactivate yourself. Ask another owner.",
      );
    }
    const losesOwner =
      admin.role === 'owner' &&
      admin.active &&
      (dto.active === false || (dto.role && dto.role !== 'owner'));
    if (losesOwner) await this.assertAnotherOwner(admin.id);

    if (dto.role) admin.role = dto.role;
    if (dto.active !== undefined) admin.active = dto.active;
    if (dto.password) admin.passwordHash = await hashPassword(dto.password);
    if (dto.resetTwoFactor) {
      admin.totpSecret = null;
      admin.totpPendingSecret = null;
      admin.totpEnabledAt = null;
      admin.totpLastStep = null;
      admin.totpRecoveryCodes = null;
    }
    await this.admins.save(admin);

    if (dto.active === false || dto.password || dto.resetTwoFactor) {
      await this.revokeAll(admin.id);
    }
    await this.audit.record(by, 'team.update', admin.email, {
      role: dto.role,
      active: dto.active,
      passwordReset: !!dto.password,
      twoFactorReset: !!dto.resetTwoFactor,
    });
    return this.toDto(admin);
  }

  async deleteAdmin(by: AdminUser, id: string) {
    const admin = await this.admins.findOneBy({ id });
    if (!admin) throw new NotFoundException('Admin not found');
    if (admin.id === by.id) {
      throw new ForbiddenException("You can't remove yourself");
    }
    if (admin.role === 'owner' && admin.active) {
      await this.assertAnotherOwner(admin.id);
    }
    await this.admins.remove(admin);
    await this.audit.record(by, 'team.delete', admin.email);
  }

  private async assertAnotherOwner(exceptId: string) {
    const others = await this.admins.countBy({
      role: 'owner',
      active: true,
      id: Not(exceptId),
    });
    if (others === 0) {
      throw new ForbiddenException('There must be at least one active owner');
    }
  }
}
