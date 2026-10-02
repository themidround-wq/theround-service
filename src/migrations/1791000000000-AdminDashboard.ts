import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Admin dashboard: operator accounts, revocable sessions, audit log, runtime
 * settings, plus the columns admin actions write to (user suspension,
 * waitlist invites, hiding a category from the wheel).
 */
export class AdminDashboard1791000000000 implements MigrationInterface {
  name = 'AdminDashboard1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "admin_users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "name" character varying NOT NULL, "password_hash" character varying NOT NULL, "role" character varying NOT NULL DEFAULT 'admin', "active" boolean NOT NULL DEFAULT true, "last_login_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_admin_users_email" UNIQUE ("email"), CONSTRAINT "PK_admin_users_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "admin_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ip" character varying, "user_agent" character varying, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "last_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "admin_id" uuid NOT NULL, CONSTRAINT "PK_admin_sessions_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_admin_sessions_admin_revoked" ON "admin_sessions" ("admin_id", "revoked_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "admin_sessions" ADD CONSTRAINT "FK_admin_sessions_admin_id" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE TABLE "admin_audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "admin_id" character varying, "admin_email" character varying NOT NULL, "action" character varying NOT NULL, "target" character varying, "details" text, "ip" character varying, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_admin_audit_logs_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_admin_audit_logs_created_at" ON "admin_audit_logs" ("created_at")`,
    );
    await queryRunner.query(
      `CREATE TABLE "app_settings" ("key" character varying NOT NULL, "value" text NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_by" character varying, CONSTRAINT "PK_app_settings_key" PRIMARY KEY ("key"))`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "suspendedAt" TIMESTAMP`);
    await queryRunner.query(
      `ALTER TABLE "waitlist" ADD "invited_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" ADD "active" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "active"`);
    await queryRunner.query(`ALTER TABLE "waitlist" DROP COLUMN "invited_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "suspendedAt"`);
    await queryRunner.query(`DROP TABLE "app_settings"`);
    await queryRunner.query(`DROP INDEX "IDX_admin_audit_logs_created_at"`);
    await queryRunner.query(`DROP TABLE "admin_audit_logs"`);
    await queryRunner.query(
      `ALTER TABLE "admin_sessions" DROP CONSTRAINT "FK_admin_sessions_admin_id"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_admin_sessions_admin_revoked"`);
    await queryRunner.query(`DROP TABLE "admin_sessions"`);
    await queryRunner.query(`DROP TABLE "admin_users"`);
  }
}
