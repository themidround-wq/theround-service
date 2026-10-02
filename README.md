# The Round — API

NestJS + TypeORM backend for The Round (clinical speaking practice). Everything is under `/api`; all routes except `POST /auth/google` need `Authorization: Bearer <jwt>`.

## Run

```bash
cp .env.example .env   # set JWT_SECRET and GOOGLE_CLIENT_ID
npm install
npm run start:dev
```

SQLite and local-disk audio by default. Categories/topics/questions are seeded on first boot (`src/catalog/seed.ts`).

## Deploy (Render + Neon)

1. **Neon:** copy the *pooled* connection string (`...-pooler...?sslmode=require`).
2. **Neon object storage:** create a private bucket and generate an S3 credential for it.
3. **Render** (Web Service, Node): build `npm install && npm run build`, start `npm start` (runs the compiled `dist/`; never `nest start`, which compiles in memory and runs out of heap on small instances). Environment:
   ```
   NODE_ENV=production
   DB_TYPE=postgres
   DB_URL=<neon pooled url>
   S3_ENDPOINT=https://<BUCKET_ENDPOINT>.storage.<region>.aws.neon.tech
   S3_BUCKET=<bucket>
   S3_ACCESS_KEY_ID=...
   S3_SECRET_ACCESS_KEY=...
   JWT_SECRET=<long random string>
   GOOGLE_CLIENT_ID=...
   RESEND_API_KEY=...
   RESEND_FROM="The Round <hello@gettheround.com>"
   LANDING_URL=<landing page origin>
   APP_URL=<user dashboard origin, also used for email buttons>
   ADMIN_URL=<admin dashboard origin>
   CORS_ORIGIN=<optional extra origins, comma-separated>
   ```
Migrations run automatically on boot when `DB_TYPE=postgres`.

CORS allows `LANDING_URL`, `APP_URL` and `ADMIN_URL`, plus anything in `CORS_ORIGIN`. If none are set, any origin is allowed, which is meant for local dev only.

### Email

Sent through Resend from `src/email/`, best-effort and never blocking the request:

| Template | Sent when |
| --- | --- |
| `waitlist-success` | a new email joins via `POST /api/waitlist` |
| `welcome` | a user's first Google sign-in |
| `first-round` | a user saves their first round |
| `milestone` | saved rounds reach 5, 10, 25, 50 or 100 |
| `waitlist-invite` | not triggered yet; call `EmailService.sendWaitlistInvite` at launch |

Templates share one layout in `src/email/templates/layout.ts`.

```bash
npm run email:preview                          # writes .preview/<template>.html
npm run email:test -- [template] [recipient]   # defaults: all, delivered@resend.dev
```

### Changing the schema

Edit an entity, then generate a migration against a Postgres database (a throwaway local one is fine):

```bash
DB_URL=postgres://... npm run migration:generate -- src/migrations/DescribeChange
```

Commit the file in `src/migrations/`. SQLite (dev only) just auto-syncs.

## Endpoints

| Screen | Endpoint |
| --- | --- |
| Auth | `POST /auth/google` `{idToken}` → `{accessToken, isNewUser, user}`. `user` is prefilled from Google (`name` = first name, `email`, `pictureUrl`); `user.onboarded` is false until stage, avatar and goal are set. Later logins never overwrite an edited name. |
| Onboarding / profile / prefs | `GET /me` (user + stats, `user.onboarded`), `PATCH /me` (name, stage, course, year, semester, avatarId 1-8, goal, defaultResponseSeconds 90\|240, soundCues) |
| Wheel | `GET /catalog` (categories + topic count) |
| Spin | `POST /rounds/spin` → round with category, topic, question (weighted to least-practised categories) |
| Start round | `POST /rounds/:id/start` `{durationSeconds?: 90\|240}` |
| Finish | `POST /rounds/:id/complete` multipart: `audio` + `spokenSeconds` |
| Save attempt | `POST /rounds/:id/save` `{reflection?, note?}` (reflection: clear, a_little_unsure, lost_my_structure, want_another_go) |
| Discard / try another | `DELETE /rounds/:id` |
| History | `GET /rounds?search=&categoryId=&page=&limit=`, `GET /rounds/stats` |
| Saved round drawer | `GET /rounds/:id`, `GET /rounds/:id/audio` → `{url, expiresInSeconds}` (signed, ~15 min; use as `<audio src>`), `PATCH /rounds/:id` (bookmarked, reflection, note), `POST /rounds/:id/repeat` |

Round lifecycle: `spun → in_progress → completed → saved`. Only saved rounds appear in history and stats.

## Two-factor for app users (API only)

Optional TOTP two-factor, same mechanics as admins (`src/common/two-factor.ts`). The app has no screens for it yet; everything below is live in the API.

1. **Set up** (signed in): `POST /me/2fa/setup` → `{ secret, otpauthUri }`. Show `otpauthUri` as a QR code (issuer "The Round") and `secret` for manual entry.
2. **Turn on:** `POST /me/2fa/enable` `{ code }` → `{ recoveryCodes }` (10, shown once).
3. **Sign in:** `POST /auth/google` returns, for users with 2FA on, `{ twoFactorRequired: true, challengeToken }` *instead of* an access token. Send `POST /auth/2fa` `{ challengeToken, code }` (6-digit code or a recovery code) within 5 minutes to get the usual `{ twoFactorRequired: false, accessToken, isNewUser, user }`. Five wrong codes lock it for 15 minutes.
4. **Manage:** `GET /me/2fa` (status, recovery codes left), `POST /me/2fa/recovery-codes` `{ code }` (needs an app code), `POST /me/2fa/disable` `{ code }` (app or recovery code; users have no password here).
5. **Support:** `POST /admin/users/:id/reset-2fa` turns it off for someone who lost their phone (audited); also on the user's page in the admin dashboard.

Every sign-in response now carries `twoFactorRequired` and `user.twoFactorEnabled`. Before any user turns 2FA on, the app must handle `twoFactorRequired: true` (no `accessToken` in that response).

## Admin API

Everything under `/api/admin` backs the founder dashboard (`theround-admin`). Admins are separate from app users: they sign in with email + password and get a 12-hour bearer token tied to a session row, so logout and revocation take effect immediately.

- **First owner:** set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (10+ chars). The account is created on boot only while `admin_users` is empty; add everyone else from the dashboard's Team page.
- **From the command line:** `npm run admin:create -- <email> [--name "Name"] [--role owner|admin|viewer] [--reset] [--yes]` creates an admin (owner by default) in the database from `.env` and prints a generated password once. Set `ADMIN_NEW_PASSWORD` to choose it instead. `--reset` sets a new password on an existing admin, restores access and signs out their sessions; add `--reset-2fa` to also turn off their two-factor. Against Postgres it shows the target host and only writes with `--yes`.
- **Roles:** `viewer` (read-only), `admin` (all actions), `owner` (also manages the team).
- **Login throttling:** 5 failed attempts locks that email for 15 minutes (in memory, per instance).
- **Two-factor (TOTP):** any admin can turn it on under Settings (Google Authenticator, 1Password, Authy…). Sign-in then becomes password → short-lived challenge token (5 min, can't call the API) → 6-digit code or one of 10 single-use recovery codes. Secrets are AES-256-GCM encrypted with `TOTP_KEY` (falls back to `JWT_SECRET`; set a dedicated key so rotating `JWT_SECRET` doesn't break 2FA). If the key ever changes, codes are rejected (logged) rather than erroring. Codes can't be replayed; 5 wrong codes lock 2FA for 15 minutes. Owners can reset a teammate's 2FA from the Team page; for a locked-out owner use `npm run admin:create -- <email> --reset --reset-2fa --yes`.
- **Forgot password:** `POST /admin/auth/forgot-password` always answers 204 (no account discovery) and, for an active admin, emails a single-use link to `ADMIN_URL/reset-password` that expires in 30 minutes (3 per hour max). Resetting signs out every session and keeps 2FA on. Without Resend configured, the link is logged in non-production only.
- **Audit log:** every write, and every recording an admin plays, goes into `admin_audit_logs`.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /admin/auth/login` (→ `twoFactorRequired` + `challengeToken` when 2FA is on), `POST /admin/auth/login/2fa`, `POST /admin/auth/forgot-password`, `POST /admin/auth/reset-password`, `GET /admin/auth/2fa`, `POST /admin/auth/2fa/{setup,enable,disable,recovery-codes}`, `POST /admin/auth/logout`, `GET/PATCH /admin/auth/me`, `POST /admin/auth/password`, `GET /admin/auth/sessions`, `DELETE /admin/auth/sessions[/:id]` |
| Overview | `GET /admin/overview?days=`, `GET /admin/activity?days=` (7, 14, 30, 90) |
| Waitlist | `GET /admin/waitlist?search=&status=pending\|invited\|joined`, `GET /admin/waitlist/export` (CSV), `POST /admin/waitlist` `{emails}`, `POST /admin/waitlist/invite` `{ids}` (sends `waitlist-invite`), `DELETE /admin/waitlist/:id` |
| Users | `GET /admin/users?search=&stage=&status=`, `GET /admin/users/:id`, `PATCH /admin/users/:id` `{suspended}`, `DELETE /admin/users/:id` |
| Rounds | `GET /admin/rounds?search=&status=&categoryId=&userId=`, `GET /admin/rounds/:id/audio`, `DELETE /admin/rounds/:id` |
| Content | `GET /admin/catalog`, `POST/PATCH/DELETE /admin/catalog/{categories,topics,questions}[/:id]`, `PUT /admin/catalog/categories/order` |
| Settings | `GET/PATCH /admin/settings`, `GET /admin/audit`, `GET/POST/PATCH/DELETE /admin/team[/:id]` |

Settings (`app_settings`) take effect within 30 seconds on every instance: `waitlist.open`, `signups.open`, `practice.defaultResponseSeconds`, `email.waitlistConfirmation`, `email.welcome`, `email.progress`. Suspended users get `403` on sign-in and on every API call. Hidden categories (or ones with no questions) never appear on the wheel.

## Newsletters and updates

Sent from the dashboard's **Newsletters** page; everything lives in `src/broadcasts/` (admin endpoints in `src/admin/broadcasts.controller.ts`).

- **Types:** newsletter, feature update, announcement, maintenance. Maintenance notices are service messages: they only go to app users and reach them even if they unsubscribed.
- **Audiences:** all users, onboarded, students, qualified, inactive (no saved round in 14 days), waitlist without an account, whole waitlist, everyone. Counted live; resolved again when sending starts.
- **Content:** editor HTML is sanitised on save and styled inline into the shared email layout. `{{name}}` becomes the reader's first name ("there" if unknown). Optional button (https only).
- **Sending:** batches of 100 through Resend's batch API with permissive validation (one bad address fails only itself). Each batch's rows and idempotency key are fixed before it is sent and its result is written in one transaction, so a crash mid-batch re-sends the same batch under the same key and Resend drops the duplicates. A worker every 15 s starts due scheduled broadcasts and resumes interrupted ones; a lease column stops two instances sending the same broadcast.
- **Unsubscribe:** every email carries a signed per-address link (`/api/email/unsubscribe`) plus `List-Unsubscribe` one-click headers. Opening the link shows a confirm button, so link scanners can't unsubscribe people. Set `API_PUBLIC_URL` so links point at this API's public origin.

| Endpoint | |
| --- | --- |
| `GET /admin/broadcasts`, `GET /admin/broadcasts/summary`, `GET /admin/broadcasts/audiences?kind=` | list, 30-day summary, audiences with counts |
| `POST /admin/broadcasts`, `PATCH/DELETE /admin/broadcasts/:id`, `POST /admin/broadcasts/preview` | drafts and live preview |
| `POST /admin/broadcasts/:id/{test,schedule,send,cancel,retry,duplicate}` | test copy, schedule, send now, cancel/stop, retry failed, copy |
| `GET /admin/broadcasts/:id/recipients?status=` | per-recipient delivery |
| `GET/POST /admin/unsubscribes`, `DELETE /admin/unsubscribes/:email` | opt-out list |

## API docs

Swagger UI is served at `/api/docs` (raw OpenAPI JSON at `/api/docs-json`). Sign in via `POST /auth/google`, click **Authorize** and paste the `accessToken` to try the protected routes. It's enabled in every environment; gate it behind an env flag if you don't want it public in production.
