import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';

export type AuthedRequest = Request & { userId: string };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    // DataSource rather than UsersService: guards are instantiated in every
    // module that uses them, and DataSource is the one that's global.
    private readonly db: DataSource,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException();
    const payload = await this.jwt
      .verifyAsync<{ sub: string; typ?: string; aud?: string }>(token)
      .catch(() => null);
    // Admin and audio-link tokens share the signing key; only app tokens
    // (no typ/aud claim) are accepted here.
    if (!payload?.sub || payload.typ || payload.aud) {
      throw new UnauthorizedException();
    }
    const user = await this.db.getRepository(User).findOne({
      where: { id: payload.sub },
      select: { id: true, suspendedAt: true },
    });
    if (!user) throw new UnauthorizedException();
    if (user.suspendedAt) throw new ForbiddenException('Account suspended');
    req.userId = payload.sub;
    return true;
  }
}

export const UserId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<AuthedRequest>().userId,
);
