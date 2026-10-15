/**
 * `visibleStars` gates three seeded catalogs on two bits each — the cluster
 * master and the source's own item. Worth a test because those are separate
 * reads a compiler cannot hold together: pointing one at the wrong row leaves
 * the function type-correct and either the descent's aim point gone or a muted
 * catalog still drawing.
 */
import { describe, it, expect } from 'vitest';
import { visibleStars } from '../../../../src/services/engine/frame/visibleStars';
import { makeSettingsFixture } from '../../../state/settings/makeSettingsFixture';
import { SEEDED_STAR_CATALOGS } from '../../../../src/data/bodies/seededStarCatalogs';
import type { SeededStarCatalogId } from '../../../../src/@types/data/starCatalog/SeededStarCatalogId';

const SEEDED_IDS: readonly SeededStarCatalogId[] = ['famousStar', 'sun', 'sStar'];

// One real id per catalog, because the gate is MEMBERSHIP of that table — a
// literal would pass even if the walk were built from something else.
const SAMPLE_ID: Readonly<Record<SeededStarCatalogId, string>> = {
  famousStar: SEEDED_STAR_CATALOGS.famousStar[0]!.id,
  sun: SEEDED_STAR_CATALOGS.sun[0]!.id,
  sStar: SEEDED_STAR_CATALOGS.sStar[0]!.id,
};

function settingsWith(masterOn: boolean, itemsOn: Partial<Record<SeededStarCatalogId, boolean>>) {
  const settings = makeSettingsFixture().starCatalogs;
  settings.enabled = masterOn;
  for (const id of SEEDED_IDS) settings.items[id].enabled = itemsOn[id] ?? false;
  return settings;
}

describe('visibleStars', () => {
  it('draws each seeded catalog iff the cluster master and its own item are on', () => {
    for (const id of SEEDED_IDS) {
      const drawn = visibleStars(settingsWith(true, { [id]: true })).map((s) => s.id);
      expect(drawn).toContain(SAMPLE_ID[id]);
      for (const other of SEEDED_IDS) {
        if (other !== id) expect(drawn).not.toContain(SAMPLE_ID[other]);
      }
    }
  });

  it('never draws a seeded star when the cluster master is off', () => {
    const allItemsOn = { famousStar: true, sun: true, sStar: true };
    expect(visibleStars(settingsWith(false, allItemsOn))).toEqual([]);
  });

  it('tags each drawn star with its source and its index in its OWN table', () => {
    // The pick id a pass packs is `(source, seedIndex)`, so a star tagged with
    // a neighbouring table's index selects the wrong star with no type error.
    const drawn = visibleStars(settingsWith(true, { sStar: true }));
    expect(drawn.map((s) => s.seedIndex)).toEqual(SEEDED_STAR_CATALOGS.sStar.map((_, i) => i));
    expect(new Set(drawn.map((s) => s.source)).size).toBe(1);
  });
});
