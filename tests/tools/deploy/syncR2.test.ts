/**
 * Contract tests for the syncR2 ALLOW filter.
 *
 * `ALLOW` is the predicate `main()` applies to `readdirSync('public/data')`
 * to decide which files get uploaded to R2.  The runtime fetch surface is
 * the spec: every name the browser's cloudLoader requests must pass, and
 * the legacy un-tiered build artefacts must stay excluded.  The upload
 * loop itself shells out to wrangler, so this predicate is the testable
 * seam — given a correct ALLOW set the sweep is mechanical.
 *
 * Importing the module only pulls in the exported `ALLOW`; the top-level
 * `main().catch(...)` is guarded behind an `import.meta.url` CLI check, so
 * importing here does not fire the network/filesystem sync.
 */
import { describe, expect, it } from 'vitest';
import { ALLOW } from '../../../tools/deploy/syncR2';

describe('syncR2 ALLOW', () => {
  it('accepts clusters.ccat and clusters_meta.json', () => {
    expect(ALLOW('clusters.ccat')).toBe(true);
    expect(ALLOW('clusters_meta.json')).toBe(true);
  });

  it('still rejects glade.bin / sdss.bin', () => {
    // The un-tiered legacy bins are offline DisPerSE inputs, never fetched
    // from the browser — they must stay out of the R2 sync.
    expect(ALLOW('glade.bin')).toBe(false);
    expect(ALLOW('sdss.bin')).toBe(false);
  });
});
