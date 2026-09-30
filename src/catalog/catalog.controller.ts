import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CatalogResponse } from '../common/api.response';
import { AuthGuard } from '../auth/auth.guard';
import { CatalogService } from './catalog.service';

@ApiTags('Practice')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Missing or invalid bearer token',
  schema: { example: { statusCode: 401, message: 'Unauthorized' } },
})
@Controller('catalog')
@UseGuards(AuthGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @ApiOperation({ summary: 'Wheel categories and topic count' })
  @ApiOkResponse({ type: CatalogResponse })
  @Get()
  overview() {
    return this.catalog.overview();
  }
}
