import axios from 'axios';

export const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL ?? 'http://localhost:8000') + '/api',
});

export class SignInRequiredError extends Error {
  constructor() {
    super('Your sign-in has expired. Sign in again to continue.');
  }
}

api.interceptors.response.use(undefined, async (error: unknown) => {
  // Cross-origin sign-in redirects look like a network failure to XHR. Probe a
  // read-only API endpoint without following redirects; never replay a POST.
  if (axios.isAxiosError(error) && error.code === 'ERR_NETWORK') {
    const base = new URL(error.config?.baseURL ?? api.defaults.baseURL ?? '/api', window.location.href);
    if (base.origin === window.location.origin) {
      let redirected = false;
      try {
        const response = await fetch(`${base.href.replace(/\/$/, '')}/settings/search-presets`, {
          redirect: 'manual', credentials: 'same-origin',
        });
        redirected = response.type === 'opaqueredirect';
      } catch { /* Preserve the original error when the network itself is unavailable. */ }
      if (redirected) throw new SignInRequiredError();
    }
  }
  throw error;
});
