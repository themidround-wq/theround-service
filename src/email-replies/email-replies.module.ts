import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Broadcast, BroadcastRecipient } from '../broadcasts/broadcast.entities';
import { EmailModule } from '../email/email.module';
import { User } from '../users/user.entity';
import { EmailReply, EmailReplyMessage } from './email-reply.entity';
import { EmailRepliesService } from './email-replies.service';
import { EmailWebhooksController } from './webhooks.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmailReply,
      EmailReplyMessage,
      Broadcast,
      BroadcastRecipient,
      User,
    ]),
    EmailModule,
  ],
  controllers: [EmailWebhooksController],
  providers: [EmailRepliesService],
  exports: [EmailRepliesService],
})
export class EmailRepliesModule {}
