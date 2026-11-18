import { Module } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { AssessmentService } from './assessment.service';
import { MarkingService } from './marking.service';
import { TranscriptionService } from './transcription.service';

@Module({
  providers: [
    AssessmentService,
    TranscriptionService,
    MarkingService,
    StorageService,
  ],
  exports: [AssessmentService],
})
export class AssessmentModule {}
