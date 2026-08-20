/**
 * The S-star registry row: a body row that draws but never captions.
 *
 * What can actually break here is not the row's field values (a compiler-checked
 * literal) but its CONSEQUENCES in the derived key domains — the settings row it
 * seeds, the label domain it must stay out of, and the pick-code budget it eats
 * into. Each of those is a separate file that reads the registry and would fail
 * silently, not loudly.
 */

import { describe, it, expect } from 'vitest';
import { Source, SOURCE_REGISTRY } from '../../../src/data/sources';
import { S_STAR_ENTRY } from '../../../src/data/sources/s-star';
import { BODY_IDS } from '../../../src/data/bodies/bodyIds';
import { LABEL_CATEGORIES } from '../../../src/data/structure/labelCategories';
import { buildInitialSettings } from '../../../src/state/settings/initialState';
import { SELECTION_SOURCE_SHIFT } from '../../../src/data/selectionEncoding';

describe('the S-star source row', () => {
  it('seeds a body settings row whose default follows the registry', () => {
    // `visibleStars` gates all 39 on `bodies.items['s-star'].enabled`. The row is
    // derived, not authored, so the failure mode is an ABSENT key — an undefined
    // read that throws on the first frame rather than a wrong boolean.
    const settings = buildInitialSettings();
    expect(BODY_IDS).toContain(S_STAR_ENTRY.id);
    expect(settings.bodies.items[S_STAR_ENTRY.id]?.enabled).toBe(S_STAR_ENTRY.visible);
  });

  it('stays out of the label domain, so nothing budgets it a caption', () => {
    // `bearsLabel: false` is what keeps 39 names out of `LABEL_CATEGORIES` — the
    // set the SettingsPanel's label rows, `projectLabelCategoryVisibility` and
    // the `bodyLabel` fade row all iterate. Flipping the flag would register a
    // caption handle for a caption `sceneBodyLabels` never emits.
    expect(LABEL_CATEGORIES).not.toContain(S_STAR_ENTRY.id);
  });

  it('every registry code fits the pick texture’s source field, uniquely', () => {
    // The packed identity gives the source code `32 - SELECTION_SOURCE_SHIFT`
    // bits with the all-ones value reserved as the no-hit sentinel, so 62 is the
    // last usable code. Nothing else checks the ceiling, and overflowing it would
    // corrupt `localIdx` rather than fail: the OR would carry into the index.
    const codes = Object.values(SOURCE_REGISTRY).map((entry) => entry.code);
    const maxCode = (1 << (32 - SELECTION_SOURCE_SHIFT)) - 1 - 1;
    expect(Math.max(...codes)).toBeLessThanOrEqual(maxCode);
    expect(new Set(codes).size).toBe(codes.length);
    expect(SOURCE_REGISTRY[Source.SStar]).toBe(S_STAR_ENTRY);
  });
});
