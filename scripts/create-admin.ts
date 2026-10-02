/**
 * Creates a dashboard admin, or resets an existing one's password.
 *
 *   npm run admin:create -- <email> [--name "Ani"] [--role owner|admin|viewer] [--reset [--reset-2fa]] [--yes]
 *
 * Uses the database from .env (DB_TYPE / DB_URL, or local SQLite). Against
 * Postgres it shows the target and needs --yes, so production is never
 * touched by accident.
 *
 * The password is generated and printed once. To choose it yourself, set
 * ADMIN_NEW_PASSWORD in the environment (10+ chars) — never pass it as an
 * argument, where it would land in shell history.
 *
 * --reset: if the email exists, sets a new password, reactivates the account,
 * applies --role if given, and signs out all of its sessions.
 *
 * --reset-2fa: with --reset, also turns off two-factor (lost phone and lost
 * recovery codes). They can set it up again after signing in.
 */
import 'dotenv/config';
import { randomBytes } from 'crypto';
import { DataSource } from 'typeorm';
import {
  ADMIN_ROLES,
  AdminAuditLog,
  AdminRole,
  AdminSession,
  AdminUser,
} from '../src/admin/admin.entities';
import { hashPassword } from '../src/admin/password';

function usage(msg?: string): never {
  if (msg) console.error(`\n  ${msg}\n`);
  console.error(
    '  Usage: npm run admin:create -- <email> [--name "Name"] [--role owner|admin|viewer] [--reset [--reset-2fa]] [--yes]\n',
  );
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const out = {
    email: '',
    name: '',
    role: undefined as AdminRole | undefined,
    reset: false,
    reset2fa: false,
    yes: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--reset') out.reset = true;
    else if (a === '--reset-2fa') out.reset2fa = true;
    else if (a === '--yes' || a === '-y') out.yes = true;
    else if (a === '--name') out.name = argv[++i] ?? '';
    else if (a === '--role') {
      const r = argv[++i] as AdminRole;
      if (!ADMIN_ROLES.includes(r))
        usage(`--role must be one of ${ADMIN_ROLES.join(', ')}`);
      out.role = r;
    } else if (a === '--password')
      usage(
        'Set ADMIN_NEW_PASSWORD in the environment instead of passing --password.',
      );
    else if (a.startsWith('-')) usage(`Unknown option ${a}`);
    else if (!out.email) out.email = a.trim().toLowerCase();
    else usage(`Unexpected argument ${a}`);
  }
  if (out.reset2fa && !out.reset)
    usage('--reset-2fa only works together with --reset.');
  if (!out.email) usage('Give the admin email.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email))
    usage(`"${out.email}" isn't a valid email.`);
  return out;
}

/** 20 characters, no look-alikes. */
function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(20), (b) => chars[b % chars.length]).join('');
}

const isPostgres = process.env.DB_TYPE === 'postgres';

/** Host/database only, never credentials. */
function describeTarget() {
  if (!isPostgres)
    return `SQLite file ${process.env.DB_PATH ?? 'data/theround.sqlite'}`;
  try {
    const u = new URL(process.env.DB_URL ?? '');
    return `Postgres ${u.hostname}${u.pathname}`;
  } catch {
    return 'Postgres (DB_URL is not a valid URL)';
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = describeTarget();
  console.log(`\n  Database: ${target}`);

  if (isPostgres && !process.env.DB_URL)
    usage('DB_TYPE=postgres but DB_URL is not set.');
  if (isPostgres && !args.yes) {
    console.log(
      '  This is a Postgres database. Re-run with --yes to write to it.\n',
    );
    process.exit(1);
  }

  const chosen = process.env.ADMIN_NEW_PASSWORD;
  if (chosen !== undefined && chosen.length < 10)
    usage('ADMIN_NEW_PASSWORD must be at least 10 characters.');
  const password = chosen || generatePassword();

  const db = new DataSource(
    isPostgres
      ? {
          type: 'postgres',
          url: process.env.DB_URL,
          entities: [AdminUser, AdminSession, AdminAuditLog],
        }
      : {
          type: 'better-sqlite3',
          database: process.env.DB_PATH ?? 'data/theround.sqlite',
          entities: [AdminUser, AdminSession, AdminAuditLog],
        },
  );
  await db.initialize();

  try {
    const runner = db.createQueryRunner();
    const ready = await runner.hasTable('admin_users');
    await runner.release();
    if (!ready) {
      console.error(
        "\n  The admin tables don't exist in this database yet.\n" +
          '  Deploy the service with the admin changes first (migrations run on boot),\n' +
          '  or run `npm run migration:run` against it, then try again.\n',
      );
      process.exitCode = 1;
      return;
    }

    const admins = db.getRepository(AdminUser);
    const existing = await admins.findOneBy({ email: args.email });

    if (existing && !args.reset) {
      console.error(
        `\n  ${args.email} is already an admin (${existing.role}, ${existing.active ? 'active' : 'no access'}).\n` +
          '  Add --reset to set a new password and restore access.\n',
      );
      process.exitCode = 1;
      return;
    }

    const passwordHash = await hashPassword(password);
    let admin: AdminUser;
    let action: string;

    if (existing) {
      existing.passwordHash = passwordHash;
      existing.active = true;
      if (args.role) existing.role = args.role;
      if (args.name) existing.name = args.name;
      if (args.reset2fa) {
        existing.totpSecret = null;
        existing.totpPendingSecret = null;
        existing.totpEnabledAt = null;
        existing.totpLastStep = null;
        existing.totpRecoveryCodes = null;
      }
      admin = await admins.save(existing);
      await db
        .getRepository(AdminSession)
        .createQueryBuilder()
        .update()
        .set({ revokedAt: new Date() })
        .where('admin_id = :id AND revoked_at IS NULL', { id: existing.id })
        .execute();
      action = 'team.update';
    } else {
      admin = await admins.save(
        admins.create({
          email: args.email,
          name: args.name || args.email.split('@')[0],
          role: args.role ?? 'owner',
          passwordHash,
        }),
      );
      action = 'team.create';
    }

    await db.getRepository(AdminAuditLog).insert({
      adminId: null,
      adminEmail: 'cli:create-admin',
      action,
      target: admin.email,
      details: JSON.stringify({
        role: admin.role,
        passwordReset: !!existing,
        twoFactorReset: args.reset2fa,
        via: 'scripts/create-admin.ts',
      }),
      ip: null,
    });

    console.log(
      `\n  ${existing ? 'Reset' : 'Created'} ${admin.role} ${admin.email} (${admin.name}).`,
    );
    if (args.reset2fa) {
      console.log(
        '  Two-factor is off; they can set it up again under Settings.',
      );
    }
    if (chosen) {
      console.log('  Password: the one you set in ADMIN_NEW_PASSWORD.\n');
    } else {
      console.log(`  Password: ${password}`);
      console.log(
        '  Shown once. Sign in, then change it under Settings → Password.\n',
      );
    }
  } finally {
    await db.destroy();
  }
}

main().catch((e: unknown) => {
  console.error('\n  Failed:', e instanceof Error ? e.message : e, '\n');
  process.exit(1);
});
