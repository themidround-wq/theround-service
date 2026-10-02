import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BroadcastsModule } from '../broadcasts/broadcasts.module';
import { Category, Question, Topic } from '../catalog/catalog.entities';
import { Round } from '../rounds/round.entity';
import { RoundsModule } from '../rounds/rounds.module';
import { User } from '../users/user.entity';
import { UsersModule } from '../users/users.module';
import { WaitlistEntry } from '../waitlist/waitlist.entity';
import { AdminAuthService } from './admin-auth.service';
import {
  AdminAuthController,
  AdminController,
  AdminSettingsController,
} from './admin.controllers';
import { AdminAuditLog, AdminSession, AdminUser } from './admin.entities';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { AdminBroadcastsController } from './broadcasts.controller';
import { AuditService } from './audit.service';

/** Everything under /api/admin: the founder dashboard's backend. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AdminUser,
      AdminSession,
      AdminAuditLog,
      WaitlistEntry,
      User,
      Round,
      Category,
      Topic,
      Question,
    ]),
    RoundsModule,
    UsersModule,
    BroadcastsModule,
  ],
  controllers: [
    AdminAuthController,
    AdminController,
    AdminSettingsController,
    AdminBroadcastsController,
  ],
  providers: [AdminAuthService, AdminService, AuditService, AdminGuard],
})
export class AdminModule {}
