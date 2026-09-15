/**
 * REFERENCE_GALAXIES — verbatim port of the spike's REFS gallery
 * (`Galaxy Renderer.dc.html:389-438`). The on-disk image check pins the
 * curated-image mapping (notably `ngc6946` → `c12`, `ell` → `m49`) against
 * a future famous-galaxy re-curation that renames or removes a directory
 * without updating this table.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { REFERENCE_GALAXIES } from '../../../../tools/galaxy-renderer/src/data/referenceGalaxies';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const PUBLIC_DIR = join(REPO_ROOT, 'public');

describe('REFERENCE_GALAXIES', () => {
  it('every non-null img points under /images/famous-curated/ and exists on disk', () => {
    for (const galaxy of REFERENCE_GALAXIES) {
      if (galaxy.img === null) continue;
      expect(galaxy.img.startsWith('/images/famous-curated/'), `${galaxy.id}.img`).toBe(true);
      const onDisk = join(PUBLIC_DIR, galaxy.img);
      expect(existsSync(onDisk), `${galaxy.id}: ${onDisk}`).toBe(true);
    }
  });

  it('viewLabel is non-empty for all eight (the field the spike silently destroyed)', () => {
    for (const galaxy of REFERENCE_GALAXIES) {
      expect(galaxy.viewLabel.length, galaxy.id).toBeGreaterThan(0);
    }
  });
});
