import 'dotenv/config';
import { DataSource } from 'typeorm';

/** TypeORM CLI data source (Postgres only) — used to generate/run migrations. */
export default new DataSource({
  type: 'postgres',
  url: process.env.DB_URL,
  entities: [
    __dirname + '/**/*.entity{.ts,.js}',
    __dirname + '/catalog/catalog.entities{.ts,.js}',
    __dirname + '/admin/admin.entities{.ts,.js}',
    __dirname + '/settings/settings{.ts,.js}',
    __dirname + '/broadcasts/broadcast.entities{.ts,.js}',
  ],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
});
