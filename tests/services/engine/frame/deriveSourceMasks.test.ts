/**
 * deriveSourceMasks — the galaxy catalog draw/pick bitmask derivation.
 *
 * These tests pin the three core invariants the helper exists to enforce:
 * an enabled galaxy catalog gets both bits; a galaxy catalog toggled off but still fading
 * keeps its DRAW bit (smooth ramp-down) while losing its PICK bit (intent-
 * only, unclickable instantly); and a fully-faded disabled galaxy catalog loses both.
 * The all-enabled case pins boot-equivalence with `ALL_VISIBLE_MASK`, the
 * construction-time seed the rest of the system relies on.
 *
 * The fixture is deliberately minimal: a settings stub whose `galaxyCatalogs.items`
 * covers every `GALAXY_CATALOG_SOURCES` id (so the loop never indexes undefined), a
 * `fades.opacityOf` stub keyed off the handle's `id`, and a `sources`
 * object with mutable masks. No GPU, no engine.
 */

import { describe, it, expect } from 'vitest';
import { deriveSourceMasks } from '../../../../src/services/engine/frame/deriveSourceMasks';
import { Source, GALAXY_CATALOG_SOURCES } from '../../../../src/data/sources';
import { galaxyCatalogIdOf } from '../../../../src/utils/galaxyCatalogIdOf';
import { maskHas, ALL_VISIBLE_MASK } from '../../../../src/utils/sourceMask';
import type { GalaxyCatalogId } from '../../../../src/@types/engine/data/GalaxyCatalogId';
import type { FadeId } from '../../../../src/@types/animation/FadeId';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

/**
 * Build a state stub with every galaxy catalog id present in `galaxyCatalogs.items`
 * (default enabled), a per-id opacity table, and mutable masks.
 *
 * `enabledOverrides` flips specific galaxy catalog ids; `opacityById` supplies
 * each catalog's fade opacity (default 0 — fully faded). Returns the same
 * `Pick<EngineState, ...>` shape `deriveSourceMasks` accepts.
 */
function makeState(opts: {
  enabledOverrides?: Partial<Record<GalaxyCatalogId, boolean>>;
  opacityById?: Partial<Record<GalaxyCatalogId, number>>;
}): Pick<EngineState, 'sources' | 'settings' | 'subsystems'> {
  const items = Object.fromEntries(
    GALAXY_CATALOG_SOURCES.map((s) => {
      const id = galaxyCatalogIdOf(s);
      const enabled = opts.enabledOverrides?.[id] ?? true;
      return [id, { enabled, labelEnabled: true }];
    }),
  ) as Record<GalaxyCatalogId, { enabled: boolean; labelEnabled: boolean }>;

  return {
    sources: { drawMask: 0, pickMask: 0, tier: 'medium' },
    settings: { galaxyCatalogs: { items } } as never,
    subsystems: {
      fades: {
        opacityOf: (id: FadeId) =>
          id.kind === 'galaxyCatalog' ? (opts.opacityById?.[id.id] ?? 0) : 0,
      },
    } as never,
  };
}

describe('deriveSourceMasks', () => {
  it('sets draw+pick bits for an enabled galaxy catalog', () => {
    // Enabled with zero opacity still gets both bits — `enabled` alone drives
    // the pick bit, and `enabled || opacity>0` drives the draw bit.
    const state = makeState({ enabledOverrides: { sdss: true } });
    deriveSourceMasks(state);
    expect(maskHas(state.sources.drawMask, Source.SDSS)).toBe(true);
    expect(maskHas(state.sources.pickMask, Source.SDSS)).toBe(true);
  });

  it('keeps the draw bit but clears the pick bit for a disabled galaxy catalog still fading out', () => {
    const state = makeState({
      enabledOverrides: { sdss: false },
      opacityById: { sdss: 0.5 },
    });
    deriveSourceMasks(state);
    expect(maskHas(state.sources.drawMask, Source.SDSS)).toBe(true);
    expect(maskHas(state.sources.pickMask, Source.SDSS)).toBe(false);
  });

  it('clears both bits for a disabled, fully-faded galaxy catalog', () => {
    const state = makeState({
      enabledOverrides: { sdss: false },
      opacityById: { sdss: 0 },
    });
    deriveSourceMasks(state);
    expect(maskHas(state.sources.drawMask, Source.SDSS)).toBe(false);
    expect(maskHas(state.sources.pickMask, Source.SDSS)).toBe(false);
  });

  it('derives exactly ALL_VISIBLE_MASK when every galaxy catalog is enabled', () => {
    // Every galaxy catalog id defaults to enabled in the fixture, so this pins the
    // boot-equivalence the construction seed relies on.
    const state = makeState({});
    deriveSourceMasks(state);
    expect(state.sources.drawMask).toBe(ALL_VISIBLE_MASK);
    expect(state.sources.pickMask).toBe(ALL_VISIBLE_MASK);
  });
});
