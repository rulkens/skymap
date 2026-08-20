/**
 * syncVisibilityFades — the private per-row `applyIntent` and the public batch
 * bridge.
 *
 * `applyIntent` is driven against hand-built FadeLayer rows whose
 * intent/guard/post/handle the test controls, isolating one obligation per test.
 * The bridge tests instead drive the REAL `FADE_LAYERS`, so the intent-subset walk
 * and the asymmetric batch wake are exercised against the production manifest.
 */

import { describe, it, expect, vi } from 'vitest';
import type { FadeId } from '../../../../src/@types/animation/FadeId';
import type { FadeLayer } from '../../../../src/@types/animation/FadeLayer';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { EngineSettingsState } from '../../../../src/@types/settings/EngineSettingsState';
import {
  FADE_IN_DURATION_MS,
  FADE_OUT_DURATION_MS,
} from '../../../../src/services/animation/fadeController';
import {
  applyIntentForTest,
  syncVisibilityFades,
  syncVisibilityFadeItem,
} from '../../../../src/services/engine/wiring/syncVisibilityFades';
import { GALAXY_CATALOG_IDS } from '../../../../src/data/galaxyCatalog/galaxyCatalogIds';
import { STAR_CATALOG_IDS } from '../../../../src/data/starCatalog/starCatalogIds';
import { BODY_IDS } from '../../../../src/data/bodies/bodyIds';
import { STRUCTURE_IDS } from '../../../../src/data/structure/structureIds';

// ── Fixtures ──────────────────────────────────────────────────────────
//
// The state slice applyIntent feeds the row closures — mirrors production's
// `ApplyIntentState` (no `sources`: with the survey row's mask-recompute `post`
// gone, no row closure reads it). We only populate `settings` +
// `subsystems.fades`; the test rows never read `assetSlots`, so those stay
// absent and the cast bridges the gap the same way production does.
type ApplyIntentState = Pick<EngineState, 'settings' | 'subsystems' | 'assetSlots' | 'gpu'>;

function makeState(): {
  state: ApplyIntentState;
  fadeTo: ReturnType<typeof vi.fn<(id: FadeId, target: number, dur?: number) => Promise<void>>>;
  setImmediate: ReturnType<typeof vi.fn<(id: FadeId, v: number) => void>>;
} {
  const fadeTo = vi.fn<(id: FadeId, target: number, dur?: number) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const setImmediate = vi.fn<(id: FadeId, v: number) => void>();
  const state = {
    settings: {} as EngineSettingsState,
    subsystems: { fades: { fadeTo, setImmediate } },
  } as unknown as ApplyIntentState;
  return { state, fadeTo, setImmediate };
}

// A handle the rows return; the concrete value is irrelevant to applyIntent.
const HANDLE: FadeId = { kind: 'milkyWay' };

// Minimal intent row at Item = undefined. Callers override fields per test.
function makeRow(over: Partial<FadeLayer<undefined>> = {}): FadeLayer<undefined> {
  return {
    key: 'milkyWayDisk',
    expand: () => [undefined],
    handle: () => HANDLE,
    seed: () => 0,
    intent: () => true,
    ...over,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('applyIntent', () => {
  it('animate fades to intent target', () => {
    const { state, fadeTo, setImmediate } = makeState();

    const onRow = makeRow({ intent: () => true });
    applyIntentForTest(state, onRow, undefined, { animate: true });
    expect(fadeTo).toHaveBeenCalledWith(HANDLE, 1, FADE_IN_DURATION_MS);

    const offRow = makeRow({ intent: () => false });
    applyIntentForTest(state, offRow, undefined, { animate: true });
    expect(fadeTo).toHaveBeenCalledWith(HANDLE, 0, FADE_OUT_DURATION_MS);

    expect(setImmediate).not.toHaveBeenCalled();
  });

  it('non-animate uses setImmediate, never fadeTo', () => {
    const { state, fadeTo, setImmediate } = makeState();

    const onRow = makeRow({ intent: () => true });
    applyIntentForTest(state, onRow, undefined, { animate: false });
    expect(setImmediate).toHaveBeenCalledWith(HANDLE, 1);

    const offRow = makeRow({ intent: () => false });
    applyIntentForTest(state, offRow, undefined, { animate: false });
    expect(setImmediate).toHaveBeenCalledWith(HANDLE, 0);

    expect(fadeTo).not.toHaveBeenCalled();
  });

  it('skips guarded-off rows entirely', () => {
    const { state, fadeTo, setImmediate } = makeState();
    const post = vi.fn<(state: EngineState, item: undefined) => void>();

    const row = makeRow({ guard: () => false, post });
    applyIntentForTest(state, row, undefined, { animate: true });

    expect(fadeTo).not.toHaveBeenCalled();
    expect(setImmediate).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it('runs post after the fade', () => {
    const { state } = makeState();
    const post = vi.fn<(state: EngineState, item: undefined) => void>();

    const row = makeRow({ post });
    applyIntentForTest(state, row, undefined, { animate: true });

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(state, undefined);
  });

  it('uses the durationMs override when given', () => {
    const { state, fadeTo } = makeState();

    const onRow = makeRow({ intent: () => true });
    applyIntentForTest(state, onRow, undefined, { animate: true, durationMs: 1234 });
    expect(fadeTo).toHaveBeenCalledWith(HANDLE, 1, 1234);
    // The override must not equal the default so this assertion is meaningful.
    expect(1234).not.toBe(FADE_IN_DURATION_MS);

    fadeTo.mockClear();
    const offRow = makeRow({ intent: () => false });
    applyIntentForTest(state, offRow, undefined, { animate: true, durationMs: 1234 });
    expect(fadeTo).toHaveBeenCalledWith(HANDLE, 0, 1234);
    expect(1234).not.toBe(FADE_OUT_DURATION_MS);
  });

  it('falls back to FADE_IN/OUT constants when durationMs is omitted', () => {
    const { state, fadeTo } = makeState();

    const onRow = makeRow({ intent: () => true });
    applyIntentForTest(state, onRow, undefined, { animate: true });
    expect(fadeTo).toHaveBeenCalledWith(HANDLE, 1, FADE_IN_DURATION_MS);

    fadeTo.mockClear();
    const offRow = makeRow({ intent: () => false });
    applyIntentForTest(state, offRow, undefined, { animate: true });
    expect(fadeTo).toHaveBeenCalledWith(HANDLE, 0, FADE_OUT_DURATION_MS);
  });
});

// ── syncVisibilityFades (public bridge over the REAL FADE_LAYERS) ──────
//
// These tests stub the fades registry (typed spies on fadeTo/setImmediate) and
// the scheduler, and stand up a full settings/state slice covering every intent
// row's leaf — so the real manifest expands and intents run end to end. Stubbing
// (vs the real createFadeRegistry) avoids having to pre-register every handle;
// we assert the spy calls directly.

// The state slice the bridge feeds the rows — same Pick applyIntent uses.
type BridgeState = Pick<EngineState, 'settings' | 'subsystems' | 'assetSlots' | 'gpu'>;

/**
 * Build a state whose settings cover every intent row's leaf, a stubbed fades
 * registry + scheduler, and a loaded flow renderer (so the flow guard passes).
 * No `sources` slice: the survey row no longer has a mask-recompute `post`.
 */
function makeBridgeState(): {
  state: BridgeState;
  fadeTo: ReturnType<typeof vi.fn<(id: FadeId, target: number, dur?: number) => Promise<void>>>;
  setImmediate: ReturnType<typeof vi.fn<(id: FadeId, v: number) => void>>;
  requestRender: ReturnType<typeof vi.fn<() => void>>;
  settings: EngineSettingsState;
} {
  const fadeTo = vi.fn<(id: FadeId, target: number, dur?: number) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const setImmediate = vi.fn<(id: FadeId, v: number) => void>();
  const requestRender = vi.fn<() => void>();

  const galaxyItems: Record<string, { enabled: boolean; labelEnabled: boolean }> = {};
  for (const id of GALAXY_CATALOG_IDS) galaxyItems[id] = { enabled: true, labelEnabled: false };
  galaxyItems.famousGalaxy = { enabled: true, labelEnabled: true };

  const structureItems: Record<string, { enabled: boolean; labelEnabled: boolean }> = {};
  for (const id of STRUCTURE_IDS) structureItems[id] = { enabled: true, labelEnabled: true };

  const starCatalogItems: Record<string, { enabled: boolean; labelEnabled: boolean }> = {};
  for (const id of STAR_CATALOG_IDS) starCatalogItems[id] = { enabled: true, labelEnabled: true };

  const bodyItems: Record<string, { enabled: boolean; labelEnabled: boolean }> = {};
  for (const id of BODY_IDS) bodyItems[id] = { enabled: true, labelEnabled: true };

  const settings = {
    galaxyCatalogs: { items: galaxyItems },
    starCatalogs: { enabled: true, items: starCatalogItems },
    bodies: { items: bodyItems },
    structures: { enabled: true, items: structureItems },
    milkyWay: { enabled: true, labelEnabled: true },
    zoneOfAvoidance: { enabled: true },
    // Empty volume items: the volumeField intent reads items[id]?.enabled (→
    // false here) and its post no-ops because assetSlots.syntheticVolumes is
    // absent — neither throws, which is all this fixture needs.
    volumes: { enabled: true, items: {} },
    filaments: { enabled: true },
    flow: { enabled: true },
    orbitTrails: { enabled: true },
  } as unknown as EngineSettingsState;

  const state = {
    settings,
    // Demand-loaded renderers report their assets committed so every guarded
    // row (survey / flow / filaments / volumeField) passes and its fade fires.
    gpu: {
      galaxyPointRenderer: { hasCatalog: () => true },
      flowFieldRenderer: { fieldLoaded: () => true },
      filamentRenderer: { hasCloud: () => true },
      volumeFieldRenderer: { listIds: () => [] },
    },
    subsystems: {
      fades: { fadeTo, setImmediate },
      scheduler: { requestRender },
    },
  } as unknown as BridgeState;

  return { state, fadeTo, setImmediate, requestRender, settings };
}

// The intent keys whose handles a full (no-`only`) sync must drive…
const INTENT_KEYS = [
  'survey',
  'surveyLabel',
  'starCatalogLabel',
  'bodyLabel',
  'structureRing',
  'structureLabel',
  'volumeField',
  'volumesMaster',
  'filaments',
  'orbitTrails',
  'milkyWayDisk',
  'milkyWayLabel',
  'flow',
] as const;
// …and the registration-only handles it must NEVER touch.
const REGISTRATION_ONLY_HANDLES: readonly FadeId[] = [
  { kind: 'overlay', id: 'proceduralDisks' },
  { kind: 'overlay', id: 'texturedDisks' },
  { kind: 'labelLayer', layer: 'scaleBar' },
];

/** True iff any fadeTo call matched the given handle (deep-equal on FadeId). */
function fadedHandle(
  fadeTo: ReturnType<typeof vi.fn<(id: FadeId, target: number, dur?: number) => Promise<void>>>,
  handle: FadeId,
): boolean {
  return fadeTo.mock.calls.some(([id]) => JSON.stringify(id) === JSON.stringify(handle));
}

describe('syncVisibilityFades', () => {
  it('with `only` filters to that row’s handles', () => {
    const { state, fadeTo } = makeBridgeState();

    syncVisibilityFades(state, { animate: true, only: ['survey'] });

    // Every survey (galaxy-catalog) handle faded…
    for (const id of GALAXY_CATALOG_IDS) {
      expect(fadedHandle(fadeTo, { kind: 'galaxyCatalog', id }), `survey ${id}`).toBe(true);
    }
    // …and nothing from another intent row did.
    expect(fadedHandle(fadeTo, { kind: 'structure', id: STRUCTURE_IDS[0]! })).toBe(false);
    expect(fadedHandle(fadeTo, { kind: 'volumesMaster' })).toBe(false);
    expect(fadedHandle(fadeTo, { kind: 'milkyWay' })).toBe(false);
  });

  it('with no `only` covers every intent row and skips registration-only rows', () => {
    const { state, fadeTo } = makeBridgeState();

    syncVisibilityFades(state, { animate: true });

    // A representative handle for each intent key faded at least once. The
    // volumeField row fans out per VolumeFieldId, so it's checked by kind below
    // rather than against one hardcoded id.
    const intentSamples: Record<Exclude<(typeof INTENT_KEYS)[number], 'volumeField'>, FadeId> = {
      survey: { kind: 'galaxyCatalog', id: GALAXY_CATALOG_IDS[0]! },
      surveyLabel: { kind: 'labelLayer', layer: 'galaxy' },
      starCatalogLabel: { kind: 'labelLayer', layer: 'starCatalog', item: 'famousStar' },
      bodyLabel: { kind: 'labelLayer', layer: 'body', item: 'earth' },
      structureRing: { kind: 'structure', id: STRUCTURE_IDS[0]! },
      structureLabel: { kind: 'labelLayer', layer: 'structure', item: STRUCTURE_IDS[0]! },
      volumesMaster: { kind: 'volumesMaster' },
      filaments: { kind: 'filament' },
      orbitTrails: { kind: 'orbitTrails' },
      milkyWayDisk: { kind: 'milkyWay' },
      milkyWayLabel: { kind: 'labelLayer', layer: 'milkyWay' },
      flow: { kind: 'flow' },
    };
    for (const key of INTENT_KEYS) {
      if (key === 'volumeField') continue;
      expect(fadedHandle(fadeTo, intentSamples[key]), `intent ${key}`).toBe(true);
    }
    // At least one volumeField handle faded (the row fans out per registry id).
    expect(
      fadeTo.mock.calls.some(([id]) => (id as { kind: string }).kind === 'volumeField'),
      'intent volumeField',
    ).toBe(true);

    // The registration-only handles were never faded.
    for (const handle of REGISTRATION_ONLY_HANDLES) {
      expect(fadedHandle(fadeTo, handle), `registration-only ${JSON.stringify(handle)}`).toBe(
        false,
      );
    }
  });

  it('animate:false issues exactly one requestRender after the batch', () => {
    const { state, setImmediate, requestRender, fadeTo } = makeBridgeState();

    syncVisibilityFades(state, { animate: false });

    expect(fadeTo).not.toHaveBeenCalled();
    expect(setImmediate.mock.calls.length).toBeGreaterThan(0);
    // setImmediate doesn't wake — the batch issues exactly one explicit wake.
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it('animate:true issues no requestRender (fadeTo owns the wake)', () => {
    const { state, requestRender } = makeBridgeState();

    syncVisibilityFades(state, { animate: true });

    expect(requestRender).not.toHaveBeenCalled();
  });

  it('writes no settings', () => {
    const { state, settings } = makeBridgeState();
    const before = JSON.parse(JSON.stringify(settings));

    syncVisibilityFades(state, { animate: true });

    // The bridge does fades ONLY, so settings are untouched.
    expect(JSON.parse(JSON.stringify(settings))).toEqual(before);
  });

  it('threads durationMs to every animated fadeTo call', () => {
    const { state, fadeTo } = makeBridgeState();

    syncVisibilityFades(state, { animate: true, durationMs: 750 });

    // Every fadeTo call must have received the override, not a default constant.
    expect(fadeTo.mock.calls.length).toBeGreaterThan(0);
    for (const [, , dur] of fadeTo.mock.calls) {
      expect(dur).toBe(750);
    }
  });
});

// ── syncVisibilityFadeItem (scoped single-item bridge) ────────────────
//
// The single-item entry applies ONE row's intent to ONE item — vs the batch,
// which sweeps every item the row expands to. The slot commit uses it so a
// concurrent tier-swap reload of source A doesn't re-drive source B's fade.
//
// We drive the REAL `structureRing` row: it's a MULTI-item row (expands to
// STRUCTURE_IDS) with no `post`, so the fixture stays light and we can assert
// that exactly one of its sibling handles faded.

describe('syncVisibilityFadeItem', () => {
  it('drives exactly the one named item, not its row siblings', () => {
    const { state, fadeTo } = makeBridgeState();
    const idA = STRUCTURE_IDS[0]!;
    const idB = STRUCTURE_IDS[1]!;

    syncVisibilityFadeItem(state, 'structureRing', idA, {});

    // Exactly one fade, on idA's handle, to the intent target (enabled → 1).
    expect(fadeTo).toHaveBeenCalledTimes(1);
    expect(fadeTo).toHaveBeenCalledWith({ kind: 'structure', id: idA }, 1, FADE_IN_DURATION_MS);
    // The sibling structure id was never touched.
    expect(fadedHandle(fadeTo, { kind: 'structure', id: idB })).toBe(false);
  });
});
