import { MigrationInterface, QueryRunner } from 'typeorm';

/** Add custom_emails column to broadcasts for individual / targeted recipient sending. */
export class AddCustomEmailsToBroadcasts1791400000000
  implements MigrationInterface
{
  name = 'AddCustomEmailsToBroadcasts1791400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "broadcasts" ADD "custom_emails" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "broadcasts" DROP COLUMN "custom_emails"`,
    );
  }
}
