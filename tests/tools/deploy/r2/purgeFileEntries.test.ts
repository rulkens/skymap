/**
 * Cloudflare caches a CORS response once per `Origin`, and a bare-URL purge
 * evicts only the Origin-less copy — the page's own copy survives. Every
 * allowed origin must get its own entry, or a sync leaves the page stale.
 */
import { describe, expect, it } from 'vitest';
import { purgeFileEntries } from '../../../../tools/deploy/r2/purgeFileEntries';
import r2Cors from '../../../../tools/deploy/r2Cors.json';

const ALLOWED = r2Cors.rules.flatMap((rule) => rule.allowed.origins);

describe('purgeFileEntries', () => {
  it('emits the bare URL plus one Origin-headed entry per exact CORS origin', () => {
    const url = 'https://cdn.example/data/manifest.json';
    const entries = purgeFileEntries([url]);
    const origins = ALLOWED.filter((origin) => !origin.includes('*'));

    expect(entries).toContain(url);
    for (const origin of origins) {
      expect(entries).toContainEqual({ url, headers: { Origin: origin } });
    }
    expect(entries).toHaveLength(1 + origins.length);
  });

  // A pattern is no browser's Origin header, so a purge naming it evicts nothing;
  // a preview's cached copy ages out on its TTL instead.
  it('sends no purge entry for a wildcard origin pattern', () => {
    const patterns = ALLOWED.filter((origin) => origin.includes('*'));
    expect(patterns).not.toHaveLength(0);
    const headers = purgeFileEntries(['https://cdn.example/x']).flatMap((entry) =>
      typeof entry === 'string' ? [] : [entry.headers.Origin],
    );
    for (const pattern of patterns) expect(headers).not.toContain(pattern);
  });
});
