import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import {
  AdminRole,
  AdminSession,
  AdminUser,
  roleAtLeast,
} from './admin.entities';

export type AdminClaims = { sub: string; sid: string; typ: 'admin' };

export type AdminRequest = Request & {
  admin: AdminUser;
  adminSessionId: string;
};

const MIN_ROLE = 'adminMinRole';

/** Minimum role for a route; defaults to `viewer` (any signed-in admin). */
export const RequireRole = (role: AdminRole) => SetMetadata(MIN_ROLE, role);

/** Only refresh `last_seen_at` this often, to avoid a write per request. */
const SEEN_THROTTLE_MS = 5 * 60_000;

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    @InjectRepository(AdminSession)
    private readonly sessions: Repository<AdminSession>,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AdminRequest>();
    const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException();

    const claims = await this.jwt
      .verifyAsync<AdminClaims>(token)
      .catch(() => null);
    if (!claims || claims.typ !== 'admin' || !claims.sid) {
      throw new UnauthorizedException();
    }

    const session = await this.sessions.findOne({
      where: { id: claims.sid },
      relations: { admin: true },
    });
    const now = new Date();
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.admin.id !== claims.sub ||
      !session.admin.active
    ) {
      throw new UnauthorizedException('Session expired');
    }

    const min =
      this.reflector.getAllAndOverride<AdminRole | undefined>(MIN_ROLE, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? 'viewer';
    if (!roleAtLeast(session.admin.role, min)) {
      throw new ForbiddenException(`Requires the ${min} role`);
    }

    if (now.getTime() - session.lastSeenAt.getTime() > SEEN_THROTTLE_MS) {
      await this.sessions.update(session.id, { lastSeenAt: now });
    }

    req.admin = session.admin;
    req.adminSessionId = session.id;
    return true;
  }
}

export const CurrentAdmin = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<AdminRequest>().admin,
);

export const AdminSessionId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<AdminRequest>().adminSessionId,
);
