/**
 * applySceneEffect + VISIBILITY_ACTION_ROW — unit tests.
 *
 * ### Strategy
 *
 * `applySceneEffect` is a thin dispatch table: each arm either dispatches to
 * the store or calls `syncVisibilityFades`. Tests use:
 *
 *   - A spy `dispatch` (vi.fn) so action payloads can be inspected without
 *     running a real store for the simple arms.
 *   - A real store (`createAppStore`) for the show/hide arms, so both the
 *     dispatched visibility actions AND `syncVisibilityFades` can run against
 *     a real state shape without deep mocking.
 *   - A `vi.mock` replacement for the syncVisibilityFades module to assert bridge calls.
 *
 * ### VISIBILITY_ACTION_ROW total-record tests
 *
 * The last describe block iterates every VisibilityLayerKey and asserts that
 * its factory returns an Array. Gate-backed layers must return length ≥ 1 (given
 * a minimal settings fixture); registration-only layers must return []. This is
 * the "total record" guard that prevents a missing key from silently no-oping.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Action } from '@reduxjs/toolkit';

// Module mock must be declared before the import it replaces. Vitest hoists
// vi.mock calls to the top of the file so the factory runs before any import
// is evaluated — only importOriginal() is safe to call inside the factory.
vi.mock('../../../src/services/engine/wiring/syncVisibilityFades', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../../src/services/engine/wiring/syncVisibilityFades')
    >();
  return { ...actual, syncVisibilityFades: vi.fn() };
});

import { applySceneEffect } from '../../../src/services/animation/applySceneEffect';
import { frameTo } from '../../../src/services/engine/animation/effectHelpers';
import { VISIBILITY_ACTION_ROW } from '../../../src/services/animation/visibilityActionRow';
import { syncVisibilityFades } from '../../../src/services/engine/wiring/syncVisibilityFades';
import { setOrientation } from '../../../src/state/settings/settingsSlice';
import { startFrameTween } from '../../../src/state/camera/cameraSlice';
import { matrixToQuaternion } from '../../../src/utils/math/matrixToQuaternion';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { EngineSettingsState } from '../../../src/@types/settings/EngineSettingsState';
import type { AppStore } from '../../../src/store/types';
import type { VisibilityLayerKey } from '../../../src/@types/animation/VisibilityLayerKey';
import { createTestStore as createAppStore } from '../../support/createTestStore';
import {
  setFilamentsEnabled,
  setFlowEnabled,
  setGalaxyCatalogVisible,
  setGalaxyCatalogLabelEnabled,
  setStructureItemEnabled,
  setStructureLabelEnabled,
  writeVolumeField,
} from '../../../src/state/settings/settingsSlice';
import { updateSelectionFocus } from '../../../src/state/selection/selectionSlice';
import { GALAXY_CATALOG_IDS } from '../../../src/data/galaxyCatalog/galaxyCatalogIds';
import { STRUCTURE_IDS } from '../../../src/data/structure/structureIds';
import { DEFAULT_GALAXY_PROVENANCE } from '../../../src/data/defaults';

// ── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * Minimal EngineSettingsState covering every VISIBILITY_ACTION_ROW factory's
 * leaf reads: galaxyCatalogs.items, structures.items, volumes.items, plus the
 * scalar enable fields the gate-backed factories don't read (but are present
 * for type completeness).
 */
function makeSettings(opts?: {
  galaxyCatalogIds?: readonly string[];
  structureIds?: readonly string[];
  volumeFieldIds?: readonly string[];
}): EngineSettingsState {
  const galaxyItems: Record<string, { enabled: boolean; labelEnabled: boolean }> = {};
  for (const id of opts?.galaxyCatalogIds ?? GALAXY_CATALOG_IDS) {
    galaxyItems[id] = { enabled: true, labelEnabled: true };
  }

  const structureItems: Record<string, { enabled: boolean; labelEnabled: boolean }> = {};
  for (const id of opts?.structureIds ?? STRUCTURE_IDS) {
    structureItems[id] = { enabled: true, labelEnabled: true };
  }

  const volumeItems: Record<string, { enabled: boolean }> = {};
  for (const id of opts?.volumeFieldIds ?? []) {
    volumeItems[id] = { enabled: true };
  }

  return {
    galaxyCatalogs: {
      items: galaxyItems,
      enabled: true,
      sizePx: 2,
      brightness: 1,
      depthFade: false,
      provenance: DEFAULT_GALAXY_PROVENANCE,
    },
    structures: { enabled: true, items: structureItems },
    milkyWay: { enabled: true, labelEnabled: true },
    filaments: { enabled: true, intensity: 1 },
    volumes: { enabled: true, items: volumeItems },
    flow: { enabled: true } as EngineSettingsState['flow'],
    tonemap: { exposure: 1, curve: 0 } as EngineSettingsState['tonemap'],
    bias: { mode: 0, absMagLimit: -20 } as EngineSettingsState['bias'],
    thumbnails: { enabled: true },
    debug: {
      showPickBuffer: false,
      showDiskRadiusRing: false,
      disabledPasses: {},
      renderStrategy: 'auto',
    },
  } as unknown as EngineSettingsState;
}

/**
 * Build a minimal fake EngineState for the simple arms (scene / focus).
 * The show/hide tests use a real store instead.
 */
function makeEngineState(settings?: EngineSettingsState): EngineState {
  return {
    settings: settings ?? makeSettings(),
    subsystems: {
      fades: { fadeTo: vi.fn<() => Promise<void>>(() => Promise.resolve()), setImmediate: vi.fn() },
      scheduler: { requestRender: vi.fn() },
    },
    gpu: { flowFieldRenderer: { fieldLoaded: () => false } },
    assetSlots: {},
  } as unknown as EngineState;
}

/**
 * Build a spy store: a minimal AppStore shape where `dispatch` is a vi.fn
 * and `getState` returns a minimal state. Suitable for arms that don't need
 * real state reads.
 */
function makeSpyStore(settings?: EngineSettingsState): {
  store: AppStore;
  dispatch: ReturnType<typeof vi.fn<(a: Action) => Action>>;
} {
  const dispatch = vi.fn<(a: Action) => Action>((a) => a);
  const store = {
    dispatch,
    getState: () => ({ settings: settings ?? makeSettings() }),
    subscribe: vi.fn(),
  } as unknown as AppStore;
  return { store, dispatch };
}

// ── scene ─────────────────────────────────────────────────────────────────────

describe('applySceneEffect — scene', () => {
  it('dispatches its SettingsAction verbatim', () => {
    const state = makeEngineState();
    const { store, dispatch } = makeSpyStore();
    const action = setFlowEnabled(true);

    applySceneEffect({ kind: 'scene', action }, { state, store });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(action);
  });

  it('dispatches the action with the exact payload, not a copy', () => {
    const state = makeEngineState();
    const { store, dispatch } = makeSpyStore();
    const action = setFlowEnabled(false);

    applySceneEffect({ kind: 'scene', action }, { state, store });

    // The exact same reference must be dispatched — not a copy or re-created action.
    expect(dispatch.mock.calls[0]![0]).toBe(action);
  });
});

// ── focus ─────────────────────────────────────────────────────────────────────

describe('applySceneEffect — focus', () => {
  it('dispatches updateSelectionFocus(ref) for a non-null ref', () => {
    const state = makeEngineState();
    const { store, dispatch } = makeSpyStore();
    const ref = { kind: 'structure', id: 'virgoCluster' } as unknown as Parameters<
      typeof updateSelectionFocus
    >[0];

    applySceneEffect({ kind: 'focus', ref }, { state, store });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(updateSelectionFocus(ref));
  });

  it('dispatches updateSelectionFocus(null) when ref is null (clears focus)', () => {
    const state = makeEngineState();
    const { store, dispatch } = makeSpyStore();

    applySceneEffect({ kind: 'focus', ref: null }, { state, store });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(updateSelectionFocus(null));
  });
});

// ── frameTo ─────────────────────────────────────────────────────────────────

describe('applySceneEffect — frameTo', () => {
  it('firing a frameTo cue dispatches setOrientation + startFrameTween with the live basis fromQuat', () => {
    // A known, non-identity live basis: a 90° rotation about X (column-major).
    // Seeding the roll from THIS matrix — not the destination frame's steady
    // pole — is the crux: a frameTo firing mid-roll must compose from wherever
    // the pole is now, so the fromQuat is matrixToQuaternion(the live basis).
    const liveBasis: Mat3 = [1, 0, 0, 0, 0, 1, 0, -1, 0];
    const state = {
      ...makeEngineState(),
      cameraRuntime: { upBasis: { current: liveBasis } },
    } as unknown as EngineState;
    const { store, dispatch } = makeSpyStore();

    applySceneEffect(frameTo('galactic', { over: 1 }), { state, store });

    // Order matters (setOrientation first, then the roll), matching the saga.
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[0]![0]).toEqual(setOrientation('galactic'));
    expect(dispatch.mock.calls[1]![0]).toEqual(
      startFrameTween({
        fromQuat: matrixToQuaternion(liveBasis),
        to: 'galactic',
        durationMs: 1000,
        easing: 'easeInOutCubic',
      }),
    );
  });
});

// ── show / hide ───────────────────────────────────────────────────────────────
//
// These tests use a real createAppStore so that the dispatched visibility actions
// actually reach the settings reducer and state.settings is the live store state.
// syncVisibilityFades is replaced by the vi.mock at the top of this file; each
// describe block clears the mock in beforeEach and asserts via vi.mocked().

describe('applySceneEffect — show', () => {
  beforeEach(() => {
    vi.mocked(syncVisibilityFades).mockClear();
  });

  it('dispatches visibility-on for a gate-backed layer (filaments)', () => {
    const { store } = createAppStore();
    const settings = store.getState().settings;
    const state = makeEngineState(settings as unknown as EngineSettingsState);

    applySceneEffect({ kind: 'show', layers: ['filaments'] }, { state, store });

    expect(store.getState().settings.filaments.enabled).toBe(true);
    // The action is the settings action the UI dispatches.
    expect(vi.mocked(syncVisibilityFades)).toHaveBeenCalledTimes(1);
  });

  it('dispatches one setGalaxyCatalogVisible per catalog id for the survey layer', () => {
    const { store } = createAppStore();
    const settings = store.getState().settings as unknown as EngineSettingsState;
    const state = makeEngineState(settings);
    const dispatch = vi.spyOn(store, 'dispatch');

    applySceneEffect({ kind: 'show', layers: ['survey'] }, { state, store });

    // Every catalog id must have received a visibility-on action.
    const catalogActions = dispatch.mock.calls
      .map(([a]) => a as ReturnType<typeof setGalaxyCatalogVisible>)
      .filter((a) => a.type === setGalaxyCatalogVisible.type);

    expect(catalogActions.length).toBe(GALAXY_CATALOG_IDS.length);
    for (const id of GALAXY_CATALOG_IDS) {
      expect(catalogActions.some((a) => a.payload.id === id && a.payload.enabled === true)).toBe(
        true,
      );
    }
  });

  it('calls syncVisibilityFades with only + animate:true when over is undefined', () => {
    const { store } = createAppStore();
    const settings = store.getState().settings as unknown as EngineSettingsState;
    const state = makeEngineState(settings);

    applySceneEffect({ kind: 'show', layers: ['filaments'] }, { state, store });

    expect(vi.mocked(syncVisibilityFades)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        animate: true,
        only: ['filaments'],
        durationMs: undefined,
      }),
    );
  });

  it('converts a positive `over` (clip seconds) to durationMs for the fade bridge', () => {
    const { store } = createAppStore();
    const settings = store.getState().settings as unknown as EngineSettingsState;
    const state = makeEngineState(settings);

    // `over` is authored in SECONDS (like every clip-land duration); the fade
    // bridge consumes milliseconds. Forwarding it unconverted made a 9-second
    // volume reveal run as a 9-millisecond pop.
    applySceneEffect({ kind: 'show', layers: ['filaments'], over: 9 }, { state, store });

    expect(vi.mocked(syncVisibilityFades)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ animate: true, durationMs: 9000 }),
    );
  });

  it('dispatches a targeted action for a scoped entry, not the whole-row fan-out', () => {
    const { store } = createAppStore();
    const settings = store.getState().settings as unknown as EngineSettingsState;
    const state = makeEngineState(settings);
    const dispatch = vi.spyOn(store, 'dispatch');

    applySceneEffect({ kind: 'show', layers: [], scoped: ['survey:milliquas'] }, { state, store });

    // Exactly ONE catalog-visibility action — the scoped item, no fan-out.
    const catalogActions = dispatch.mock.calls
      .map(([a]) => a as ReturnType<typeof setGalaxyCatalogVisible>)
      .filter((a) => a.type === setGalaxyCatalogVisible.type);
    expect(catalogActions).toEqual([setGalaxyCatalogVisible({ id: 'milliquas', enabled: true })]);
    // The explicit fade sync covers atomic layers only (empty here) — the
    // scoped item's fade rides the reactive settings→fade bridge.
    expect(vi.mocked(syncVisibilityFades)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ only: [] }),
    );
  });
});

describe('applySceneEffect — hide', () => {
  beforeEach(() => {
    vi.mocked(syncVisibilityFades).mockClear();
  });

  it('dispatches visibility-off for a gate-backed layer (filaments)', () => {
    const { store } = createAppStore();
    const settings = store.getState().settings as unknown as EngineSettingsState;
    const state = makeEngineState(settings);
    const dispatch = vi.spyOn(store, 'dispatch');

    applySceneEffect({ kind: 'hide', layers: ['filaments'] }, { state, store });

    const filamentAction = dispatch.mock.calls
      .map(([a]) => a as ReturnType<typeof setFilamentsEnabled>)
      .find((a) => a.type === setFilamentsEnabled.type);

    expect(filamentAction).toBeDefined();
    expect(filamentAction!.payload).toBe(false);
  });

  it('dispatches visibility-off for every structure id when hiding structureRing', () => {
    const { store } = createAppStore();
    const settings = store.getState().settings as unknown as EngineSettingsState;
    const state = makeEngineState(settings);
    const dispatch = vi.spyOn(store, 'dispatch');

    applySceneEffect({ kind: 'hide', layers: ['structureRing'] }, { state, store });

    const structureActions = dispatch.mock.calls
      .map(([a]) => a as ReturnType<typeof setStructureItemEnabled>)
      .filter((a) => a.type === setStructureItemEnabled.type);

    expect(structureActions.length).toBe(STRUCTURE_IDS.length);
    for (const id of STRUCTURE_IDS) {
      expect(structureActions.some((a) => a.payload.id === id && a.payload.enabled === false)).toBe(
        true,
      );
    }
  });

  it('dispatches a targeted off action for a scoped hide entry', () => {
    const { store } = createAppStore();
    const settings = store.getState().settings as unknown as EngineSettingsState;
    const state = makeEngineState(settings);
    const dispatch = vi.spyOn(store, 'dispatch');

    applySceneEffect({ kind: 'hide', layers: [], scoped: ['label:group'] }, { state, store });

    const labelActions = dispatch.mock.calls
      .map(([a]) => a as ReturnType<typeof setStructureLabelEnabled>)
      .filter((a) => a.type === setStructureLabelEnabled.type);
    expect(labelActions).toEqual([setStructureLabelEnabled({ id: 'group', enabled: false })]);
  });

  it('calls syncVisibilityFades with only + animate:true when over is undefined', () => {
    const { store } = createAppStore();
    const settings = store.getState().settings as unknown as EngineSettingsState;
    const state = makeEngineState(settings);

    applySceneEffect({ kind: 'hide', layers: ['milkyWayDisk'] }, { state, store });

    expect(vi.mocked(syncVisibilityFades)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        animate: true,
        only: ['milkyWayDisk'],
        durationMs: undefined,
      }),
    );
  });
});

// ── over === 0 → snap path (animate:false) ────────────────────────────────────

describe('applySceneEffect — over === 0 routes through animate:false', () => {
  beforeEach(() => {
    vi.mocked(syncVisibilityFades).mockClear();
  });

  it('show with over:0 calls bridge with animate:false', () => {
    const { store } = createAppStore();
    const settings = store.getState().settings as unknown as EngineSettingsState;
    const state = makeEngineState(settings);

    applySceneEffect({ kind: 'show', layers: ['filaments'], over: 0 }, { state, store });

    expect(vi.mocked(syncVisibilityFades)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ animate: false }),
    );
  });

  it('hide with over:0 calls bridge with animate:false', () => {
    const { store } = createAppStore();
    const settings = store.getState().settings as unknown as EngineSettingsState;
    const state = makeEngineState(settings);

    applySceneEffect({ kind: 'hide', layers: ['filaments'], over: 0 }, { state, store });

    expect(vi.mocked(syncVisibilityFades)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ animate: false }),
    );
  });
});

// ── fade throws (caller bug) ──────────────────────────────────────────────────

describe('applySceneEffect — fade', () => {
  it('throws when a fade effect is routed here (caller bug guard)', () => {
    const state = makeEngineState();
    const { store } = makeSpyStore();

    expect(() =>
      applySceneEffect({ kind: 'fade', layers: ['filaments'], to: 0, over: 500 }, { state, store }),
    ).toThrow();
  });
});

// ── VISIBILITY_ACTION_ROW — total record ──────────────────────────────────────
//
// Every VisibilityLayerKey must resolve to a factory. Gate-backed layers return
// length ≥ 1; registration-only layers return []. This guards against a new key
// being added to VisibilityLayerKey without a matching VISIBILITY_ACTION_ROW entry
// (which would be a TypeScript compile error, but tested here for belt-and-suspenders).

describe('VISIBILITY_ACTION_ROW — total record', () => {
  const ALL_KEYS: readonly VisibilityLayerKey[] = [
    'milkyWayDisk',
    'proceduralDisks',
    'texturedDisks',
    'volumesMaster',
    'milkyWayLabel',
    'surveyLabel',
    'scaleBar',
    'structureRing',
    'structureLabel',
    'survey',
    'filaments',
    'flow',
    'volumeField',
  ] as const;

  // Registration-only keys that correctly return [] — they have no settings action.
  const REGISTRATION_ONLY: readonly VisibilityLayerKey[] = [
    'proceduralDisks',
    'texturedDisks',
    'scaleBar',
  ];

  const settings = makeSettings({ galaxyCatalogIds: ['sdss'], structureIds: ['supercluster'] });

  it('gate-backed layers return a non-empty action array', () => {
    const gateBacked: readonly VisibilityLayerKey[] = ALL_KEYS.filter(
      (k) => !REGISTRATION_ONLY.includes(k),
    );
    for (const key of gateBacked) {
      const actions = VISIBILITY_ACTION_ROW[key](true, settings);
      expect(Array.isArray(actions), `key '${key}' must return an array`).toBe(true);
      // All non-registration-only keys have at least one item in the settings fixture
      // (survey and structureRing etc. have one id each, volumeField has zero items
      // because the fixture has no volume items — that is expected).
      // Only assert length > 0 for keys where the settings fixture has items.
      if (key !== 'volumeField') {
        expect(
          actions.length,
          `key '${key}' must return ≥1 actions with this fixture`,
        ).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('registration-only layers return []', () => {
    for (const key of REGISTRATION_ONLY) {
      const actionsOn = VISIBILITY_ACTION_ROW[key](true, settings);
      const actionsOff = VISIBILITY_ACTION_ROW[key](false, settings);
      expect(actionsOn, `${key}(true) must be []`).toEqual([]);
      expect(actionsOff, `${key}(false) must be []`).toEqual([]);
    }
  });

  it('surveyLabel factory emits one setGalaxyCatalogLabelEnabled per catalog id', () => {
    const actions = VISIBILITY_ACTION_ROW['surveyLabel'](false, settings) as ReturnType<
      typeof setGalaxyCatalogLabelEnabled
    >[];
    expect(actions).toHaveLength(1);
    expect(actions[0]!.payload).toEqual({ id: 'sdss', enabled: false });
  });

  it('structureLabel factory emits one setStructureLabelEnabled per structure id', () => {
    const actions = VISIBILITY_ACTION_ROW['structureLabel'](true, settings) as ReturnType<
      typeof setStructureLabelEnabled
    >[];
    expect(actions).toHaveLength(1);
    expect(actions[0]!.payload).toEqual({ id: 'supercluster', enabled: true });
  });

  it('volumeField factory emits one writeVolumeField({ id, patch:{enabled} }) per volume item', () => {
    const settingsWithVolume = makeSettings({ volumeFieldIds: ['cf4-density'] });
    const actions = VISIBILITY_ACTION_ROW['volumeField'](true, settingsWithVolume) as ReturnType<
      typeof writeVolumeField
    >[];
    expect(actions).toHaveLength(1);
    expect(actions[0]!.payload).toEqual({ id: 'cf4-density', patch: { enabled: true } });
  });

  it('volumeField factory returns [] when volumes.items is empty', () => {
    // Default settings fixture has no volume items.
    const actions = VISIBILITY_ACTION_ROW['volumeField'](true, settings);
    expect(actions).toEqual([]);
  });
});
