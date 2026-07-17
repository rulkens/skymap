/**
 * RESOLVE_PICK — the star arm. resolvePick.test.ts covers galaxy / structure /
 * milkyWay / non-pickable dispatch; this mirror pins the newly-added
 * `starCatalog` arm end-to-end: a Gaia-star pick must route through
 * SOURCE_REGISTRY[GaiaStars].type === 'starCatalog' to a positional star ref.
 * That wiring (registry type ↔ table key) is exactly what a real bug could
 * break, and no other test exercises it.
 */

import { describe, it, expect } from 'vitest';

import { resolvePick } from '../../../../src/services/engine/helpers/resolvePick';
import { Source } from '../../../../src/data/sources';
import type { ResolvePickDeps } from '../../../../src/@types/engine/ResolvePickDeps';

/** The star arm reads no store data, so a stub structure store suffices. */
const deps: ResolvePickDeps = { structures: { byCategory: () => [] } };

describe('RESOLVE_PICK starCatalog arm', () => {
  it('maps a Gaia-star pick to a positional star ref', () => {
    expect(resolvePick({ sourceCode: Source.GaiaStars, localIdx: 42 }, deps)).toEqual({
      type: 'star',
      index: 42,
    });
  });
});
