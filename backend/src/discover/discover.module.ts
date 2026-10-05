import { Module } from '@nestjs/common';
import { DiscoverService } from './discover.service';
import { DiscoverController } from './discover.controller';
import { JobsModule } from '../jobs/jobs.module';
import { CompaniesModule } from '../companies/companies.module';
import { PresetSearchService } from './preset-search.service';

@Module({
  // CompaniesModule is imported so DiscoverService can resolve and link the Company on each
  // import. JobsModule already imports CompaniesModule for linkCompany — same dependency edge.
  imports: [JobsModule, CompaniesModule],
  controllers: [DiscoverController],
  providers: [DiscoverService, PresetSearchService],
})
export class DiscoverModule {}
