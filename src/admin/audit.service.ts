import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminAuditLog, AdminUser } from './admin.entities';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AdminAuditLog)
    private readonly repo: Repository<AdminAuditLog>,
  ) {}

  async record(
    admin: Pick<AdminUser, 'id' | 'email'>,
    action: string,
    target: string | null = null,
    details?: Record<string, unknown>,
    ip?: string,
  ) {
    await this.repo.insert({
      adminId: admin.id,
      adminEmail: admin.email,
      action,
      target,
      details: details ? JSON.stringify(details) : null,
      ip: ip ?? null,
    });
  }

  async list(q: { page: number; limit: number; action?: string }) {
    const qb = this.repo.createQueryBuilder('a');
    if (q.action) qb.where('a.action LIKE :a', { a: `${q.action}%` });
    const [rows, total] = await qb
      .orderBy('a.createdAt', 'DESC')
      .skip((q.page - 1) * q.limit)
      .take(q.limit)
      .getManyAndCount();
    return {
      items: rows.map((r) => ({
        ...r,
        details: r.details
          ? (JSON.parse(r.details) as Record<string, unknown>)
          : null,
      })),
      total,
      page: q.page,
      limit: q.limit,
      hasMore: q.page * q.limit < total,
    };
  }
}
