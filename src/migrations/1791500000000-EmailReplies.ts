import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Email replies and reply threads received via inbound email / Resend webhook.
 */
export class EmailReplies1791500000000 implements MigrationInterface {
  name = 'EmailReplies1791500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "email_replies" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "resend_email_id" character varying,
        "message_id" character varying,
        "in_reply_to" character varying,
        "references" text,
        "from_email" character varying NOT NULL,
        "from_name" character varying,
        "to_email" character varying NOT NULL,
        "subject" character varying NOT NULL DEFAULT '',
        "body_text" text NOT NULL DEFAULT '',
        "body_html" text,
        "snippet" character varying(300) NOT NULL DEFAULT '',
        "status" character varying NOT NULL DEFAULT 'unread',
        "user_id" uuid,
        "broadcast_id" uuid,
        "headers" text,
        "last_replied_at" TIMESTAMP WITH TIME ZONE,
        "reply_count" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_email_replies_id" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_email_replies_status_created" ON "email_replies" ("status", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_email_replies_from_email" ON "email_replies" ("from_email")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_email_replies_broadcast_id" ON "email_replies" ("broadcast_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_email_replies_user_id" ON "email_replies" ("user_id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "email_replies" ADD CONSTRAINT "FK_email_replies_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_replies" ADD CONSTRAINT "FK_email_replies_broadcast_id" FOREIGN KEY ("broadcast_id") REFERENCES "broadcasts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "email_reply_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "reply_id" uuid NOT NULL,
        "sender_type" character varying NOT NULL DEFAULT 'admin',
        "sender_email" character varying NOT NULL,
        "sender_name" character varying,
        "body_text" text NOT NULL DEFAULT '',
        "body_html" text,
        "resend_message_id" character varying,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_email_reply_messages_id" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_email_reply_messages_reply_id" ON "email_reply_messages" ("reply_id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "email_reply_messages" ADD CONSTRAINT "FK_email_reply_messages_reply_id" FOREIGN KEY ("reply_id") REFERENCES "email_replies"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_reply_messages" DROP CONSTRAINT "FK_email_reply_messages_reply_id"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_email_reply_messages_reply_id"`);
    await queryRunner.query(`DROP TABLE "email_reply_messages"`);

    await queryRunner.query(
      `ALTER TABLE "email_replies" DROP CONSTRAINT "FK_email_replies_broadcast_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_replies" DROP CONSTRAINT "FK_email_replies_user_id"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_email_replies_user_id"`);
    await queryRunner.query(`DROP INDEX "IDX_email_replies_broadcast_id"`);
    await queryRunner.query(`DROP INDEX "IDX_email_replies_from_email"`);
    await queryRunner.query(`DROP INDEX "IDX_email_replies_status_created"`);
    await queryRunner.query(`DROP TABLE "email_replies"`);
  }
}
