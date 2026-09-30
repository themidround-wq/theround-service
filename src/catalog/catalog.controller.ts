import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CatalogService } from './catalog.service';

@Controller('catalog')
@UseGuards(AuthGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  /** Wheel segments + "24 reviewed topics" counter. */
  @Get()
  overview() {
    return this.catalog.overview();
  }
}
