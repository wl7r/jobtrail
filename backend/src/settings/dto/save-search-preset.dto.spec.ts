import { ValidationPipe } from '@nestjs/common';
import { SaveSearchPresetDto } from './save-search-preset.dto';

const pipe = new ValidationPipe({ whitelist: true, transform: true });
const request = {
  name: '  Engineering  ', sites: ['linkedin', 'jobadlinks'], searchTerm: 'manager',
  location: '', country: 'sweden', hoursOld: null, isRemote: false, jobType: null,
  includeKeywords: '', excludeKeywords: '',
};
const validate = (body: unknown) => pipe.transform(body, { type: 'body', metatype: SaveSearchPresetDto });

it('normalizes a name and accepts cleared optional filters at the request boundary', async () => {
  expect(await validate(request)).toEqual({ ...request, name: 'Engineering' });
});

it.each([
  { name: '   ' }, { country: 'usa' }, { sites: ['manual'] },
  { sites: ['linkedin', 'linkedin'] }, { sites: [] }, { hoursOld: 0 },
  { hoursOld: '720' }, { hoursOld: 2147483648 }, { isRemote: 'false' }, { jobType: 'unknown' },
])('rejects invalid saved search criteria: %p', async (invalid) => {
  await expect(validate({ ...request, ...invalid })).rejects.toMatchObject({ status: 400 });
});
