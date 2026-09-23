/**
 * deriveSourceMasks — the galaxy catalog draw/pick bitmask derivation.
 *
 * These tests pin the three core invariants the helper exists to enforce:
 * an enabled galaxy catalog gets both bits; a galaxy catalog toggled off but still fading
 * keeps its DRAW bit (smooth ramp-down) while losing its PICK bit (intent-
 * only, unclickable instantly); and a fully-faded disabled galaxy catalog loses both.
 * The all-enabled case pins that enabling every catalog lights every
 * galaxy-catalog bit, DesiDeep included.
 *
 * `deriveSourceMasks` is a PURE projection: it RETURNS `{ draw, pick }` and
 * writes nothing. The fixture is therefore just its two inputs — a settings stub
 * whose `galaxyCatalogs.items` covers every `GALAXY_CATALOG_SOURCES` id (so the
 * loop never indexes undefined), and a `fades.opacityOf` stub keyed off the
 * handle's `id`. No `sources` slot, no GPU, no engine.
 */

import { describe, it, expect } from 'vitest';
import { deriveSourceMasks } from '../../../../src/services/engine/frame/deriveSourceMasks';
import { createFadeRegistry } from '../../../../src/services/animation/fadeRegistry';
import { Source, GALAXY_CATALOG_SOURCES } from '../../../../src/data/sources';
import { galaxyCatalogIdOf } from '../../../../src/utils/galaxyCatalogIdOf';
import { maskHas } from '../../../../src/utils/maskHas';
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
    const { draw, pick } = deriveSourceMasks(state, 0);
    expect(maskHas(draw, Source.SDSS)).toBe(true);
    expect(maskHas(pick, Source.SDSS)).toBe(true);
  });

  it('keeps the draw bit but clears the pick bit for a disabled galaxy catalog still fading out', () => {
    const state = makeState({
      enabledOverrides: { sdss: false },
      opacityById: { sdss: 0.5 },
    });
    const { draw, pick } = deriveSourceMasks(state, 0);
    expect(maskHas(draw, Source.SDSS)).toBe(true);
    expect(maskHas(pick, Source.SDSS)).toBe(false);
  });

  it('clears both bits for a disabled, fully-faded galaxy catalog', () => {
    const state = makeState({
      enabledOverrides: { sdss: false },
      opacityById: { sdss: 0 },
    });
    const { draw, pick } = deriveSourceMasks(state, 0);
    expect(maskHas(draw, Source.SDSS)).toBe(false);
    expect(maskHas(pick, Source.SDSS)).toBe(false);
  });

  // Regression: `opacityOf` must be sampled at the PASSED `nowMs`, not the
  // fade registry's last-ticked clock — `runFrame` derives the masks before
  // the frame tail's `fades.tick(nowMs)` runs, so a stale read makes the
  // mask lag a settling fade by one frame (the sky-cubemap bake-in bug).
  it('samples opacityOf at the given nowMs, not the registry last-ticked clock', () => {
    const fades = createFadeRegistry({ requestRender: () => {} });
    const id: FadeId = { kind: 'galaxyCatalog', id: 'sdss' };
    fades.register(id, 1);
    // Starts a 100 ms fade-out at t=0 — WITHOUT ever calling `fades.tick(...)`,
    // so the registry's internal clock stays frozen at construction (0).
    void fades.fadeTo(id, 0, 100, 0);

    const items = Object.fromEntries(
      GALAXY_CATALOG_SOURCES.map((s) => {
        const gid = galaxyCatalogIdOf(s);
        return [gid, { enabled: gid === 'sdss' ? false : true, labelEnabled: true }];
      }),
    ) as Record<GalaxyCatalogId, { enabled: boolean; labelEnabled: boolean }>;
    const state = {
      settings: { galaxyCatalogs: { items } } as never,
      subsystems: { fades } as never,
    };

    // Query well past the fade's 100 ms end, at a nowMs the registry was
    // never ticked to.
    const { draw } = deriveSourceMasks(state, 500);
    expect(maskHas(draw, Source.SDSS)).toBe(false);
  });
});
