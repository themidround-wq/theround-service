import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserPictureUrl1790810022446 implements MigrationInterface {
  name = 'AddUserPictureUrl1790810022446';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "pictureUrl" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "pictureUrl"`);
  }
}
