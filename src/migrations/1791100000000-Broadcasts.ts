import { MigrationInterface, QueryRunner } from 'typeorm';

/** Newsletters / updates / service notices, their recipients, and opt-outs. */
export class Broadcasts1791100000000 implements MigrationInterface {
  name = 'Broadcasts1791100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "broadcasts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "kind" character varying NOT NULL DEFAULT 'newsletter', "subject" character varying NOT NULL DEFAULT '', "preheader" character varying NOT NULL DEFAULT '', "headline" character varying NOT NULL DEFAULT '', "body_html" text NOT NULL DEFAULT '', "cta_label" character varying, "cta_url" character varying, "audience" character varying NOT NULL DEFAULT 'users_all', "status" character varying NOT NULL DEFAULT 'draft', "scheduled_at" TIMESTAMP WITH TIME ZONE, "started_at" TIMESTAMP WITH TIME ZONE, "sent_at" TIMESTAMP WITH TIME ZONE, "locked_until" TIMESTAMP WITH TIME ZONE, "recipient_count" integer NOT NULL DEFAULT 0, "sent_count" integer NOT NULL DEFAULT 0, "failed_count" integer NOT NULL DEFAULT 0, "suppressed_count" integer NOT NULL DEFAULT 0, "created_by" character varying NOT NULL, "updated_by" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_broadcasts_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_broadcasts_status_scheduled" ON "broadcasts" ("status", "scheduled_at")`,
    );
    await queryRunner.query(
      `CREATE TABLE "broadcast_recipients" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "name" character varying, "status" character varying NOT NULL DEFAULT 'pending', "error" character varying, "batch_key" character varying, "message_id" character varying, "sent_at" TIMESTAMP WITH TIME ZONE, "broadcast_id" uuid NOT NULL, CONSTRAINT "UQ_broadcast_recipients_email" UNIQUE ("broadcast_id", "email"), CONSTRAINT "PK_broadcast_recipients_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_broadcast_recipients_status" ON "broadcast_recipients" ("broadcast_id", "status")`,
    );
    await queryRunner.query(
      `ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "FK_broadcast_recipients_broadcast_id" FOREIGN KEY ("broadcast_id") REFERENCES "broadcasts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE TABLE "email_unsubscribes" ("email" character varying NOT NULL, "source" character varying NOT NULL DEFAULT 'link', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_email_unsubscribes_email" PRIMARY KEY ("email"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "email_unsubscribes"`);
    await queryRunner.query(
      `ALTER TABLE "broadcast_recipients" DROP CONSTRAINT "FK_broadcast_recipients_broadcast_id"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_broadcast_recipients_status"`);
    await queryRunner.query(`DROP TABLE "broadcast_recipients"`);
    await queryRunner.query(`DROP INDEX "IDX_broadcasts_status_scheduled"`);
    await queryRunner.query(`DROP TABLE "broadcasts"`);
  }
}
