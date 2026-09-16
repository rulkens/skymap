/**
 * installFadeOnArrival — the arrival edge, driven against the shared engine stub and
 * one stub slot. The bug class is "the fade never fires" or "it fires twice", and
 * both live in the guard-transition bookkeeping rather than in any renderer, so the
 * real rows plus a notifiable slot are the whole apparatus needed.
 */

import { describe, it, expect, vi } from 'vitest';

import { GALAXY_CATALOG_IDS } from '../../../../src/data/galaxyCatalog/galaxyCatalogIds';
import { filamentsFadeRows } from '../../../../src/layers/filaments/present/filamentsFadeRows';
import { galaxyCatalogFadeRows } from '../../../../src/layers/galaxyCatalog/present/galaxyCatalogFadeRows';
import { FADE_IN_DURATION_MS } from '../../../../src/services/animation/fadeController';
import { installFadeOnArrival } from '../../../../src/services/engine/wiring/installFadeOnArrival';
import { makeFadeBridgeState } from '../../../helpers/engine/makeFadeBridgeState';

import type { FadeLayer } from '../../../../src/@types/animation/FadeLayer';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { LoadState } from '../../../../src/@types/loading/LoadState';
import type { FilamentsRuntime } from '../../../../src/layers/filaments/types/FilamentsRuntime';
import type { GalaxyCatalogRuntime } from '../../../../src/layers/galaxyCatalog/types/GalaxyCatalogRuntime';
import type { FadeBridgeState } from '../../../helpers/engine/FadeBridgeState';

/** One slot whose `ready` notification the test issues by hand, as a commit would. */
function makeStubSlot(): {
  slots: ReadonlyMap<string, AssetSlot<unknown, unknown>>;
  notifyReady: () => void;
} {
  const subscribers: ((s: LoadState<unknown>) => void)[] = [];
  const slot = {
    subscribe: (fn: (s: LoadState<unknown>) => void) => {
      subscribers.push(fn);
      return () => {};
    },
  } as unknown as AssetSlot<unknown, unknown>;
  const ready: LoadState<unknown> = { kind: 'ready', req: null, value: null, loadedAtMs: 0 };

  return {
    slots: new Map([['stub', slot]]),
    notifyReady: () => {
      for (const fn of subscribers) fn(ready);
    },
  };
}

/** A one-item intent row on the `flow` key, so the installer's walk finds exactly it. */
function makeGuardedRow(over: Partial<FadeLayer<undefined>>): FadeLayer<undefined> {
  return {
    key: 'flow',
    expand: () => [undefined],
    handle: () => ({ kind: 'flow' }),
    seed: () => 0,
    intent: () => true,
    ...over,
  };
}

describe('installFadeOnArrival', () => {
  it('fades a row in when its guard opens on slot ready', () => {
    const { state, fadeTo } = makeFadeBridgeState();
    let hasCloud = false;
    // A REAL row, over a renderer the test commits into by hand — the guard
    // transition under test is the one an upload actually opens.
    (state as FadeBridgeState).fadeRows = filamentsFadeRows({
      renderer: { hasCloud: () => hasCloud },
    } as unknown as FilamentsRuntime) as FadeBridgeState['fadeRows'];
    const { slots, notifyReady } = makeStubSlot();

    installFadeOnArrival(state as EngineState, slots);
    hasCloud = true; // the commit body uploaded the cloud
    notifyReady();

    expect(fadeTo).toHaveBeenCalledTimes(1);
    expect(fadeTo).toHaveBeenCalledWith({ kind: 'filament' }, 1, FADE_IN_DURATION_MS);
  });

  it('does not re-fire when an already-ready slot re-notifies', () => {
    const { state, fadeTo } = makeFadeBridgeState();
    const post = vi.fn<(s: EngineState, item: undefined) => void>();
    let arrived = false;
    (state as FadeBridgeState).fadeRows = [makeGuardedRow({ guard: () => arrived, post })];
    const { slots, notifyReady } = makeStubSlot();

    installFadeOnArrival(state as EngineState, slots);
    arrived = true;
    notifyReady();
    notifyReady(); // `slot.cancel()` re-notifies with the last ready state

    expect(fadeTo).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('never fires for a row whose guard is constant true', () => {
    // `volumeField`'s DEV debug ids: their lazy-load rides that row's `post`, which
    // this path must leave to the settings-toggle sync.
    const { state, fadeTo } = makeFadeBridgeState();
    const post = vi.fn<(s: EngineState, item: undefined) => void>();
    (state as FadeBridgeState).fadeRows = [makeGuardedRow({ guard: () => true, post })];
    const { slots, notifyReady } = makeStubSlot();

    installFadeOnArrival(state as EngineState, slots);
    notifyReady();

    expect(fadeTo).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it('drives only the item whose guard opened, not its row siblings', () => {
    const { state, fadeTo } = makeFadeBridgeState();
    const opening = GALAXY_CATALOG_IDS[0]!;
    const sibling = GALAXY_CATALOG_IDS[1]!;
    const committed = new Set<string>([sibling]);
    (state as FadeBridgeState).fadeRows = galaxyCatalogFadeRows({
      pointRenderer: { hasCatalog: (id: string) => committed.has(id) },
    } as unknown as GalaxyCatalogRuntime);
    const { slots, notifyReady } = makeStubSlot();

    installFadeOnArrival(state as EngineState, slots);
    committed.add(opening);
    notifyReady();

    expect(fadeTo).toHaveBeenCalledTimes(1);
    expect(fadeTo).toHaveBeenCalledWith(
      { kind: 'galaxyCatalog', id: opening },
      1,
      FADE_IN_DURATION_MS,
    );
  });
});
