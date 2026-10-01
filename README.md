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
   CORS_ORIGIN=<front-end origin>
   RESEND_API_KEY=...
   RESEND_FROM="The Round <hello@gettheround.com>"
   APP_URL=<web app origin, for email buttons>
   ```
Migrations run automatically on boot when `DB_TYPE=postgres`.

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

## API docs

Swagger UI is served at `/api/docs` (raw OpenAPI JSON at `/api/docs-json`). Sign in via `POST /auth/google`, click **Authorize** and paste the `accessToken` to try the protected routes. It's enabled in every environment; gate it behind an env flag if you don't want it public in production.
