import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersService],
  // TypeOrmModule re-exported so auth can update 2FA columns directly.
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}
