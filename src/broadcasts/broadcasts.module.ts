import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Round } from '../rounds/round.entity';
import { User } from '../users/user.entity';
import { WaitlistEntry } from '../waitlist/waitlist.entity';
import {
  Broadcast,
  BroadcastRecipient,
  EmailUnsubscribe,
} from './broadcast.entities';
import { BroadcastsService } from './broadcasts.service';
import { UnsubscribeController } from './unsubscribe.controller';

/**
 * Newsletters, product updates and service notices. The admin endpoints
 * live in AdminModule (they share its guard); this module owns sending and
 * the public unsubscribe link.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Broadcast,
      BroadcastRecipient,
      EmailUnsubscribe,
      User,
      WaitlistEntry,
      Round,
    ]),
  ],
  controllers: [UnsubscribeController],
  providers: [BroadcastsService],
  exports: [BroadcastsService],
})
export class BroadcastsModule {}
