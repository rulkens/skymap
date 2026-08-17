/**
 * installSlots — unit tests for the single sidecar-slot mutation site.
 *
 * `installSlots` is the one place a registry-built slot is written onto
 * `state.assetSlots`. Three invariants:
 *
 *   - each sidecar slot lands on its matching named field (the string AssetKey
 *     equals the field name exactly);
 *   - galaxy point slots (numeric keys with `type: 'galaxyCatalog'` registry
 *     entries) are never written into a named field — they self-install into
 *     `state.assetSlots.points` directly in `wireSlots`, so such a key that
 *     slips into the map is skipped, not mis-installed;
 *   - star-catalog slots (numeric keys with `type: 'starCatalog'` entries) are
 *     registry-built and DO install here, into the per-source `starCatalogs`
 *     map — proven end-to-end (build → install → slotFor) so the demand loop's
 *     resolution path is exercised, not just the write.
 */

import { describe, it, expect, vi } from 'vitest';
import { installSlots } from '../../../../src/services/engine/wiring/installSlots';
import { buildSlotsFromRegistry } from '../../../../src/services/engine/wiring/buildSlotsFromRegistry';
import { slotFor } from '../../../../src/services/engine/wiring/slotFor';
import { ASSET_WIRING } from '../../../../src/services/engine/wiring/assetWiring';
import { Source } from '../../../../src/data/sources';
import type { AssetKey } from '../../../../src/@types/loading/AssetKey';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

function stubSlot(name: string): AssetSlot<unknown, unknown> {
  return {
    name,
    load: vi.fn(),
    current: () => null,
    state: () => ({ kind: 'idle' }),
    subscribe: () => () => {},
    lastRequest: () => null,
    startedAtMs: () => null,
    forceReload: () => {},
    cancel: () => {},
    release: () => {},
  };
}

/** Minimal state with an empty asset-slots bag (named fields start null). */
function makeState(): EngineState {
  const points = new Map<number, AssetSlot<unknown, unknown>>();
  const starCatalogs = new Map<number, AssetSlot<unknown, unknown>>();
  return {
    assetSlots: {
      points,
      starCatalogs,
      filaments: null,
      famousGalaxiesMeta: null,
      structureCatalog: null,
      pgcAlias: null,
      cf4Density: null,
      mcpm: null,
    },
  } as unknown as EngineState;
}

describe('installSlots', () => {
  it('writes each sidecar slot to its matching named field', () => {
    const state = makeState();
    const filaments = stubSlot('filaments');
    const famousGalaxiesMeta = stubSlot('famous-galaxies-meta');
    const structureCatalog = stubSlot('structure-catalog');
    const pgcAlias = stubSlot('pgc-aliases');
    const cf4Density = stubSlot('cf4Density');
    const mcpm = stubSlot('mcpm');
    const slots = new Map<AssetKey, AssetSlot<unknown, unknown>>([
      ['filaments', filaments],
      ['famousGalaxiesMeta', famousGalaxiesMeta],
      ['structureCatalog', structureCatalog],
      ['pgcAlias', pgcAlias],
      ['cf4Density', cf4Density],
      ['mcpm', mcpm],
    ]);

    installSlots(state, slots);

    expect(state.assetSlots.filaments).toBe(filaments);
    expect(state.assetSlots.famousGalaxiesMeta).toBe(famousGalaxiesMeta);
    expect(state.assetSlots.structureCatalog).toBe(structureCatalog);
    expect(state.assetSlots.pgcAlias).toBe(pgcAlias);
    expect(state.assetSlots.cf4Density).toBe(cf4Density);
    expect(state.assetSlots.mcpm).toBe(mcpm);
  });

  it('skips numeric (point) keys — does not touch the points map', () => {
    const state = makeState();
    const pointSlot = stubSlot('sdss-points');
    const filaments = stubSlot('filaments');
    const slots = new Map<AssetKey, AssetSlot<unknown, unknown>>([
      [Source.SDSS, pointSlot],
      ['filaments', filaments],
    ]);

    installSlots(state, slots);

    // The numeric key was skipped — the points map is untouched.
    expect(state.assetSlots.points.size).toBe(0);
    expect(state.assetSlots.points.has(Source.SDSS)).toBe(false);
    // The sidecar still installed.
    expect(state.assetSlots.filaments).toBe(filaments);
  });

  it('routes a star-catalog slot end-to-end: build → install → slotFor resolves it', () => {
    // The full registry-built seam over the REAL gaiaStars wiring row: the
    // construction pass builds the slot, installSlots must land it in the
    // per-source starCatalogs map (NOT drop it as "numeric ⇒ galaxy ⇒
    // wireSlots's problem"), and slotFor — the demand loop's resolution path —
    // must find it. This is the wiring that makes demand-driven star
    // fetch/commit reachable at all.
    const state = makeState();
    const row = ASSET_WIRING.filter((r) => r.key === Source.GaiaStars);
    const built = buildSlotsFromRegistry(row, { state, cb: {} as never });

    installSlots(state, built);

    const resolved = slotFor(state, Source.GaiaStars);
    expect(resolved).toBe(built.get(Source.GaiaStars));
    // Star slots never leak into the galaxy points map…
    expect(state.assetSlots.points.has(Source.GaiaStars)).toBe(false);
    // …and the galaxy resolution path is unchanged: a numeric galaxy key still
    // reads the points map that wireSlots self-installs into.
    const pointSlot = stubSlot('sdss-points');
    // The points map is typed for the galaxy payload/request pair; the erased
    // stub is fine for this resolution check (slotFor reads only the identity).
    state.assetSlots.points.set(Source.SDSS, pointSlot as never);
    expect(slotFor(state, Source.SDSS)).toBe(pointSlot);
  });
});
