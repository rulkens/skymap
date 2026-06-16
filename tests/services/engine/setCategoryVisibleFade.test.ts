/**
 * setStructureItemEnabled / setStructureLabelEnabled / setGalaxyCatalogLabelEnabled /
 * setMilkyWayLabelEnabled — store-write + bridge-dispatch unit tests.
 *
 * These drive the extracted module-level setters directly against a minimal
 * state stub (mirroring `setSourceVisibleFade.test.ts`). Each setter writes the
 * authoritative item leaf THROUGH a real engine-owned settings store (the
 * fixture backs `state.settings` with `createSettingsStore` and a getter,
 * mirroring the engine's delegation) so the copy-on-write write notifies React's
 * `useSettingsStore` subscriber, THEN drives the matching fade THROUGH
 * `syncVisibilityFades` (the intent → fade bridge).
 *
 * The contract under test: a toggle (1) writes the authoritative item leaf
 * (`structures.items[cat].enabled` / `.labelEnabled`,
 * `galaxyCatalogs.items[catalog].labelEnabled`, `milkyWay.labelEnabled`) through
 * the store, and (2) calls the bridge with `{ animate: true, only: ['<key>'] }`
 * for that row's key. The bridge is mocked to a typed spy, so its fade + post
 * behaviour is left to the bridge's own suite; here we assert only the
 * write-then-bridge contract.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApplyIntentState } from '../../../src/services/engine/wiring/syncVisibilityFades';
import { syncVisibilityFades } from '../../../src/services/engine/wiring/syncVisibilityFades';
import { setStructureItemEnabledForTest } from '../../../src/services/engine/handles/setStructureItemEnabled';
import { setStructureLabelEnabledForTest } from '../../../src/services/engine/handles/setStructureLabelEnabled';
import { setGalaxyCatalogLabelEnabledForTest } from '../../../src/services/engine/handles/setGalaxyCatalogLabelEnabled';
import { setMilkyWayLabelEnabledForTest } from '../../../src/services/engine/handles/setMilkyWayLabelEnabled';
import { createSettingsStore } from '../../../src/services/engine/settingsStore/createSettingsStore';
import type { EngineSettingsState } from '../../../src/@types/settings/EngineSettingsState';

// The bridge is the seam under test: mock it to a typed spy so each setter test
// asserts ONLY the setter's contract (write-then-bridge). The bridge's own fade
// behaviour is covered by its own suite.
vi.mock('../../../src/services/engine/wiring/syncVisibilityFades', () => ({
  syncVisibilityFades: vi.fn<typeof import('../../../src/services/engine/wiring/syncVisibilityFades').syncVisibilityFades>(),
}));

const bridge = vi.mocked(syncVisibilityFades);

// ── Minimal fixture factory ───────────────────────────────────────────────
//
// With the bridge mocked, the state stub doesn't need real fade internals; it
// only needs to TYPE-satisfy the exported ApplyIntentState. The settings record
// carries the item leaves each setter writes.

function makeFixture() {
  const store = createSettingsStore({
    galaxyCatalogs: {
      enabled: true,
      items: {
        famousGalaxy: { enabled: true, labelEnabled: true },
      },
    },
    structures: {
      enabled: true,
      items: {
        cluster: { enabled: true, labelEnabled: true },
        supercluster: { enabled: true, labelEnabled: true },
        void: { enabled: true, labelEnabled: true },
        group: { enabled: true, labelEnabled: true },
      },
    },
    milkyWay: { enabled: true, labelEnabled: true },
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

beforeEach(() => bridge.mockClear());

// ── Ring/marker axis (setStructureItemEnabled) ───────────────────────────────

describe('setStructureItemEnabled — store write + bridge dispatch', () => {
  it('writes items[cluster].enabled then drives the bridge with only: ["structureRing"]', () => {
    const fx = makeFixture();
    setStructureItemEnabledForTest(fx.state, fx.store, 'cluster', false);

    // Re-read through the store: the write is copy-on-write, so the row is a
    // fresh object — reading the live state, not a captured reference.
    expect(fx.store.getState().structures.items.cluster.enabled).toBe(false);
    expect(bridge).toHaveBeenCalledWith(fx.state, { animate: true, only: ['structureRing'] });
  });

  it('writes the store BEFORE the bridge call', () => {
    const fx = makeFixture();
    bridge.mockImplementationOnce((s) => {
      expect((s as typeof fx.state).settings.structures.items.cluster.enabled).toBe(false);
    });
    setStructureItemEnabledForTest(fx.state, fx.store, 'cluster', false);
    expect(bridge).toHaveBeenCalledTimes(1);
  });

  it('preserves the category label axis when flipping the ring', () => {
    const fx = makeFixture();
    setStructureItemEnabledForTest(fx.state, fx.store, 'cluster', false);
    expect(fx.store.getState().structures.items.cluster.labelEnabled).toBe(true);
  });
});

// ── Structure text axis (setStructureLabelEnabled) ───────────────────────────

describe('setStructureLabelEnabled — store write + bridge dispatch', () => {
  it('writes items[cluster].labelEnabled then drives the bridge with only: ["structureLabel"]', () => {
    const fx = makeFixture();
    setStructureLabelEnabledForTest(fx.state, fx.store, 'cluster', false);

    expect(fx.store.getState().structures.items.cluster.labelEnabled).toBe(false);
    // The ring axis is untouched.
    expect(fx.store.getState().structures.items.cluster.enabled).toBe(true);
    expect(bridge).toHaveBeenCalledWith(fx.state, { animate: true, only: ['structureLabel'] });
  });
});

// ── Galaxy catalog label axis (setGalaxyCatalogLabelEnabled) ─────────────────

describe('setGalaxyCatalogLabelEnabled — famous-galaxy catalog', () => {
  it('writes famousGalaxy.labelEnabled then drives the bridge with only: ["surveyLabel"]', () => {
    const fx = makeFixture();
    setGalaxyCatalogLabelEnabledForTest(fx.state, fx.store, 'famousGalaxy', false);

    expect(fx.store.getState().galaxyCatalogs.items.famousGalaxy.labelEnabled).toBe(false);
    expect(bridge).toHaveBeenCalledWith(fx.state, { animate: true, only: ['surveyLabel'] });
  });
});

// ── Milky-Way label axis (setMilkyWayLabelEnabled) ───────────────────────────

describe('setMilkyWayLabelEnabled — singleton milkyWay layer', () => {
  it('writes milkyWay.labelEnabled then drives the bridge with only: ["milkyWayLabel"]', () => {
    const fx = makeFixture();
    setMilkyWayLabelEnabledForTest(fx.state, fx.store, false);

    expect(fx.store.getState().milkyWay.labelEnabled).toBe(false);
    // The disk axis is untouched.
    expect(fx.store.getState().milkyWay.enabled).toBe(true);
    expect(bridge).toHaveBeenCalledWith(fx.state, { animate: true, only: ['milkyWayLabel'] });
  });
});
