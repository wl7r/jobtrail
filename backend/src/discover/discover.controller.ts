import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { DiscoverService } from './discover.service';
import { DiscoverImportDto, DiscoverSearchDto } from './dto/discover.dto';
import { PresetSearchService, SEARCH_TIMEZONE } from './preset-search.service';

@Controller('discover')
export class DiscoverController {
  constructor(private readonly discover: DiscoverService, private readonly presets: PresetSearchService) {}

  @Get('automation')
  automation() { return { hours: [8, 17], timezone: SEARCH_TIMEZONE, notifications: false }; }

  @Post('presets/:id/check')
  @HttpCode(202)
  check(@Param('id') id: string) { return this.presets.start(id); }

  @Get('presets/:id/results')
  results(@Param('id') id: string) { return this.presets.results(id); }

  @Post('search')
  search(@Body() dto: DiscoverSearchDto) {
    return this.discover.search(dto);
  }

  @Post('import')
  import(@Body() dto: DiscoverImportDto) {
    return this.discover.import(dto);
  }
}
