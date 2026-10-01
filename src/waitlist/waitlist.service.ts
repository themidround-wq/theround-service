import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { EmailService } from '../email/email.service';
import { WaitlistEntry } from './waitlist.entity';

const TICKET_OFFSET = 1000;

/** Unique violation: Postgres code, then better-sqlite3 code. */
const isDuplicate = (e: unknown) =>
  e instanceof QueryFailedError &&
  ['23505', 'SQLITE_CONSTRAINT_UNIQUE'].includes(
    (e.driverError as { code?: string }).code ?? '',
  );

@Injectable()
export class WaitlistService {
  constructor(
    @InjectRepository(WaitlistEntry)
    private readonly repo: Repository<WaitlistEntry>,
    private readonly email: EmailService,
  ) {}

  /**
   * Idempotent: a repeat signup returns the existing ticket with
   * `isNew: false` and sends nothing, so re-submitting an address cannot be
   * used to re-trigger mail to it.
   */
  async join(email: string) {
    let isNew = true;
    try {
      await this.repo.insert({ email });
    } catch (e) {
      if (!isDuplicate(e)) throw e;
      isNew = false;
    }

    const id = Number((await this.repo.findOneByOrFail({ email })).id);
    const ticketNumber = TICKET_OFFSET + id;

    // Not awaited: the signup has landed, so a slow Resend call must not
    // delay the response. sendWaitlistSuccess never rejects.
    if (isNew) void this.email.sendWaitlistSuccess(email, id, ticketNumber);

    return { id, ticketNumber, isNew };
  }
}
