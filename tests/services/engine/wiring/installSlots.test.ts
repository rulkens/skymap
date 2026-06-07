/**
 * installSlots — unit tests for the single sidecar-slot mutation site.
 *
 * `installSlots` is the one place a registry-built slot is written onto
 * `state.assetSlots`. Two invariants:
 *
 *   - each sidecar slot lands on its matching named field (the string AssetKey
 *     equals the field name exactly);
 *   - point slots (numeric keys) are never written into a named field — they
 *     self-install into `state.assetSlots.points` in initGpu, so a numeric key
 *     that slips into the map is skipped, not mis-installed.
 */

import { describe, it, expect, vi } from 'vitest';
import { installSlots } from '../../../../src/services/engine/wiring/installSlots';
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
    forceReload: () => {},
    cancel: () => {},
  };
}

/** Minimal state with an empty asset-slots bag (named fields start null). */
function makeState(): EngineState {
  const points = new Map<number, AssetSlot<unknown, unknown>>();
  return {
    assetSlots: {
      points,
      filaments: null,
      famousMeta: null,
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
    const famousMeta = stubSlot('famous-meta');
    const structureCatalog = stubSlot('structure-catalog');
    const pgcAlias = stubSlot('pgc-aliases');
    const cf4Density = stubSlot('cf4Density');
    const mcpm = stubSlot('mcpm');
    const slots = new Map<AssetKey, AssetSlot<unknown, unknown>>([
      ['filaments', filaments],
      ['famousMeta', famousMeta],
      ['structureCatalog', structureCatalog],
      ['pgcAlias', pgcAlias],
      ['cf4Density', cf4Density],
      ['mcpm', mcpm],
    ]);

    installSlots(state, slots);

    expect(state.assetSlots.filaments).toBe(filaments);
    expect(state.assetSlots.famousMeta).toBe(famousMeta);
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
});
