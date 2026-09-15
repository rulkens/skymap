/**
 * The only reader of `Layer.settings`. `appSettingsFragments` folds each Layer's
 * tuple in by hand (the alias cycle forbids reading it off `APP_COMPOSITION`), so
 * nothing else would notice a Layer that declares knobs the settings root never
 * seeds — they would simply be absent at runtime, with a green suite.
 */

import { describe, it, expect } from 'vitest';

import { APP_COMPOSITION } from '../../src/compositions/app';
import { APP_SETTINGS_FRAGMENTS } from '../../src/compositions/appSettingsFragments';

describe('APP_SETTINGS_FRAGMENTS covers every composed Layer', () => {
  it("folds in each Layer's own settings fragments, by identity", () => {
    const declared = APP_COMPOSITION.layers.flatMap((layer) => layer.settings ?? []);
    // Guards the guard: an empty tuple would make the loop below vacuous.
    expect(declared.length).toBeGreaterThan(0);
    for (const fragment of declared) {
      expect(APP_SETTINGS_FRAGMENTS).toContain(fragment);
    }
  });
});
