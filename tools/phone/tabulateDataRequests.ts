import type { DataRequest } from './@types/DataRequest';
import type { DataRequestRow } from './@types/DataRequestRow';

/**
 * Group the requests under a `/data/` path by directory and outcome, in
 * first-seen order. The origin stays in `dir` on purpose: data fetched from
 * the R2 host instead of the page's own origin is the usual phone failure.
 * An HTML answer is flagged: Vite serves index.html, status 200, for a
 * data file it does not have.
 */
export function tabulateDataRequests(requests: Iterable<DataRequest>): DataRequestRow[] {
  const rows = new Map<string, { dir: string; outcome: string; count: number; bytes: number }>();
  for (const r of requests) {
    const path = r.url.split(/[?#]/)[0] ?? r.url;
    if (!path.includes('/data/')) continue;
    const dir = path.slice(0, path.lastIndexOf('/') + 1);
    const html = r.mimeType === 'text/html' ? ' text/html' : '';
    const outcome =
      r.failed !== undefined
        ? `FAILED ${r.failed}`
        : r.status !== undefined
          ? `${r.status}${html}`
          : 'pending';
    const key = `${dir} ${outcome}`;
    const row = rows.get(key) ?? { dir, outcome, count: 0, bytes: 0 };
    row.count++;
    row.bytes += r.bytes ?? 0;
    rows.set(key, row);
  }
  return [...rows.values()];
}
