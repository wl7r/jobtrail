import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { JobSource, Prisma, SearchPreset } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DiscoverService } from './discover.service';
import { DiscoverSite } from './dto/discover.dto';

const PAGE_SIZE = 100;
const MAX_PAGES = 5;
const LEASE_MS = 15 * 60_000;
export const SEARCH_TIMEZONE = process.env.TZ ?? 'UTC';

@Injectable()
export class PresetSearchService {
  private readonly logger = new Logger(PresetSearchService.name);
  private scheduledCheckRunning = false;

  constructor(private readonly prisma: PrismaService, private readonly discover: DiscoverService) {}

  async results(id: string) {
    const preset = await this.prisma.searchPreset.findUnique({ where: { id } });
    if (!preset) throw new NotFoundException('Search preset not found');
    const hits = await this.prisma.searchPresetHit.findMany({ where: { presetId: id }, orderBy: { firstSeenAt: 'desc' } });
    return { preset, results: hits.map((hit) => ({ ...(hit.result as Prisma.JsonObject), first_seen_at: hit.firstSeenAt })),
      timezone: SEARCH_TIMEZONE };
  }

  async start(id: string) {
    const preset = await this.claim(id);
    if (preset) void this.collect(preset);
    return { started: Boolean(preset) };
  }

  @Cron('0 0 8,17 * * *', { name: 'discovery-presets', timeZone: SEARCH_TIMEZONE })
  async checkScheduled() {
    if (this.scheduledCheckRunning) return;
    this.scheduledCheckRunning = true;
    try {
      const presets = await this.prisma.searchPreset.findMany({ where: { automatic: true }, orderBy: { createdAt: 'asc' } });
      for (const { id } of presets) {
        const preset = await this.claim(id);
        if (preset) await this.collect(preset);
      }
    } catch {
      this.logger.error('Scheduled discovery could not start; check database connectivity.');
    } finally { this.scheduledCheckRunning = false; }
  }

  private async claim(id: string): Promise<SearchPreset | null> {
    const preset = await this.prisma.searchPreset.findUnique({ where: { id } });
    if (!preset) throw new NotFoundException('Search preset not found');
    const now = new Date();
    const claimed = await this.prisma.searchPreset.updateMany({
      where: { id, OR: [{ runningUntil: null }, { runningUntil: { lte: now } }] },
      data: { runningUntil: new Date(now.getTime() + LEASE_MS) },
    });
    return claimed.count ? preset : null;
  }

  private async collect(preset: SearchPreset) {
    const errors = new Map<string, string>();
    let added = 0;
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const response = await this.discover.search({
          sites: preset.sites as DiscoverSite[], searchTerm: preset.searchTerm, location: preset.location,
          country: preset.country as 'sweden' | 'denmark', hoursOld: preset.hoursOld ?? undefined,
          isRemote: preset.isRemote, jobType: preset.jobType ?? undefined,
          includeKeywords: preset.includeKeywords, excludeKeywords: preset.excludeKeywords,
          resultsWanted: PAGE_SIZE, offset: page * PAGE_SIZE,
        });
        for (const error of response.errors) errors.set(error.site, error.message);
        for (const result of response.results) {
          if (!result.id || !result.title || !result.company || !result.job_url) continue;
          const inserted = await this.prisma.searchPresetHit.createMany({ data: [{
            presetId: preset.id, source: result.site as JobSource, sourceJobId: result.id,
            result: result as unknown as Prisma.InputJsonObject,
          }], skipDuplicates: true });
          added += inserted.count;
        }
        if (!response.has_more) break;
        if (page === MAX_PAGES - 1) errors.set('discovery', 'Collection stopped at 500 adverts per source; narrow this preset or use manual pagination.');
      }
    } catch {
      errors.set('discovery', 'Search could not finish; retained matches remain available.');
    } finally {
      try {
        await this.prisma.searchPreset.update({ where: { id: preset.id }, data: {
          runningUntil: null, lastCheckedAt: new Date(), lastNewCount: added,
          lastErrors: [...errors].map(([site, message]) => ({ site, message })),
        } });
      } catch { this.logger.error('Could not record discovery completion; the stored search lease expires automatically.'); }
    }
  }
}
