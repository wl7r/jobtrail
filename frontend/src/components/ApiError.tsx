import { SignInRequiredError } from '../api/client';

export function ApiError({ error, fallback }: { error: unknown; fallback: string }) {
  return <div role="status" className="text-sm text-red-400">
    {error instanceof SignInRequiredError ? <>
      {error.message}{' '}
      <button className="btn" onClick={() => window.location.reload()}>Sign in again</button>
    </> : fallback}
  </div>;
}
