import { MigrationInterface, QueryRunner } from 'typeorm';

/** Optional TOTP two-factor for app users (same shape as admins'). */
export class UserTwoFactor1791300000000 implements MigrationInterface {
  name = 'UserTwoFactor1791300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "totpSecret" character varying, ADD "totpPendingSecret" character varying, ADD "totpEnabledAt" TIMESTAMP, ADD "totpLastStep" integer, ADD "totpRecoveryCodes" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "totpRecoveryCodes", DROP COLUMN "totpLastStep", DROP COLUMN "totpEnabledAt", DROP COLUMN "totpPendingSecret", DROP COLUMN "totpSecret"`,
    );
  }
}
