import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category, Question } from '../catalog/catalog.entities';
import { Round } from '../rounds/round.entity';
import { AssessmentModule } from '../assessment/assessment.module';
import { RoundsModule } from '../rounds/rounds.module';
import { UsersModule } from '../users/users.module';
import { PracticeController } from './practice.controller';
import { PracticeSession } from './practice-session.entity';
import { PracticeService } from './practice.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PracticeSession, Round, Category, Question]),
    RoundsModule,
    UsersModule,
    AssessmentModule,
  ],
  controllers: [PracticeController],
  providers: [PracticeService],
})
export class PracticeModule {}
