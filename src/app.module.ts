import { Module } from '@nestjs/common';
import { join } from 'path';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { EmailModule } from './email/email.module';
import { RoundsModule } from './rounds/rounds.module';
import { UsersModule } from './users/users.module';
import { WaitlistModule } from './waitlist/waitlist.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        if (config.get('DB_TYPE') === 'postgres') {
          // Postgres (Neon): schema is managed by migrations, applied on boot.
          return {
            type: 'postgres' as const,
            url: config.get<string>('DB_URL'),
            autoLoadEntities: true,
            synchronize: false,
            migrations: [join(__dirname, 'migrations/*{.ts,.js}')],
            migrationsRun: true,
          };
        }
        return {
          autoLoadEntities: true,
          synchronize: true, // local SQLite only
          type: 'better-sqlite3' as const,
          database: config.get<string>('DB_PATH', 'data/theround.sqlite'),
        };
      },
    }),
    EmailModule,
    UsersModule,
    WaitlistModule,
    AuthModule,
    CatalogModule,
    RoundsModule,
  ],
})
export class AppModule {}
