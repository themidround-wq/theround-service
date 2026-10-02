import { MigrationInterface, QueryRunner } from 'typeorm';

/** Admin two-factor authentication (TOTP) and "forgot password" links. */
export class AdminSecurity1791200000000 implements MigrationInterface {
  name = 'AdminSecurity1791200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "admin_users" ADD "totp_secret" character varying, ADD "totp_pending_secret" character varying, ADD "totp_enabled_at" TIMESTAMP WITH TIME ZONE, ADD "totp_last_step" integer, ADD "totp_recovery_codes" text`,
    );
    await queryRunner.query(
      `CREATE TABLE "admin_password_resets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "token_hash" character varying NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "ip" character varying, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "admin_id" uuid NOT NULL, CONSTRAINT "UQ_admin_password_resets_token_hash" UNIQUE ("token_hash"), CONSTRAINT "PK_admin_password_resets_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_admin_password_resets_admin" ON "admin_password_resets" ("admin_id", "created_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "admin_password_resets" ADD CONSTRAINT "FK_admin_password_resets_admin_id" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "admin_password_resets" DROP CONSTRAINT "FK_admin_password_resets_admin_id"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_admin_password_resets_admin"`);
    await queryRunner.query(`DROP TABLE "admin_password_resets"`);
    await queryRunner.query(
      `ALTER TABLE "admin_users" DROP COLUMN "totp_recovery_codes", DROP COLUMN "totp_last_step", DROP COLUMN "totp_enabled_at", DROP COLUMN "totp_pending_secret", DROP COLUMN "totp_secret"`,
    );
  }
}
