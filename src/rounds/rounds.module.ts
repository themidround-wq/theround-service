import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { StorageService } from '../storage/storage.service';
import { UsersModule } from '../users/users.module';
import { MeController } from './me.controller';
import { Round } from './round.entity';
import { LocalAudioController, RoundsController } from './rounds.controller';
import { RoundsService } from './rounds.service';

@Module({
  imports: [TypeOrmModule.forFeature([Round]), CatalogModule, UsersModule],
  controllers: [RoundsController, LocalAudioController, MeController],
  providers: [RoundsService, StorageService],
})
export class RoundsModule {}
