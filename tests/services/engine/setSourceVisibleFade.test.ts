/**
 * setSourceVisible — synchronous toggle unit tests.
 *
 * These drive `setSourceVisibleForTest` directly against a minimal state stub
 * rather than instantiating a full GPU engine.  The helper writes the galaxy
 * catalog's `enabled` flag through a real engine-owned settings store (the
 * fixture backs `state.settings` with `createSettingsStore` and a getter,
 * mirroring the engine's delegation), then drives the fade THROUGH
 * `syncVisibilityFades` (the intent → fade bridge).
 *
 * ### Model under test
 *
 * `setVisible` is SYNCHRONOUS and does TWO things, in order: it flips the galaxy
 * catalog's `settings.galaxyCatalogs.items[id].enabled` — the single source of
 * truth for on/off — THROUGH the store's copy-on-write action (so React's
 * `useSettingsStore(selectVisibleSourceMask)` subscriber wakes), THEN calls the
 * bridge with `{ animate: true, only: ['survey'] }`. The bridge reads the
 * just-written intent, fades the `galaxyCatalog` handle, and runs the survey
 * row's `post: deriveSourceMasks` — so the setter no longer recomputes the masks
 * itself. Mask derivation is therefore covered by `fadeLayers.test.ts`, not here.
 *
 * The bridge is mocked to a typed spy: these tests assert the setter's own
 * contract (store write → bridge call with the right opts; no-op short-circuit),
 * leaving the bridge's fade + post behaviour to the bridge's own suite.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Source, GALAXY_CATALOG_SOURCES, SOURCE_REGISTRY } from '../../../src/data/sources';
import type { GalaxyCatalogId } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalogId';
import type { ApplyIntentState } from '../../../src/services/engine/wiring/syncVisibilityFades';
import { syncVisibilityFades } from '../../../src/services/engine/wiring/syncVisibilityFades';
import { setSourceVisibleForTest } from '../../../src/services/engine/handles/setSourceVisible';
import { createSettingsStore } from '../../../src/services/engine/settingsStore/createSettingsStore';
import type { EngineSettingsState } from '../../../src/@types/settings/EngineSettingsState';

// The bridge is the seam under test: mock it to a typed spy so the setter test
// asserts ONLY the setter's contract (write-then-bridge, short-circuit). The
// bridge's own fade + deriveSourceMasks post is covered by fadeLayers.test.ts.
vi.mock('../../../src/services/engine/wiring/syncVisibilityFades', () => ({
  syncVisibilityFades:
    vi.fn<
      typeof import('../../../src/services/engine/wiring/syncVisibilityFades').syncVisibilityFades
    >(),
}));

const bridge = vi.mocked(syncVisibilityFades);

// ── Minimal fixture factory ───────────────────────────────────────────────
//
// With the bridge mocked, the state stub doesn't need real fade/assetSlots/
// sources internals (the mock swallows them); it only needs to TYPE-satisfy the
// exported ApplyIntentState. The `enabled` items must exist so the setter's
// short-circuit read finds a row.

function makeFixture() {
  const items = Object.fromEntries(
    GALAXY_CATALOG_SOURCES.map((s) => [
      SOURCE_REGISTRY[s].id as GalaxyCatalogId,
      { enabled: true, labelEnabled: true },
    ]),
  );
  const store = createSettingsStore({
    galaxyCatalogs: { items },
  } as unknown as EngineSettingsState);
  const state = {
    get settings() {
      return store.getState();
    },
    subsystems: {
      fades: { fadeTo: vi.fn(), setImmediate: vi.fn() },
      scheduler: { requestRender: vi.fn() },
    },
  } as unknown as ApplyIntentState;
  return { state, store };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('setSourceVisible — synchronous toggle', () => {
  beforeEach(() => bridge.mockClear());

  it('flips galaxyCatalogs.items[id].enabled synchronously (through the store)', () => {
    const fx = makeFixture();
    expect(fx.store.getState().galaxyCatalogs.items.sdss!.enabled).toBe(true);

    setSourceVisibleForTest(fx.state, fx.store, Source.SDSS, false);

    // Re-read through the store: the write is copy-on-write, so the row is a
    // fresh object — reading the live state, not a captured reference.
    expect(fx.store.getState().galaxyCatalogs.items.sdss!.enabled).toBe(false);
  });

  it('drives the fade through the bridge with { animate: true, only: ["survey"] }', () => {
    const hide = makeFixture();
    setSourceVisibleForTest(hide.state, hide.store, Source.SDSS, false);
    expect(bridge).toHaveBeenCalledWith(hide.state, { animate: true, only: ['survey'] });

    const show = makeFixture();
    show.store.getState().galaxyCatalogs.items.sdss!.enabled = false;
    setSourceVisibleForTest(show.state, show.store, Source.SDSS, true);
    expect(bridge).toHaveBeenLastCalledWith(show.state, { animate: true, only: ['survey'] });
  });

  it('writes the store BEFORE calling the bridge (the bridge reads the just-written intent)', () => {
    const fx = makeFixture();
    bridge.mockImplementationOnce((s) => {
      // By the time the bridge runs, the intent is already written.
      expect((s as typeof fx.state).settings.galaxyCatalogs.items.sdss!.enabled).toBe(false);
    });
    setSourceVisibleForTest(fx.state, fx.store, Source.SDSS, false);
    expect(bridge).toHaveBeenCalledTimes(1);
  });

  it('short-circuits a no-op toggle: no store change, no bridge call', () => {
    const fx = makeFixture(); // sdss starts enabled
    setSourceVisibleForTest(fx.state, fx.store, Source.SDSS, true); // already true → no-op

    expect(bridge).not.toHaveBeenCalled();
    expect(fx.store.getState().galaxyCatalogs.items.sdss!.enabled).toBe(true);
  });
});
