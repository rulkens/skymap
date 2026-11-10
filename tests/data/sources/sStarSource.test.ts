/**
 * The S-star registry row: a seeded star catalog that draws but never captions.
 *
 * What can actually break here is not the row's field values (a compiler-checked
 * literal) but its CONSEQUENCES in the derived key domains — the settings row it
 * seeds, the cluster it seeds it in, and the label domain it must stay out of. Each of those is a separate file that reads
 * the registry and would fail silently, not loudly.
 */

import { describe, it, expect } from 'vitest';
import { Source } from '../../../src/data/source';
import { APP_SOURCE_REGISTRY } from '../../../src/compositions/appSources';
import { S_STAR_ENTRY } from '../../../src/layers/starCatalog/sources/s-star';
import { SUN_ENTRY } from '../../../src/layers/starCatalog/sources/sun';
import { BODY_SOURCE_IDS } from '../../../src/data/bodies/bodySourceIds';
import { STAR_CATALOG_IDS } from '../../../src/data/starCatalog/starCatalogIds';
import { INITIAL_SETTINGS } from '../../../src/state/settings/initialSettings';

describe('the S-star source row', () => {
  it('seeds a STAR-catalog settings row', () => {
    // The star show entry gates all 39 on `starCatalogs.items.sStar.enabled`. The row
    // is derived, not authored, so the failure mode is an ABSENT key — an
    // undefined read that throws on the first frame rather than the row missing.
    expect(STAR_CATALOG_IDS).toContain(S_STAR_ENTRY.id);
    expect(INITIAL_SETTINGS.starCatalogs.items[S_STAR_ENTRY.id]).toBeDefined();
  });

  it('the Sun joins it in the star cluster, and neither is a body any more', () => {
    // Both moved clusters at once: a half-migration would leave one of them
    // gated by a `bodies.items` row nothing writes.
    expect(STAR_CATALOG_IDS).toContain(SUN_ENTRY.id);
    expect(BODY_SOURCE_IDS).not.toContain(S_STAR_ENTRY.id);
    expect(BODY_SOURCE_IDS).not.toContain(SUN_ENTRY.id);
  });

  it('the registry is keyed by each entry’s id, and the S-star row is in it', () => {
    // A `Source` member that drifts from its entry's id would key the row under a
    // name no asset, setting or ref uses.
    for (const [key, entry] of Object.entries(APP_SOURCE_REGISTRY)) expect(key).toBe(entry.id);
    expect(APP_SOURCE_REGISTRY[Source.SStar]).toBe(S_STAR_ENTRY);
  });
});
