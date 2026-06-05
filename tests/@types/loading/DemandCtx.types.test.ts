/**
 * DemandCtx — compile-time assignability checks.
 *
 * Confirms that:
 *   - A literal object with all fields satisfies `DemandCtx`.
 *   - `request('paletteOpened')` typechecks (i.e. `'paletteOpened'` is a
 *     valid `RequestKey` and the return type is `boolean`).
 *   - `slotState('clusterCatalog')` typechecks with the `LoadState['kind']`
 *     return type.
 *   - `volumeField('mcpm')` typechecks (returns the params or undefined).
 *
 * These are purely compile-time assertions: the `it` bodies just prove
 * that TypeScript accepted the expression — the runtime `expect` calls are
 * incidental.  If any type drifts (a `DemandCtx` field is renamed, a
 * `RequestKey` member is dropped, `AssetKey` stops including string keys),
 * this file stops compiling and the typecheck gate catches it.
 */

import { describe, expect, it } from 'vitest';
import type { DemandCtx } from '../../../src/@types/loading/DemandCtx';
import type { EngineSettingsState } from '../../../src/@types/settings/EngineSettingsState';
import { Source } from '../../../src/data/sources';

// Minimal stand-in for EngineSettingsState — enough fields to satisfy the
// Readonly<EngineSettingsState> shape at the point type-checking runs.
// TypeScript structural typing means we only need to supply a value that
// is assignable to the full shape; a cast via `as unknown as` keeps the
// test body concise without inventing every leaf value.
const fakeSettings = {} as unknown as EngineSettingsState;

const ctx: DemandCtx = {
  settings: fakeSettings,
  volumeField: (_id) => undefined,
  isVisible: (_s) => true,
  request: (_k) => false,
  slotState: (_k) => 'idle',
  flow: { enabled: false },
};

describe('DemandCtx assignability', () => {
  it('accepts a literal object with all fields', () => {
    expect(ctx).toBeDefined();
  });

  it("volumeField('mcpm') returns the params or undefined", () => {
    const result = ctx.volumeField('mcpm');
    expect(result).toBeUndefined();
  });

  it("request('paletteOpened') returns boolean", () => {
    const result: boolean = ctx.request('paletteOpened');
    expect(typeof result).toBe('boolean');
  });

  it("isVisible accepts a SourceType value", () => {
    const result: boolean = ctx.isVisible(Source.SDSS);
    expect(typeof result).toBe('boolean');
  });

  it("slotState accepts an AssetKey string and returns a LoadState kind", () => {
    const kind = ctx.slotState('clusterCatalog');
    // The return type is LoadState<unknown>['kind'] — a union of string literals.
    expect(typeof kind).toBe('string');
  });

  it("slotState accepts a numeric SourceType AssetKey", () => {
    const kind = ctx.slotState(Source.Famous);
    expect(typeof kind).toBe('string');
  });

  it("flow.enabled is a boolean", () => {
    const enabled: boolean = ctx.flow.enabled;
    expect(typeof enabled).toBe('boolean');
  });
});
