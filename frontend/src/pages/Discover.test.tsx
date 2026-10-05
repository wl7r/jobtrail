import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { Discover } from './Discover';
import { api } from '../api/client';
vi.mock('../api/client', () => ({ api: { post: vi.fn(), get: vi.fn() } }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.get).mockResolvedValue({ data: [] });
});

it('searches Denmark with both official sources, shows partial failures, and imports an advert', async () => {
  const result = { site: 'jobadlinks', id: 'af-1', title: 'Sales Manager', company: 'Acme',
    location: 'Copenhagen', job_url: 'https://example.org/jobs/1', description: 'Brief text' };
  vi.mocked(api.post).mockResolvedValueOnce({ data: { cached: false, count: 1, has_more: true,
    results: [result], errors: [{ site: 'linkedin', message: 'Source blocked' }] } }).mockResolvedValueOnce({ data: { cached: false, count: 0, has_more: false, results: [], errors: [] } }).mockResolvedValueOnce({ data: { id: 'saved-1' } });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}><Discover /></QueryClientProvider>);
  fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'denmark' } });
  fireEvent.click(screen.getByLabelText('Arbetsförmedlingen (Platsbanken)'));
  fireEvent.click(screen.getByLabelText('JobAd Links'));
  fireEvent.change(screen.getByLabelText('Search term'), { target: { value: 'sales manager' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(await screen.findByText('Sales Manager')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('linkedin: Source blocked');
  expect(screen.getByRole('link', { name: 'Sales Manager' })).toHaveAttribute('href', 'https://example.org/jobs/1');
  expect(screen.getByRole('button', { name: 'Load more (next 25)' })).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith('/discover/search', expect.objectContaining({ country: 'denmark', sites: ['arbetsformedlingen', 'jobadlinks'] }));
  fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'sweden' } });
  fireEvent.click(screen.getByRole('button', { name: 'Load more (next 25)' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/discover/search', expect.objectContaining({ country: 'denmark', offset: 25 })));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Load more (next 25)' })).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: '💾 Save to tracker' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '✅ Saved' })).toBeDisabled());
  expect(api.post).toHaveBeenLastCalledWith('/discover/import', expect.objectContaining({ source: 'jobadlinks', sourceJobId: 'af-1', jobUrl: 'https://example.org/jobs/1' }));
});


it('loads persisted criteria without searching, then searches only when requested', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: [{
    id: 'preset-1', name: 'Engineering', sites: ['linkedin', 'jobadlinks'],
    searchTerm: 'engineering manager', location: 'Aarhus', country: 'denmark',
    hoursOld: 168, isRemote: true, jobType: 'fulltime',
    includeKeywords: 'leadership', excludeKeywords: 'internship',
  }] });
  vi.mocked(api.post).mockResolvedValue({ data: { cached: false, has_more: false, results: [], errors: [] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><Discover /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole('button', { name: 'Engineering' }));
  expect(screen.getByLabelText('Country')).toHaveValue('denmark');
  expect(screen.getByLabelText('Search term')).toHaveValue('engineering manager');
  expect(screen.getByLabelText('Location')).toHaveValue('Aarhus');
  expect(screen.getByLabelText('Max age (hours)')).toHaveValue(168);
  expect(screen.getByLabelText('Job type')).toHaveValue('fulltime');
  expect(screen.getByLabelText('Remote only')).toBeChecked();
  expect(screen.getByLabelText(/Include keywords/)).toHaveValue('leadership');
  expect(screen.getByLabelText(/Exclude keywords/)).toHaveValue('internship');
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/discover/search', {
    sites: ['linkedin', 'jobadlinks'], searchTerm: 'engineering manager',
    country: 'denmark', location: 'Aarhus', hoursOld: 168, isRemote: true,
    jobType: 'fulltime', resultsWanted: 25, offset: 0,
  }));
  view.unmount();
  render(<QueryClientProvider client={new QueryClient()}><Discover /></QueryClientProvider>);
  expect(await screen.findByRole('button', { name: 'Engineering' })).toBeInTheDocument();
});

it('saves all current criteria under a trimmed name and reports a failed save', async () => {
  vi.mocked(api.post).mockRejectedValue(new Error('offline'));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}><Discover /></QueryClientProvider>);
  fireEvent.click(screen.getByLabelText('JobAd Links'));
  fireEvent.change(screen.getByLabelText('Search term'), { target: { value: 'developer' } });
  fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Göteborg' } });
  fireEvent.change(screen.getByLabelText('Max age (hours)'), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: '  Technology  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/settings/search-presets', {
    name: 'Technology', sites: ['jobadlinks'], searchTerm: 'developer',
    country: 'sweden', location: 'Göteborg', hoursOld: null, isRemote: false,
    jobType: null, includeKeywords: '', excludeKeywords: '',
  }));
  expect(await screen.findByRole('status')).toHaveTextContent('The preset could not be saved');
});
