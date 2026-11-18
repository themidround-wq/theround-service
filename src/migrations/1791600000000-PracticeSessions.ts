import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Chat-style practice sessions for the app:
 * - categories.slug (stable key for topic chips), backfilled for known names
 * - practice topics for nursing + core sciences, added if missing
 * - practice_sessions table (soft delete for "Undo")
 * - rounds: sessionId, retake, prompt, intro, score, feedback
 */

const SLUGS: Record<string, string> = {
  Anatomy: 'anatomy',
  Physiology: 'physiology',
  Pharmacology: 'pharmacology',
  'Foundations of Nursing': 'fon',
  'Antenatal Care': 'antenatal',
  'Labour & Delivery': 'labour',
  'Postnatal Care': 'postnatal',
  'Newborn Care': 'newborn',
  'Family Planning': 'family-planning',
  'Medical Nursing': 'medical',
  'Emergency Care': 'emergency',
  'Surgical Care': 'surgical',
  'Mental Health': 'mental-health',
  'High-Risk Pregnancy': 'high-risk-pregnancy',
  'Clinical Ethics': 'clinical-ethics',
  'Public Health': 'public-health',
};

// Frozen copy of catalog/seed.ts PRACTICE_SEED at the time of this migration.
const NEW_TOPICS: [category: string, topic: string, question: string][] = [
  [
    'Anatomy',
    'Female pelvis',
    'Describe the features of the female pelvis that matter in labour.',
  ],
  [
    'Physiology',
    'Cardiovascular changes',
    'Explain the cardiovascular changes in pregnancy.',
  ],
  ['Pharmacology', 'Oxytocin', 'What should you know before giving oxytocin?'],
  [
    'Foundations of Nursing',
    'Vital signs',
    'How do you take and interpret a set of vital signs?',
  ],
  [
    'Medical Nursing',
    'Hyperglycaemia',
    'How would you care for a patient admitted with hyperglycaemia?',
  ],
  ['Emergency Care', 'Primary survey', 'Walk me through a primary survey.'],
  [
    'Surgical Care',
    'Post-operative care',
    'What are your priorities in the first hour after surgery?',
  ],
  [
    'Mental Health',
    'Risk assessment',
    'How would you approach a patient expressing suicidal thoughts?',
  ],
];

export class PracticeSessions1791600000000 implements MigrationInterface {
  name = 'PracticeSessions1791600000000';

  public async up(q: QueryRunner): Promise<void> {
    // categories.slug
    await q.query(`ALTER TABLE "categories" ADD "slug" character varying`);
    await q.query(
      `ALTER TABLE "categories" ADD CONSTRAINT "UQ_420d9f679d41281f282f5bc7d09" UNIQUE ("slug")`,
    );
    for (const [name, slug] of Object.entries(SLUGS)) {
      await q.query(
        `UPDATE "categories" SET "slug" = $2 WHERE "name" = $1 AND "slug" IS NULL
           AND NOT EXISTS (SELECT 1 FROM "categories" WHERE "slug" = $2)`,
        [name, slug],
      );
    }

    // New practice topics (skipped when a category with that name exists).
    for (const [category, topic, question] of NEW_TOPICS) {
      const inserted = (await q.query(
        `INSERT INTO "categories" ("name", "slug", "sortOrder")
         SELECT $1::varchar, $2::varchar, COALESCE(MAX("sortOrder"), -1) + 1 FROM "categories"
         WHERE NOT EXISTS (SELECT 1 FROM "categories" WHERE "name" = $1::varchar)
           AND NOT EXISTS (SELECT 1 FROM "categories" WHERE "slug" = $2::varchar)
         RETURNING "id"`,
        [category, SLUGS[category]],
      )) as { id: string }[];
      if (!inserted.length) continue;
      const [t] = (await q.query(
        `INSERT INTO "topics" ("name", "categoryId") VALUES ($1, $2) RETURNING "id"`,
        [topic, inserted[0].id],
      )) as { id: string }[];
      await q.query(
        `INSERT INTO "questions" ("text", "topicId") VALUES ($1, $2)`,
        [question, t.id],
      );
    }

    // practice_sessions
    await q.query(
      `CREATE TABLE "practice_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title" character varying NOT NULL,
        "categorySlug" character varying NOT NULL,
        "pickingTopic" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        "userId" uuid NOT NULL,
        CONSTRAINT "PK_70d97b1cdd66f9b01bd492b92fc" PRIMARY KEY ("id")
      )`,
    );
    await q.query(
      `CREATE INDEX "IDX_61e620bc7b9f2a3aa914ce0e14" ON "practice_sessions" ("userId", "deletedAt", "createdAt")`,
    );
    await q.query(
      `ALTER TABLE "practice_sessions" ADD CONSTRAINT "FK_b7aae8f48b274330eada008e28c" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // rounds ← practice fields
    await q.query(`ALTER TABLE "rounds" ADD "sessionId" uuid`);
    await q.query(
      `ALTER TABLE "rounds" ADD "retake" boolean NOT NULL DEFAULT false`,
    );
    await q.query(`ALTER TABLE "rounds" ADD "prompt" character varying`);
    await q.query(`ALTER TABLE "rounds" ADD "intro" character varying`);
    await q.query(`ALTER TABLE "rounds" ADD "score" integer`);
    await q.query(`ALTER TABLE "rounds" ADD "feedback" text`);
    await q.query(
      `ALTER TABLE "rounds" ADD CONSTRAINT "FK_90a228425cd23d8762a281c3028" FOREIGN KEY ("sessionId") REFERENCES "practice_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await q.query(
      `CREATE INDEX "IDX_rounds_sessionId" ON "rounds" ("sessionId")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "public"."IDX_rounds_sessionId"`);
    await q.query(
      `ALTER TABLE "rounds" DROP CONSTRAINT "FK_90a228425cd23d8762a281c3028"`,
    );
    // Practice rounds can't exist without their session; drop them before the columns.
    await q.query(`DELETE FROM "rounds" WHERE "sessionId" IS NOT NULL`);
    for (const col of [
      'feedback',
      'score',
      'intro',
      'prompt',
      'retake',
      'sessionId',
    ]) {
      await q.query(`ALTER TABLE "rounds" DROP COLUMN "${col}"`);
    }
    await q.query(`DROP TABLE "practice_sessions"`);
    // Added topics are left in place (they may have been practised or edited).
    await q.query(
      `ALTER TABLE "categories" DROP CONSTRAINT "UQ_420d9f679d41281f282f5bc7d09"`,
    );
    await q.query(`ALTER TABLE "categories" DROP COLUMN "slug"`);
  }
}
