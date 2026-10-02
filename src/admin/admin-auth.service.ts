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
import { IsNull, Not, Repository } from 'typeorm';
import { AdminSession, AdminUser } from './admin.entities';
import type { AdminClaims } from './admin.guard';
import { AuditService } from './audit.service';
import { CreateAdminDto, UpdateAdminDto } from './dto';
import { DUMMY_HASH, hashPassword, verifyPassword } from './password';

const SESSION_HOURS = 12;
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60_000;

type Meta = { ip?: string; userAgent?: string };

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
  ) {}

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
    };
  }

  // ---- login / logout ------------------------------------------------------

  async login(email: string, password: string, meta: Meta) {
    const lock = this.failures.get(email);
    if (lock && lock.n >= MAX_FAILURES && lock.until > Date.now()) {
      throw new HttpException(
        'Too many attempts. Try again in a few minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const admin = await this.admins.findOneBy({ email });
    const ok = await verifyPassword(
      password,
      admin?.passwordHash ?? (await DUMMY_HASH),
    );
    if (!admin || !ok || !admin.active) {
      const prev = lock && lock.until > Date.now() ? lock.n : 0;
      this.failures.set(email, { n: prev + 1, until: Date.now() + LOCKOUT_MS });
      throw new UnauthorizedException('Wrong email or password');
    }
    this.failures.delete(email);

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
    admin.lastLoginAt = now;
    await this.admins.save(admin);
    await this.audit.record(admin, 'auth.login', null, undefined, meta.ip);

    const claims: AdminClaims = {
      sub: admin.id,
      sid: session.id,
      typ: 'admin',
    };
    return {
      accessToken: await this.jwt.signAsync(claims, {
        expiresIn: SESSION_HOURS * 3600,
      }),
      expiresAt,
      admin: this.toDto(admin),
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
    await this.admins.save(admin);

    if (dto.active === false || dto.password) await this.revokeAll(admin.id);
    await this.audit.record(by, 'team.update', admin.email, {
      role: dto.role,
      active: dto.active,
      passwordReset: !!dto.password,
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
