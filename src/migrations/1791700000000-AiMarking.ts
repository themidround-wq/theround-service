import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AI marking: question rubrics, and on rounds the transcript, where the
 * feedback came from, marking metadata (providers, tokens, cost) and admin flags.
 */
export class AiMarking1791700000000 implements MigrationInterface {
  name = 'AiMarking1791700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "questions" ADD "rubric" text`);
    await q.query(`ALTER TABLE "rounds" ADD "transcript" text`);
    await q.query(
      `ALTER TABLE "rounds" ADD "feedbackSource" character varying`,
    );
    await q.query(`ALTER TABLE "rounds" ADD "markingMeta" text`);
    await q.query(`ALTER TABLE "rounds" ADD "flaggedAt" TIMESTAMP`);
    await q.query(`ALTER TABLE "rounds" ADD "flagNote" character varying`);
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const col of [
      'flagNote',
      'flaggedAt',
      'markingMeta',
      'feedbackSource',
      'transcript',
    ]) {
      await q.query(`ALTER TABLE "rounds" DROP COLUMN "${col}"`);
    }
    await q.query(`ALTER TABLE "questions" DROP COLUMN "rubric"`);
  }
}
