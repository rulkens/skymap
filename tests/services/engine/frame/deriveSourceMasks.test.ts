/**
 * deriveSourceMasks — the galaxy catalog draw/pick bitmask derivation.
 *
 * These tests pin the three core invariants the helper exists to enforce:
 * an enabled galaxy catalog gets both bits; a galaxy catalog toggled off but still fading
 * keeps its DRAW bit (smooth ramp-down) while losing its PICK bit (intent-
 * only, unclickable instantly); and a fully-faded disabled galaxy catalog loses both.
 * The all-enabled case pins that enabling every catalog lights every
 * galaxy-catalog bit — which is `ALL_VISIBLE_MASK` (the default-visible set)
 * plus the opt-in DesiDeep bit that ships off.
 *
 * `deriveSourceMasks` is a PURE projection: it RETURNS `{ draw, pick }` and
 * writes nothing. The fixture is therefore just its two inputs — a settings stub
 * whose `galaxyCatalogs.items` covers every `GALAXY_CATALOG_SOURCES` id (so the
 * loop never indexes undefined), and a `fades.opacityOf` stub keyed off the
 * handle's `id`. No `sources` slot, no GPU, no engine.
 */

import { describe, it, expect } from 'vitest';
import { deriveSourceMasks } from '../../../../src/services/engine/frame/deriveSourceMasks';
import { Source, GALAXY_CATALOG_SOURCES } from '../../../../src/data/sources';
import { galaxyCatalogIdOf } from '../../../../src/utils/galaxyCatalogIdOf';
import { maskHas } from '../../../../src/utils/maskHas';
import { ALL_VISIBLE_MASK } from '../../../../src/utils/allVisibleMask';
import type { GalaxyCatalogId } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalogId';
import type { FadeId } from '../../../../src/@types/animation/FadeId';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

/**
 * Build a state stub with every galaxy catalog id present in `galaxyCatalogs.items`
 * (default enabled) and a per-id opacity table.
 *
 * `enabledOverrides` flips specific galaxy catalog ids; `opacityById` supplies
 * each catalog's fade opacity (default 0 — fully faded). Returns the same
 * `Pick<EngineState, ...>` shape `deriveSourceMasks` accepts.
 */
function makeState(opts: {
  enabledOverrides?: Partial<Record<GalaxyCatalogId, boolean>>;
  opacityById?: Partial<Record<GalaxyCatalogId, number>>;
}): Pick<EngineState, 'settings' | 'subsystems'> {
  const items = Object.fromEntries(
    GALAXY_CATALOG_SOURCES.map((s) => {
      const id = galaxyCatalogIdOf(s);
      const enabled = opts.enabledOverrides?.[id] ?? true;
      return [id, { enabled, labelEnabled: true }];
    }),
  ) as Record<GalaxyCatalogId, { enabled: boolean; labelEnabled: boolean }>;

  return {
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
    const { draw, pick } = deriveSourceMasks(state);
    expect(maskHas(draw, Source.SDSS)).toBe(true);
    expect(maskHas(pick, Source.SDSS)).toBe(true);
  });

  it('keeps the draw bit but clears the pick bit for a disabled galaxy catalog still fading out', () => {
    const state = makeState({
      enabledOverrides: { sdss: false },
      opacityById: { sdss: 0.5 },
    });
    const { draw, pick } = deriveSourceMasks(state);
    expect(maskHas(draw, Source.SDSS)).toBe(true);
    expect(maskHas(pick, Source.SDSS)).toBe(false);
  });

  it('clears both bits for a disabled, fully-faded galaxy catalog', () => {
    const state = makeState({
      enabledOverrides: { sdss: false },
      opacityById: { sdss: 0 },
    });
    const { draw, pick } = deriveSourceMasks(state);
    expect(maskHas(draw, Source.SDSS)).toBe(false);
    expect(maskHas(pick, Source.SDSS)).toBe(false);
  });

  it('lights every galaxy-catalog bit when every galaxy catalog is enabled', () => {
    // Every galaxy catalog id defaults to enabled in the fixture. ALL_VISIBLE_MASK
    // is the DEFAULT-visible set, which omits the opt-in DesiDeep cone, so
    // enabling *every* catalog yields ALL_VISIBLE_MASK plus the DesiDeep bit:
    // enabling a default-off catalog still sets its bit, which is the invariant
    // this pins.
    const state = makeState({});
    const { draw, pick } = deriveSourceMasks(state);
    const everyBit = ALL_VISIBLE_MASK | (1 << Source.DesiDeep);
    expect(draw).toBe(everyBit);
    expect(pick).toBe(everyBit);
  });
});
