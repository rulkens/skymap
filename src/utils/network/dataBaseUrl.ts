/**
 * Base URL for static data assets. In dev, `VITE_DATA_BASE_URL` is empty —
 * Vite serves `public/data/*` at `/data/<file>`. In production, the env var
 * points at the R2 bucket's custom domain. Trailing slash stripped so
 * callers can unconditionally join with `/data/...`.
 */
export function dataBaseUrl(): string {
  return (import.meta.env.VITE_DATA_BASE_URL ?? '').replace(/\/$/, '');
}
