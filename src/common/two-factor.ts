import { BadRequestException, ConflictException, Logger } from '@nestjs/common';
import {
  FindOptionsWhere,
  IsNull,
  LessThan,
  ObjectLiteral,
  Or,
  Repository,
} from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashToken,
  normaliseRecoveryCode,
  otpauthUri,
  verifyTotp,
} from './totp';

/** The columns an entity needs to support TOTP two-factor. */
export type TotpFields = {
  id: string;
  totpSecret: string | null;
  totpPendingSecret: string | null;
  totpEnabledAt: Date | null;
  totpLastStep: number | null;
  totpRecoveryCodes: string | null;
};

export type SecondFactor = 'totp' | 'recovery';

const clean = (code: string) => code.replace(/\s+/g, '');
const logger = new Logger('TwoFactor');
const hashAll = (codes: string[]) =>
  JSON.stringify(codes.map((c) => hashToken(normaliseRecoveryCode(c))));

/**
 * TOTP two-factor for any entity with `TotpFields` (admins and app users).
 * Secrets are encrypted at rest; app codes can't be replayed; recovery codes
 * are single use. Callers handle sign-in flow, throttling and auditing.
 */
export class TwoFactor<T extends TotpFields & ObjectLiteral> {
  constructor(
    private readonly repo: Repository<T>,
    private readonly key: string,
    /** Name shown in the authenticator app, e.g. "The Round". */
    private readonly issuer: string,
  ) {}

  private where(e: T, extra: Record<string, unknown> = {}) {
    return { id: e.id, ...extra } as unknown as FindOptionsWhere<T>;
  }

  private set(values: Partial<TotpFields>) {
    return values as QueryDeepPartialEntity<T>;
  }

  status(e: T) {
    return {
      enabled: !!e.totpEnabledAt,
      enabledAt: e.totpEnabledAt,
      recoveryCodesLeft: e.totpEnabledAt
        ? (JSON.parse(e.totpRecoveryCodes ?? '[]') as string[]).length
        : 0,
    };
  }

  /** New secret to scan. Nothing changes for sign-in until it's confirmed. */
  async setup(e: T, account: string) {
    if (e.totpEnabledAt) {
      throw new ConflictException(
        'Two-factor is already on. Turn it off first to move it to a new phone.',
      );
    }
    const secret = generateTotpSecret();
    await this.repo.update(
      this.where(e),
      this.set({ totpPendingSecret: encryptSecret(secret, this.key) }),
    );
    return { secret, otpauthUri: otpauthUri(secret, account, this.issuer) };
  }

  /** Confirms setup with a code from the app; returns recovery codes, once. */
  async enable(e: T, code: string) {
    if (e.totpEnabledAt)
      throw new ConflictException('Two-factor is already on.');
    if (!e.totpPendingSecret)
      throw new BadRequestException('Start setup first.');
    const step = verifyTotp(
      decryptSecret(e.totpPendingSecret, this.key),
      clean(code),
      null,
    );
    if (step === null) {
      throw new BadRequestException(
        "That code didn't match. Check your phone's clock and try the newest code.",
      );
    }
    const recoveryCodes = generateRecoveryCodes();
    await this.repo.update(
      this.where(e),
      this.set({
        totpSecret: e.totpPendingSecret,
        totpPendingSecret: null,
        totpEnabledAt: new Date(),
        totpLastStep: step,
        totpRecoveryCodes: hashAll(recoveryCodes),
      }),
    );
    return { recoveryCodes };
  }

  /**
   * Accepts a current app code (each usable once) or an unused recovery code
   * (consumed). Returns which matched, or null.
   */
  async verify(e: T, raw: string): Promise<SecondFactor | null> {
    const code = clean(raw);
    if (/^\d{6}$/.test(code)) {
      if (!e.totpSecret) return null;
      let secret: string;
      try {
        secret = decryptSecret(e.totpSecret, this.key);
      } catch {
        // Wrong key (TOTP_KEY changed?): fail closed, never 500.
        logger.error(
          `Can't decrypt the 2FA secret for ${e.id}. Did TOTP_KEY change?`,
        );
        return null;
      }
      const step = verifyTotp(secret, code, e.totpLastStep);
      if (step === null) return null;
      // Conditional update: two requests racing with one code can't both win.
      const res = await this.repo.update(
        this.where(e, { totpLastStep: Or(IsNull(), LessThan(step)) }),
        this.set({ totpLastStep: step }),
      );
      if (!res.affected) return null;
      e.totpLastStep = step;
      return 'totp';
    }

    const normalised = normaliseRecoveryCode(code);
    if (!normalised) return null;
    const hashes = JSON.parse(e.totpRecoveryCodes ?? '[]') as string[];
    const hash = hashToken(normalised);
    if (!hashes.includes(hash)) return null;
    const remaining = JSON.stringify(hashes.filter((h) => h !== hash));
    // Only succeeds if nobody consumed a code in the meantime.
    const res = await this.repo.update(
      this.where(e, { totpRecoveryCodes: e.totpRecoveryCodes ?? '' }),
      this.set({ totpRecoveryCodes: remaining }),
    );
    if (!res.affected) return null;
    e.totpRecoveryCodes = remaining;
    return 'recovery';
  }

  /** Turns 2FA off after checking a code (or recovery code). */
  async disable(e: T, code: string) {
    if (!e.totpEnabledAt)
      throw new BadRequestException('Two-factor is not on.');
    if (!(await this.verify(e, code))) {
      throw new BadRequestException("That code didn't work.");
    }
    await this.clear(e.id);
  }

  /** Replaces every recovery code. Needs a current app code, not a recovery code. */
  async regenerate(e: T, code: string) {
    if (!e.totpEnabledAt)
      throw new BadRequestException('Two-factor is not on.');
    if (!/^\d{6}$/.test(clean(code)) || !(await this.verify(e, code))) {
      throw new BadRequestException(
        'Enter a current code from your authenticator app.',
      );
    }
    const recoveryCodes = generateRecoveryCodes();
    await this.repo.update(
      this.where(e),
      this.set({ totpRecoveryCodes: hashAll(recoveryCodes) }),
    );
    return { recoveryCodes };
  }

  /** Removes 2FA entirely (disable, or a support reset after a lost phone). */
  clear(id: string) {
    return this.repo.update(
      { id } as unknown as FindOptionsWhere<T>,
      this.set({
        totpSecret: null,
        totpPendingSecret: null,
        totpEnabledAt: null,
        totpLastStep: null,
        totpRecoveryCodes: null,
      }),
    );
  }
}

/** The encryption key for TOTP secrets: a dedicated one, or JWT_SECRET. */
export const totpKeyFrom = (get: (k: string) => string | undefined) => {
  const key = get('TOTP_KEY') ?? get('ADMIN_TOTP_KEY') ?? get('JWT_SECRET');
  if (!key) throw new Error('Set TOTP_KEY (or JWT_SECRET) to use two-factor.');
  return key;
};
