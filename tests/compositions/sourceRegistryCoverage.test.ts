/**
 * `Layer.sources` is inert: `data/sources.ts` folds each Layer's rows into
 * `SOURCE_REGISTRY` by direct import, so a Layer can declare rows, skip that edit,
 * and ship with a green suite — its sources simply absent at runtime. The same
 * hole `appSettingsFragments.test.ts` closes for `Layer.settings`.
 */

import { describe, it, expect } from 'vitest';

import { APP_COMPOSITION } from '../../src/compositions/app';
import { SOURCE_REGISTRY } from '../../src/data/sources';
import type { SourceType } from '../../src/@types/data/SourceType';
import type { SourceEntry } from '../../src/@types/data/SourceEntry';

describe('SOURCE_REGISTRY covers every composed Layer', () => {
  it("folds in each Layer's own source rows, by identity", () => {
    // `U` pinned: `layers` is a tuple of unlike Layer types, so inference off the
    // callback would fix `U` to the first Layer's sources tuple.
    const declared = APP_COMPOSITION.layers.flatMap<readonly [SourceType, SourceEntry]>(
      (layer) => layer.sources ?? [],
    );
    // Guards the guard: an empty tuple would make the loop below vacuous.
    expect(declared.length).toBeGreaterThan(0);
    for (const [code, entry] of declared) {
      // Identity, not presence: a hand-copied duplicate would pass `toBeDefined`.
      expect(SOURCE_REGISTRY[code]).toBe(entry);
    }
  });
});
