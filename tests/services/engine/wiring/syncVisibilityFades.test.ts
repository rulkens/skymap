/**
 * syncVisibilityFades — unit tests for the private per-row `applyIntent` AND
 * the public batch bridge `syncVisibilityFades`.
 *
 * `applyIntent` is the fades-ONLY primitive of the intent → fade bridge. Its
 * tests isolate its five obligations:
 *
 *   1. Animated: read intent, `fadeTo` the handle to 1 (FADE_IN) or 0 (FADE_OUT).
 *   2. Non-animated: `setImmediate` instead, never `fadeTo`.
 *   3. An explicit `guard() === false` skips the whole op — no fade, no post.
 *   4. `post` runs after the fade, with `(state, item)`.
 *   5. It NEVER calls `writeIntent` — settings writes are the public bridge's job.
 *
 * Strategy: a stubbed fades registry with typed spies, plus hand-built FadeLayer
 * rows whose intent/guard/post/handle the test controls. Driving these isolates
 * one behaviour per test without standing up the real FADE_LAYERS or a GPU.
 *
 * The `syncVisibilityFades` tests, by contrast, drive the REAL `FADE_LAYERS`
 * through the public bridge: they cover the intent-subset walk (with/without an
 * `only` filter), the asymmetric batch wake, and the fades-only / no-settings
 * contract.
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
} from '../../../../src/services/engine/wiring/syncVisibilityFades';
import { GALAXY_CATALOG_IDS } from '../../../../src/data/galaxyCatalog/galaxyCatalogIds';
import { STRUCTURE_IDS } from '../../../../src/data/structure/structureIds';

// ── Fixtures ──────────────────────────────────────────────────────────
//
// The state slice applyIntent feeds the row closures. We only populate
// `settings` + `subsystems.fades`; the test rows never read `assetSlots`/
// `sources`, so those stay absent and the cast bridges the gap the same way
// production does.
type ApplyIntentState = Pick<
  EngineState,
  'settings' | 'subsystems' | 'assetSlots' | 'sources' | 'gpu'
>;

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

  it('never writes settings', () => {
    const { state } = makeState();
    const writeIntent =
      vi.fn<(settings: EngineSettingsState, item: undefined, value: boolean) => void>();

    const row = makeRow({ writeIntent });
    applyIntentForTest(state, row, undefined, { animate: true });

    expect(writeIntent).not.toHaveBeenCalled();
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
type BridgeState = Pick<
  EngineState,
  'settings' | 'subsystems' | 'assetSlots' | 'sources' | 'gpu'
>;

/**
 * Build a state whose settings cover every intent row's leaf, a stubbed fades
 * registry + scheduler, a loaded flow renderer (so the flow guard passes), and
 * the `sources` masks the survey row's `post` (deriveSourceMasks) writes.
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
  // opacityOf is read by deriveSourceMasks (survey post); a constant 0 is fine.
  const opacityOf = vi.fn<(id: FadeId) => number>(() => 0);
  const requestRender = vi.fn<() => void>();

  const galaxyItems: Record<string, { enabled: boolean; labelEnabled: boolean }> = {};
  for (const id of GALAXY_CATALOG_IDS) galaxyItems[id] = { enabled: true, labelEnabled: false };
  galaxyItems.famousGalaxy = { enabled: true, labelEnabled: true };

  const structureItems: Record<string, { enabled: boolean; labelEnabled: boolean }> = {};
  for (const id of STRUCTURE_IDS) structureItems[id] = { enabled: true, labelEnabled: true };

  const settings = {
    galaxyCatalogs: { items: galaxyItems },
    structures: { enabled: true, items: structureItems },
    milkyWay: { enabled: true, labelEnabled: true },
    // Empty volume items: the volumeField intent reads items[id]?.enabled (→
    // false here) and its post no-ops because assetSlots.syntheticVolumes is
    // absent — neither throws, which is all this fixture needs.
    volumes: { enabled: true, items: {} },
    filaments: { enabled: true },
    flow: { enabled: true },
  } as unknown as EngineSettingsState;

  const state = {
    settings,
    // Flow field loaded so the flow guard (fieldLoaded()) passes and its fade fires.
    gpu: { flowFieldRenderer: { fieldLoaded: () => true } },
    sources: { drawMask: 0, pickMask: 0 },
    subsystems: {
      fades: { fadeTo, setImmediate, opacityOf },
      scheduler: { requestRender },
    },
  } as unknown as BridgeState;

  return { state, fadeTo, setImmediate, requestRender, settings };
}

// The intent keys whose handles a full (no-`only`) sync must drive…
const INTENT_KEYS = [
  'survey',
  'surveyLabel',
  'structureRing',
  'structureLabel',
  'volumeField',
  'volumesMaster',
  'filaments',
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
      surveyLabel: { kind: 'labelLayer', layer: 'galaxyNames' },
      structureRing: { kind: 'structure', id: STRUCTURE_IDS[0]! },
      structureLabel: { kind: 'labelLayer', layer: 'structure', category: STRUCTURE_IDS[0]! },
      volumesMaster: { kind: 'volumesMaster' },
      filaments: { kind: 'filament' },
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
      expect(fadedHandle(fadeTo, handle), `registration-only ${JSON.stringify(handle)}`).toBe(false);
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

    // The bridge does fades ONLY — no writeIntent, so settings are untouched.
    expect(JSON.parse(JSON.stringify(settings))).toEqual(before);
  });
});
