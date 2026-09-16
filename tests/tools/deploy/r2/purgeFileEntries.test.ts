/**
 * Cloudflare caches a CORS response once per `Origin`, and a bare-URL purge
 * evicts only the Origin-less copy — the page's own copy survives. Every
 * allowed origin must get its own entry, or a sync leaves the page stale.
 */
import { describe, expect, it } from 'vitest';
import { purgeFileEntries } from '../../../../tools/deploy/r2/purgeFileEntries';
import r2Cors from '../../../../tools/deploy/r2Cors.json';

describe('purgeFileEntries', () => {
  it('emits the bare URL plus one Origin-headed entry per CORS origin', () => {
    const url = 'https://cdn.example/data/manifest.json';
    const entries = purgeFileEntries([url]);
    const origins = r2Cors.rules.flatMap((rule) => rule.allowed.origins);

    expect(entries).toContain(url);
    for (const origin of origins) {
      expect(entries).toContainEqual({ url, headers: { Origin: origin } });
    }
    expect(entries).toHaveLength(1 + origins.length);
  });
});
