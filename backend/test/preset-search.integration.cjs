// Requires a disposable PostgreSQL database with the application's migrations.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Test } = require('@nestjs/testing');
const { ScheduleModule, SchedulerRegistry } = require('@nestjs/schedule');
const { PrismaModule } = require('../dist/prisma/prisma.module');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { SettingsService } = require('../dist/settings/settings.service');
const { DiscoverService } = require('../dist/discover/discover.service');
const { PresetSearchService } = require('../dist/discover/preset-search.service');

if (!process.env.DATABASE_URL?.includes('jobtrail_test')) throw new Error('Use a disposable jobtrail_test database.');
let app, runner, settings, server, fixture, pending = [], blocked = false;
const row = (id, title = 'Engineering Director') => ({
  site: 'arbetsformedlingen', id, title, company: 'Example Company', location: 'Göteborg, Sweden',
  job_url: `https://example.org/jobs/${id}`, description: 'Mentor trainee engineers', is_remote: false,
  min_amount: null, max_amount: null, currency: null, date_posted: null, job_type: 'fulltime',
});
const criteria = { name: 'Engineering', sites: ['arbetsformedlingen', 'linkedin'],
  searchTerm: 'engineering director; head of engineering', location: 'Göteborg; Mölndal', country: 'sweden',
  hoursOld: 720, isRemote: false, jobType: null, includeKeywords: 'engineering director',
  excludeKeywords: 'assistant, trainee', automatic: false };
async function untilFinished(id) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await runner.results(id);
    if (!result.preset.runningUntil) return result;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Saved search did not finish');
}
function respond(res) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(fixture)); }
before(async () => {
  fixture = { results: [row('one'), row('assistant', 'Assistant to Engineering Director')], errors: [], cached: false, has_more: false };
  server = http.createServer((req, res) => { req.resume(); if (blocked) pending.push(res); else respond(res); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.JOBSPY_URL = `http://127.0.0.1:${server.address().port}`;
  const module = await Test.createTestingModule({ imports: [ScheduleModule.forRoot(), PrismaModule],
    providers: [SettingsService, PresetSearchService,
      { provide: DiscoverService, useValue: new DiscoverService({}, {}) }],
  }).compile();
  app = module.createNestApplication();
  await app.init();
  await app.get(PrismaService).searchPreset.deleteMany();
  runner = app.get(PresetSearchService); settings = app.get(SettingsService);
});
after(async () => { if (app) await app.close(); if (server) await new Promise((resolve) => server.close(resolve)); });

test('checks retain matching candidates without duplicates, survive runner recreation, and preserve source failures', async () => {
  const preset = await settings.saveSearchPreset(criteria);
  assert.deepEqual(await runner.start(preset.id), { started: true });
  let result = await untilFinished(preset.id);
  assert.deepEqual(result.results.map((r) => r.id), ['one']);
  assert.equal(result.preset.lastNewCount, 1);
  await runner.start(preset.id); result = await untilFinished(preset.id);
  assert.equal(result.preset.lastNewCount, 0);
  const restarted = new PresetSearchService(app.get(PrismaService), new DiscoverService({}, {}));
  assert.equal((await restarted.results(preset.id)).results.length, 1);
  fixture = { ...fixture, results: [row('one'), row('two')], errors: [{ site: 'linkedin', message: 'Source blocked' }] };
  await runner.start(preset.id); result = await untilFinished(preset.id);
  assert.equal(result.results.length, 2);
  assert.equal(result.preset.lastNewCount, 1);
  assert.deepEqual(result.preset.lastErrors, [{ site: 'linkedin', message: 'Source blocked' }]);
});

test('overlapping checks are refused and pagination caps are visible', async () => {
  const preset = await settings.saveSearchPreset({ ...criteria, name: 'Overlap' });
  blocked = true;
  assert.equal((await runner.start(preset.id)).started, true);
  assert.equal((await runner.start(preset.id)).started, false);
  fixture = { ...fixture, has_more: true };
  blocked = false;
  while (!pending.length) await new Promise((resolve) => setTimeout(resolve, 10));
  pending.splice(0).forEach(respond);
  const result = await untilFinished(preset.id);
  assert.equal(result.results.length, 2);
  assert.match(result.preset.lastErrors.find((error) => error.site === 'discovery').message, /500 adverts/);
});

test('only opted-in presets run automatically and the native scheduler selects two local daily times', async () => {
  fixture = { ...fixture, has_more: false };
  const enabled = await settings.saveSearchPreset({ ...criteria, name: 'Automatic', automatic: true });
  const disabled = await settings.saveSearchPreset({ ...criteria, name: 'Manual', automatic: false });
  await runner.checkScheduled();
  assert.equal((await runner.results(enabled.id)).results.length, 2);
  assert.equal((await runner.results(disabled.id)).results.length, 0);
  const job = app.get(SchedulerRegistry).getCronJob('discovery-presets');
  const next = job.nextDates(4).map((date) => date.toFormat('HH:mm'));
  assert.ok(next.every((time) => ['08:00', '17:00'].includes(time)));
  assert.equal(new Set(next).size, 2);
});
