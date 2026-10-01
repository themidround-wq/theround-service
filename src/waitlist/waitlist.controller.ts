import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { WaitlistResponse } from '../common/api.response';
import { JoinWaitlistDto } from './dto';
import { WaitlistService } from './waitlist.service';

@ApiTags('Waitlist')
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @ApiOperation({
    summary: 'Join the waitlist',
    description:
      'Public, used by the landing page. Re-joining with the same email returns the existing ticket with isNew=false.',
  })
  @ApiOkResponse({ type: WaitlistResponse })
  @ApiBadRequestResponse({
    description: 'Invalid email',
    schema: {
      example: {
        statusCode: 400,
        message: ['email must be an email'],
        error: 'Bad Request',
      },
    },
  })
  @Post()
  @HttpCode(200)
  join(@Body() dto: JoinWaitlistDto) {
    return this.waitlist.join(dto.email);
  }
}
