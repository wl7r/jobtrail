import { AxiosError } from 'axios';
import { api } from './client';

afterEach(() => vi.unstubAllGlobals());

it('reports expired sign-in when an API network failure is an authentication redirect', async () => {
  const fetch = vi.fn().mockResolvedValue({ type: 'opaqueredirect' });
  vi.stubGlobal('fetch', fetch);
  await expect(api.post('/discover/search', {}, {
    baseURL: '/api',
    adapter: async (config) => { throw new AxiosError('Network Error', 'ERR_NETWORK', config); },
  })).rejects.toThrow('Your sign-in has expired. Sign in again to continue.');
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/settings/search-presets'),
    { redirect: 'manual', credentials: 'same-origin' });
});

it('preserves genuine network failures and never retries the failed write', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  const adapter = vi.fn(async (config) => { throw new AxiosError('Network Error', 'ERR_NETWORK', config); });
  await expect(api.post('/discover/import', {}, { baseURL: '/api', adapter })).rejects.toThrow('Network Error');
  expect(adapter).toHaveBeenCalledTimes(1);
});
