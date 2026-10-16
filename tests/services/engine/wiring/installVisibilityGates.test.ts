/**
 * The gating edge: a slot's notifications move only its own identity (and its `of` labels),
 * reading `committed()`. Driven over the real entries, settings reducer and fade registry,
 * with hand-fired slots.
 */

import { describe, expect, it, vi } from 'vitest';

import { APP_VISIBILITY } from '../../../../src/compositions/appVisibility';
import { createFadeRegistry } from '../../../../src/services/animation/fadeRegistry';
import { collectVisibilityGates } from '../../../../src/services/engine/wiring/collectVisibilityGates';
import { installVisibilityGates } from '../../../../src/services/engine/wiring/installVisibilityGates';
import { seedVisibilityFades } from '../../../../src/services/engine/wiring/seedVisibilityFades';
import { INITIAL_SETTINGS } from '../../../../src/state/settings/initialSettings';
import { setVisibility } from '../../../../src/state/settings/setVisibilityAction';
import settingsReducer from '../../../../src/state/settings/settingsReducer';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { AssetWiringRow } from '../../../../src/@types/loading/AssetWiringRow';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { SetVisibilityPayload } from '../../../../src/@types/settings/SetVisibilityPayload';

const READY = { kind: 'ready', req: {}, value: 1, loadedAtMs: 0 } as const;

function makeSlot() {
  const subs = new Set<(s: LoadState<unknown>) => void>();
  let committed: typeof READY | null = null;
  return {
    committed: () => committed,
    subscribe(fn: (s: LoadState<unknown>) => void) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    commit() {
      committed = READY;
      for (const fn of subs) fn(READY);
    },
    /** Holds a value whose own notification has not been delivered yet. */
    commitUnheard() {
      committed = READY;
    },
    reload() {
      for (const fn of subs) fn({ kind: 'loading', req: {}, attempt: 1 } as never);
    },
    release() {
      committed = null;
      for (const fn of subs) fn({ kind: 'idle' });
    },
  };
}

function makeState(
  gated: Record<string, NonNullable<AssetWiringRow['gates']>>,
  ...writes: SetVisibilityPayload[]
) {
  const slots = Object.fromEntries(Object.keys(gated).map((key) => [key, makeSlot()]));
  const fades = createFadeRegistry({ requestRender: () => {} });
  const fadeTo = vi.spyOn(fades, 'fadeTo');
  const state = {
    settings: writes.reduce((s, p) => settingsReducer(s, setVisibility(p)), INITIAL_SETTINGS),
    subsystems: { fades },
    visibilityEntries: APP_VISIBILITY,
    assetRows: Object.entries(gated).map(([key, gates]) => ({ key, gates })),
    layerSlots: new Map(Object.entries(slots)),
  } as unknown as EngineState;
  state.visibilityGates = collectVisibilityGates(state);
  seedVisibilityFades(state);
  installVisibilityGates(state);
  return { state, slots, fades, fadeTo };
}

describe('installVisibilityGates', () => {
  it('a gating commit raises the target, and release() lowers it', () => {
    const { slots, fades } = makeState(
      { localBubble: 'localBubble' },
      { cluster: 'localBubble', field: 'enabled', on: true },
    );
    const target = () => fades.targetOf({ address: 'localBubble' });
    expect(target()).toBe(0);
    slots.localBubble!.commit();
    expect(target()).toBe(1);
    slots.localBubble!.release();
    expect(target()).toBe(0);
    slots.localBubble!.commit();
    expect(target()).toBe(1);
  });

  it('a reload keeps the target', () => {
    const { slots, fadeTo } = makeState(
      { localBubble: 'localBubble' },
      { cluster: 'localBubble', field: 'enabled', on: true },
    );
    slots.localBubble!.commit();
    fadeTo.mockClear();
    slots.localBubble!.reload();
    expect(fadeTo).not.toHaveBeenCalled();
  });

  // A whole-entry recompute would let A's commit drive B's fade, which B's own slot owns
  // (the old tier-swap race). B holds a value its notification has not delivered yet, so a
  // recompute of B would be visible.
  it('a gating commit retargets only its own item', () => {
    const { slots, fadeTo } = makeState({
      a: { address: 'survey', item: 'sdss' },
      b: { address: 'survey', item: 'glade' },
    });
    slots.b!.commitUnheard();
    slots.a!.commit();
    expect(fadeTo).toHaveBeenCalledWith({ address: 'survey', item: 'sdss' }, 1, expect.any(Number));
    expect(fadeTo.mock.calls.filter(([id]) => 'item' in id && id.item === 'glade')).toEqual([]);
  });

  it('a gating commit also retargets the label entries whose of names it', () => {
    const { slots, fadeTo } = makeState(
      { constellations: 'constellations' },
      { cluster: 'constellations', field: 'enabled', on: true },
    );
    slots.constellations!.commit();
    expect(fadeTo).toHaveBeenCalledWith({ address: 'constellations' }, 1, expect.any(Number));
    expect(fadeTo).toHaveBeenCalledWith(
      { address: 'label:constellations', item: undefined },
      1,
      expect.any(Number),
    );
  });
});
