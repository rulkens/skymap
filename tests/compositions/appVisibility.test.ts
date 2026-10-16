/**
 * `APP_VISIBILITY` is hand-assembled beside `APP_COMPOSITION`, and the address types only see
 * its literals: a duplicate key, a bad `of` pairing or a Layer missing from the list would all
 * compile. The engine reads the composition, so a missing Layer would escape `'labels'`.
 */

import { describe, it, expect } from 'vitest';

import { APP_COMPOSITION } from '../../src/compositions/app';
import { APP_VISIBILITY } from '../../src/compositions/appVisibility';
import type { VisibilityEntry } from '../../src/@types/engine/layer/VisibilityEntry';
import type { ShowEntry } from '../../src/@types/engine/layer/ShowEntry';
import type { LabelEntry } from '../../src/@types/engine/layer/LabelEntry';
import type { VisibilityArg } from '../../src/@types/animation/VisibilityArg';
import type { ScopedVisibilityAddress } from '../../src/@types/animation/ScopedVisibilityAddress';
import type { ContentPass } from '../../src/@types/engine/frame/ContentPass';

const ENTRIES: readonly VisibilityEntry[] = APP_VISIBILITY;
const SHOWS = ENTRIES.filter((e): e is ShowEntry => 'key' in e);
const LABELS = ENTRIES.filter((e): e is LabelEntry => 'label' in e);

describe('APP_VISIBILITY', () => {
  it('every address in APP_VISIBILITY is declared once', () => {
    const keys = SHOWS.map((e) => e.key);
    const labels = LABELS.map((e) => e.label);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(labels).size).toBe(labels.length);
    // `<key>:<item>` must never read as `label:<name>` or the `'labels'` aggregate.
    expect(keys.filter((k) => k === 'label' || k === 'labels')).toEqual([]);
    for (const entry of ENTRIES) {
      const items = entry.items ?? [];
      expect(new Set(items).size).toBe(items.length);
    }
  });

  it('every of pairing obeys the item rule', () => {
    const withOf = LABELS.filter((e) => e.of !== undefined);
    expect(withOf.length).toBeGreaterThan(0);
    for (const label of withOf) {
      const thing = SHOWS.find((e) => e.key === label.of);
      expect(thing, `label:${label.label} of '${label.of}'`).toBeDefined();
      expect(label.items === undefined, `label:${label.label} item shape`).toBe(
        thing!.items === undefined,
      );
      const missing = (label.items ?? []).filter((item) => !thing!.items!.includes(item));
      expect(missing, `label:${label.label} items its of entry lacks`).toEqual([]);
    }
  });

  it('APP_VISIBILITY lists exactly the entries the composed Layers declare', () => {
    // `U` pinned: `layers` is a tuple of unlike Layer types.
    const declared = APP_COMPOSITION.layers.flatMap<VisibilityEntry>(
      (layer) => layer.visibility ?? [],
    );
    expect(declared.length).toBe(ENTRIES.length);
    // Identity, not deep equality: a hand-copied entry would drift unseen.
    declared.forEach((entry, i) => expect(entry).toBe(ENTRIES[i]));
  });
});

// Type-level: each line fails `tsc` if the derived vocabulary loosens or tightens.
// @ts-expect-error a misspelled show key
const _a: VisibilityArg = 'flwo';
// @ts-expect-error an item the entry does not have
const _b: ScopedVisibilityAddress = 'survey:bogus';
// @ts-expect-error a nested label item the entry does not have
const _c: ScopedVisibilityAddress = 'label:structure:bogus';
const _d: ScopedVisibilityAddress = 'label:structure:void';
const _e: ScopedVisibilityAddress = 'survey:milliquas';
const _f: ScopedVisibilityAddress = 'cosmicWebDensity:mcpm';
const _g: ScopedVisibilityAddress = 'starCatalog:sun';

// A pass declaring one key gets that key's value type uncast, and still fits the erased list.
const flowPass: ContentPass<'flow'> = {
  name: 'typeOnly',
  fade: 'flow',
  enabled: (_state, _ctx, _view, fade) => fade > 0,
  draw: () => {},
};
const surveyPass: ContentPass<'survey'> = {
  name: 'typeOnly',
  fade: 'survey',
  enabled: (_state, _ctx, _view, fade) => fade.milliquas > 0,
  draw: () => {},
};
const _passes: readonly ContentPass[] = [flowPass, surveyPass];
// @ts-expect-error a narrowed pass must declare its fade, or core never hands the value
const _undeclared: ContentPass<'flow'> = { name: 'typeOnly', enabled: () => true, draw: () => {} };
