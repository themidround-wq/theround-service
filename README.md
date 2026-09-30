# The Round — API

NestJS + TypeORM backend for The Round (clinical speaking practice). Everything is under `/api`; all routes except `POST /auth/google` need `Authorization: Bearer <jwt>`.

## Run

```bash
cp .env.example .env   # set JWT_SECRET and GOOGLE_CLIENT_ID
npm install
npm run start:dev
```

SQLite and local-disk audio by default. Categories/topics/questions are seeded on first boot (`src/catalog/seed.ts`).

## Deploy (Render + Neon + Cloudflare R2)

1. **Neon:** copy the *pooled* connection string (`...-pooler...?sslmode=require`).
2. **R2:** create a private bucket and an Object Read & Write API token scoped to it.
3. **Render** (Web Service, Node): build `npm install && npm run build`, start `npm run start:prod`. Environment:
   ```
   NODE_ENV=production
   DB_TYPE=postgres
   DB_URL=<neon pooled url>
   S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   S3_BUCKET=<bucket>
   S3_ACCESS_KEY_ID=...
   S3_SECRET_ACCESS_KEY=...
   JWT_SECRET=<long random string>
   GOOGLE_CLIENT_ID=...
   CORS_ORIGIN=<front-end origin>
   ```
Migrations run automatically on boot when `DB_TYPE=postgres`.

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
