import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { Discover } from './Discover';
import { api } from '../api/client';
vi.mock('../api/client', () => ({ api: { post: vi.fn() } }));

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
