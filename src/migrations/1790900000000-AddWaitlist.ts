import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Landing-page waitlist (moved from Supabase). Written through POST
 * /api/waitlist; ticket numbers are derived from `id`, so ids are
 * preserved when importing existing rows.
 */
export class AddWaitlist1790900000000 implements MigrationInterface {
  name = 'AddWaitlist1790900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "waitlist" ("id" BIGSERIAL NOT NULL, "email" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_waitlist_email" UNIQUE ("email"), CONSTRAINT "PK_waitlist_id" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "waitlist"`);
  }
}
