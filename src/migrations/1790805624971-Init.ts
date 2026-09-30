import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1790805624971 implements MigrationInterface {
  name = 'Init1790805624971';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "sortOrder" integer NOT NULL, CONSTRAINT "UQ_8b0be371d28245da6e4f4b61878" UNIQUE ("name"), CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "topics" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "categoryId" uuid, CONSTRAINT "PK_e4aa99a3fa60ec3a37d1fc4e853" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "questions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "text" character varying NOT NULL, "topicId" uuid, CONSTRAINT "PK_08a6d4b0f49ff300bf3a0ca60ac" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "googleId" character varying NOT NULL, "email" character varying NOT NULL, "name" character varying, "stage" character varying, "course" character varying, "year" character varying, "semester" character varying, "avatarId" integer, "goal" character varying, "defaultResponseSeconds" integer NOT NULL DEFAULT '90', "soundCues" boolean NOT NULL DEFAULT true, "onboarded" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_f382af58ab36057334fb262efd5" UNIQUE ("googleId"), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "rounds" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" character varying NOT NULL DEFAULT 'spun', "durationSeconds" integer NOT NULL, "spokenSeconds" integer, "audioKey" character varying, "audioMime" character varying, "reflection" character varying, "note" text, "bookmarked" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "startedAt" TIMESTAMP, "completedAt" TIMESTAMP, "savedAt" TIMESTAMP, "userId" uuid NOT NULL, "categoryId" uuid NOT NULL, "topicId" uuid NOT NULL, "questionId" uuid NOT NULL, CONSTRAINT "PK_9d254884a20817016e2f877c7e7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4dcad872090ba65ac77e0d00dc" ON "rounds"  ("userId", "status", "savedAt") `,
    );
    await queryRunner.query(
      `ALTER TABLE "topics" ADD CONSTRAINT "FK_16f1ec6cefd3228a85829c336d3" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "questions" ADD CONSTRAINT "FK_e5d76861587b8a6472ec7a26c74" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "rounds" ADD CONSTRAINT "FK_3a215664337ba61147fb832cec1" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "rounds" ADD CONSTRAINT "FK_ffd1f528b1513fa6c1be14d6cb7" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "rounds" ADD CONSTRAINT "FK_3836d7cb787902047cac950c9bf" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "rounds" ADD CONSTRAINT "FK_880cb744f620387c8f900926860" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "rounds" DROP CONSTRAINT "FK_880cb744f620387c8f900926860"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rounds" DROP CONSTRAINT "FK_3836d7cb787902047cac950c9bf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rounds" DROP CONSTRAINT "FK_ffd1f528b1513fa6c1be14d6cb7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rounds" DROP CONSTRAINT "FK_3a215664337ba61147fb832cec1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "questions" DROP CONSTRAINT "FK_e5d76861587b8a6472ec7a26c74"`,
    );
    await queryRunner.query(
      `ALTER TABLE "topics" DROP CONSTRAINT "FK_16f1ec6cefd3228a85829c336d3"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4dcad872090ba65ac77e0d00dc"`,
    );
    await queryRunner.query(`DROP TABLE "rounds"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TABLE "questions"`);
    await queryRunner.query(`DROP TABLE "topics"`);
    await queryRunner.query(`DROP TABLE "categories"`);
  }
}
