/**
 * fadeLayers — unit tests for the fade-ownership manifest + the generic
 * `seedFades` construction seed (relocated from the old registerOverlayFades).
 *
 * Invariants targeted:
 *
 *   1. The overlay/milkyWay handles seed at their settings-derived or fixed
 *      opacities. milkyWay is the load-bearing case: a default-off session must
 *      not flash the Milky Way on frame 1.
 *   2. The volumesMaster handle seeds at `settings.volumes.enabled`.
 *   3. The label-layer handles seed correctly: milkyWay from
 *      `settings.milkyWay.labelEnabled`, galaxy + scaleBar at 1.
 *   4. Each structure ring + label seeds from its per-category settings row.
 *   5. The demand-loaded sets (galaxy catalogs, filament, flow, volume fields)
 *      seed at 0 so their first-load `fadeTo(1)` still fades them in.
 *
 * Strategy: build a minimal `EngineState` carrying a REAL fade registry (so we
 * can assert via `opacityOf`, not just count `register` spy calls) plus the
 * settings paths `seedFades` reads. `seedFades` touches nothing else — no GPU.
 */

import { describe, it, expect, vi, expectTypeOf } from 'vitest';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import { createFadeRegistry } from '../../../../src/services/animation/fadeRegistry';
import { STRUCTURE_IDS } from '../../../../src/data/structure/structureIds';
import { GALAXY_CATALOG_IDS } from '../../../../src/data/galaxyCatalog/galaxyCatalogIds';
import { STAR_CATALOG_IDS } from '../../../../src/data/starCatalog/starCatalogIds';
import { BODY_IDS } from '../../../../src/data/bodies/bodyIds';
import { SOURCE_REGISTRY } from '../../../../src/data/sources';
import { SOURCE_ENTRIES } from '../../../../src/data/sourceEntries';
import { expandVisibilityLayers } from '../../../../src/utils/animation/expandVisibilityLayers';
import type { VisibilityLayerKey } from '../../../../src/@types/animation/VisibilityLayerKey';
import type { EngineSettingsState } from '../../../../src/@types/settings/EngineSettingsState';
import type { FadeLayer } from '../../../../src/@types/animation/FadeLayer';
import { FADE_LAYERS, seedFades } from '../../../../src/services/engine/wiring/fadeLayers';

// ── Drift guard ───────────────────────────────────────────────────────
//
// FADE_LAYERS' row keys must EXACTLY cover VisibilityLayerKey: this fails to
// compile if a union key has no row, or a row introduces a key outside the
// union. The `satisfies` annotation on FADE_LAYERS preserves each row's literal
// key (it does not erase to the whole union), so this assertion has teeth.
type RowKeys = (typeof FADE_LAYERS)[number]['key'];
expectTypeOf<RowKeys>().toEqualTypeOf<VisibilityLayerKey>();

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Build a minimal EngineState with a real fades registry plus the settings
 * paths seedFades reads. Per-structure items default to ring + label visible;
 * a test overrides one axis on one category via the opts records. Every
 * StructureId is populated (driven off STRUCTURE_IDS) so the structure rows'
 * `items[id]` reads never go undefined.
 */
/** Every star-catalog row, both axes on — the shape both builders below need. */
function starCatalogItems(): Record<string, { enabled: boolean; labelEnabled: boolean }> {
  return Object.fromEntries(
    STAR_CATALOG_IDS.map((id) => [id, { enabled: true, labelEnabled: true }]),
  );
}

/** Every body row, both axes on — the near-field twin of `starCatalogItems`. */
function bodyItems(): Record<string, { enabled: boolean; labelEnabled: boolean }> {
  return Object.fromEntries(BODY_IDS.map((id) => [id, { enabled: true, labelEnabled: true }]));
}

function makeState(
  opts: {
    milkyWayEnabled?: boolean;
    milkyWayLabelEnabled?: boolean;
    surveyLabelEnabled?: boolean;
    volumesMasterEnabled?: boolean;
    orbitTrailsEnabled?: boolean;
    ringVisibility?: Partial<Record<string, boolean>>;
    labelVisibility?: Partial<Record<string, boolean>>;
  } = {},
): EngineState {
  const items: Record<string, { enabled: boolean; labelEnabled: boolean }> = {};
  for (const id of STRUCTURE_IDS) {
    items[id] = {
      enabled: opts.ringVisibility?.[id] ?? true,
      labelEnabled: opts.labelVisibility?.[id] ?? true,
    };
  }
  return {
    settings: {
      milkyWay: {
        enabled: opts.milkyWayEnabled ?? true,
        labelEnabled: opts.milkyWayLabelEnabled ?? true,
      },
      volumes: { enabled: opts.volumesMasterEnabled ?? true },
      // The orbitTrails fade row seeds from settings.orbitTrails.enabled, so
      // seedFades indexes this leaf (default on, like the live scene).
      orbitTrails: { enabled: opts.orbitTrailsEnabled ?? true },
      // The surveyLabel fade row seeds from famousGalaxy.labelEnabled (famous
      // labels reuse the galaxy layer), so seedFades indexes this leaf.
      galaxyCatalogs: {
        items: { famousGalaxy: { enabled: true, labelEnabled: opts.surveyLabelEnabled ?? true } },
      },
      // The starCatalogLabel fade row seeds per label-bearing star catalog, so
      // every star-catalog row is populated for the same reason the structure
      // items are.
      starCatalogs: { enabled: true, items: starCatalogItems() },
      // The bodyLabel fade row seeds per CAPTION-BEARING BodyId; every body row
      // is populated anyway, for the same reason the structure items are.
      bodies: { items: bodyItems() },
      structures: { enabled: true, items },
    },
    subsystems: {
      fades: createFadeRegistry({ requestRender: vi.fn<() => void>() }),
    },
  } as unknown as EngineState;
}

/** Look a manifest row up by its literal key (rows are stored Item-erased). */
function rowFor(key: VisibilityLayerKey): FadeLayer<unknown> {
  const row = FADE_LAYERS.find((r) => r.key === key);
  if (!row) throw new Error(`no FADE_LAYERS row for key '${key}'`);
  return row;
}

/**
 * A minimal EngineSettingsState carrying only the leaf paths the intent rows
 * read/write. Every per-item record is populated so `items[id]` reads never go
 * undefined. Overrides flip a single leaf.
 */
function makeSettings(
  opts: {
    sdssEnabled?: boolean;
    famousLabelEnabled?: boolean;
    milkyWayEnabled?: boolean;
    orbitTrailsEnabled?: boolean;
  } = {},
): EngineSettingsState {
  const galaxyItems: Record<string, { enabled: boolean; labelEnabled: boolean }> = {};
  for (const id of GALAXY_CATALOG_IDS) {
    galaxyItems[id] = {
      enabled: id === 'sdss' ? (opts.sdssEnabled ?? true) : true,
      labelEnabled: id === 'famousGalaxy' ? (opts.famousLabelEnabled ?? true) : false,
    };
  }
  const structureItems: Record<string, { enabled: boolean; labelEnabled: boolean }> = {};
  for (const id of STRUCTURE_IDS) structureItems[id] = { enabled: true, labelEnabled: true };
  return {
    galaxyCatalogs: { items: galaxyItems },
    starCatalogs: { enabled: true, items: starCatalogItems() },
    bodies: { items: bodyItems() },
    structures: { enabled: true, items: structureItems },
    milkyWay: { enabled: opts.milkyWayEnabled ?? true, labelEnabled: true },
    volumes: { enabled: true, items: {} },
    filaments: { enabled: true },
    flow: { enabled: true },
    orbitTrails: { enabled: opts.orbitTrailsEnabled ?? true },
  } as unknown as EngineSettingsState;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('seedFades', () => {
  // ── milkyWay disk gating ─────────────────────────────────────────

  it('seeds the milkyWay disk at 1 when settings.milkyWay.enabled', () => {
    const state = makeState({ milkyWayEnabled: true });
    seedFades(state);
    expect(state.subsystems.fades.opacityOf({ kind: 'milkyWay' })).toBe(1);
  });

  it('seeds the milkyWay disk at 0 when disabled', () => {
    // A default-off session must not flash the Milky Way on frame 1.
    const state = makeState({ milkyWayEnabled: false });
    seedFades(state);
    expect(state.subsystems.fades.opacityOf({ kind: 'milkyWay' })).toBe(0);
  });

  // ── proceduralDisks + texturedDisks ──────────────────────────────

  it('seeds proceduralDisks and texturedDisks at 1', () => {
    const state = makeState();
    seedFades(state);
    expect(state.subsystems.fades.opacityOf({ kind: 'overlay', id: 'proceduralDisks' })).toBe(1);
    expect(state.subsystems.fades.opacityOf({ kind: 'overlay', id: 'texturedDisks' })).toBe(1);
  });

  // ── volumesMaster gating ─────────────────────────────────────────

  it('seeds volumesMaster at 1 when settings.volumes.enabled', () => {
    const state = makeState({ volumesMasterEnabled: true });
    seedFades(state);
    expect(state.subsystems.fades.opacityOf({ kind: 'volumesMaster' })).toBe(1);
  });

  it('seeds volumesMaster at 0 when settings.volumes.enabled is false', () => {
    const state = makeState({ volumesMasterEnabled: false });
    seedFades(state);
    expect(state.subsystems.fades.opacityOf({ kind: 'volumesMaster' })).toBe(0);
  });

  // ── label-layer handles ──────────────────────────────────────────

  it('seeds the milkyWay label from settings.milkyWay.labelEnabled (on → 1)', () => {
    const state = makeState({ milkyWayLabelEnabled: true });
    seedFades(state);
    expect(state.subsystems.fades.opacityOf({ kind: 'labelLayer', layer: 'milkyWay' })).toBe(1);
  });

  it('seeds the milkyWay label at 0 when settings.milkyWay.labelEnabled is false', () => {
    const state = makeState({ milkyWayLabelEnabled: false });
    seedFades(state);
    expect(state.subsystems.fades.opacityOf({ kind: 'labelLayer', layer: 'milkyWay' })).toBe(0);
  });

  it('seeds galaxy (surveyLabel) and scaleBar at 1', () => {
    // Famous-galaxy labels reuse the galaxy layer and consume its opacity
    // directly, so a 0 would hide them. scaleBar is React-side / tour-addressable,
    // never auto-faded by the engine, so it starts at 1.
    const state = makeState();
    seedFades(state);
    expect(state.subsystems.fades.opacityOf({ kind: 'labelLayer', layer: 'galaxy' })).toBe(1);
    expect(state.subsystems.fades.opacityOf({ kind: 'labelLayer', layer: 'scaleBar' })).toBe(1);
  });

  it('seeds the surveyLabel (galaxy) handle from famousGalaxy.labelEnabled', () => {
    // Wired THROUGH seedFades (not just the row.seed unit call): the galaxy
    // layer's frame-1 opacity must honour the persisted famous-label toggle so a
    // labels-off session doesn't flash them on.
    const off = makeState({ surveyLabelEnabled: false });
    seedFades(off);
    expect(off.subsystems.fades.opacityOf({ kind: 'labelLayer', layer: 'galaxy' })).toBe(0);

    const on = makeState();
    seedFades(on);
    expect(on.subsystems.fades.opacityOf({ kind: 'labelLayer', layer: 'galaxy' })).toBe(1);
  });

  // ── per-structure ring + label handles ───────────────────────────

  // ── the body caption domain ──────────────────────────────────────

  it("`hide(['labels'])` reaches every caption-bearing body and no other", () => {
    // Two totalities in one assertion, both of which fail SILENTLY. Under-reach:
    // a body that captions itself but has no handle survives a cue that claims to
    // have hidden every label — the gap `LAYER_GROUPS.labels` exists to close.
    // Over-reach: the S-stars draw 39 dots and no names, so a handle for them
    // would be a controller with no caption to move, and its `item` is not even a
    // `LabelCategory`. The expected set is derived from the registry's
    // `bearsLabel` capability, never hand-listed.
    expect(expandVisibilityLayers(['labels'])).toContain('bodyLabel');

    const captionBearingBodyIds = SOURCE_ENTRIES.filter(
      (entry) => entry.type === 'body' && entry.bearsLabel,
    ).map((entry) => entry.id);
    const state = makeState();
    seedFades(state);
    const reached = rowFor('bodyLabel').expand(state);

    expect([...reached].sort()).toEqual([...captionBearingBodyIds].sort());
    expect(reached).not.toContain('s-star');
  });

  it('seeds a ring + label handle per structure source, defaulting to 1', () => {
    const state = makeState();
    seedFades(state);
    for (const id of STRUCTURE_IDS) {
      expect(
        state.subsystems.fades.opacityOf({ kind: 'structure', id }),
        `structure{${id}} ring should seed at 1`,
      ).toBe(1);
      expect(
        state.subsystems.fades.opacityOf({ kind: 'labelLayer', layer: 'structure', item: id }),
        `labelLayer{structure,${id}} should seed at 1`,
      ).toBe(1);
    }
  });

  it('seeds a disabled ring at 0 and a disabled label at 0', () => {
    // The persisted per-category visibility is honoured from frame 1: a ring or
    // label the user turned off seeds at 0 so it doesn't flash before a fade.
    const ring = STRUCTURE_IDS[0]!;
    const label = STRUCTURE_IDS[STRUCTURE_IDS.length - 1]!;
    const state = makeState({
      ringVisibility: { [ring]: false },
      labelVisibility: { [label]: false },
    });
    seedFades(state);
    expect(state.subsystems.fades.opacityOf({ kind: 'structure', id: ring })).toBe(0);
    expect(
      state.subsystems.fades.opacityOf({ kind: 'labelLayer', layer: 'structure', item: label }),
    ).toBe(0);
  });

  // ── demand-loaded sets (seed 0 so first-load fade-in isn't lost) ──

  it('seeds every galaxy catalog at 0', () => {
    const state = makeState();
    seedFades(state);
    for (const id of GALAXY_CATALOG_IDS) {
      expect(
        state.subsystems.fades.opacityOf({ kind: 'galaxyCatalog', id }),
        `galaxyCatalog{${id}} should seed at 0`,
      ).toBe(0);
    }
  });

  it('seeds the filament and flow handles at 0', () => {
    const state = makeState();
    seedFades(state);
    expect(state.subsystems.fades.opacityOf({ kind: 'filament' })).toBe(0);
    expect(state.subsystems.fades.opacityOf({ kind: 'flow' })).toBe(0);
  });

  it('seeds orbitTrails from its toggle (NOT demand-loaded) — 1 on, 0 off', () => {
    // Unlike filament/flow, the orbit-trails conic table is a compile-time
    // constant with no asset slot, so its fade is settings-derived like
    // milkyWayDisk: a default-on session registers at 1 (no fade-in), a hidden
    // one at 0 (no frame-1 flash) — NOT the demand-loaded seed-0 rule.
    const on = makeState({ orbitTrailsEnabled: true });
    seedFades(on);
    expect(on.subsystems.fades.opacityOf({ kind: 'orbitTrails' })).toBe(1);

    const off = makeState({ orbitTrailsEnabled: false });
    seedFades(off);
    expect(off.subsystems.fades.opacityOf({ kind: 'orbitTrails' })).toBe(0);
  });

  it('survey row has no post — masks are a pure per-frame derivation', () => {
    // The draw/pick bitmasks are no longer cached state recomputed on toggle;
    // `deriveSourceMasks` projects them on read (per-frame in `runFrame`, fresh
    // at click time). So the survey row carries NO `post` — a toggle just fades
    // the catalog handle, and the next frame's derivation picks up the new
    // enabled set on its own.
    const surveyRow = rowFor('survey');
    expect(surveyRow.post).toBeUndefined();
  });

  it('seeds EVERY volume field at 0, including DEV debug fixtures', () => {
    const state = makeState();
    seedFades(state);
    // Derive the expected set from the registry — every type:'volume' entry,
    // INCLUDING the binBaseName:null debug fixtures. Not hardcoded. The
    // inclusion of the debug ids is load-bearing: setVolumeFieldEnabled +
    // the debug slot commit both fadeTo these handles, and fadeTo throws on
    // an unregistered id, so a missing debug handle breaks the DEV toggle.
    const volumeIds = Object.values(SOURCE_REGISTRY)
      .filter((e) => e.type === 'volume')
      .map((e) => e.id);
    expect(volumeIds.length).toBeGreaterThan(0);
    for (const id of volumeIds) {
      expect(
        state.subsystems.fades.opacityOf({ kind: 'volumeField', id }),
        `volumeField{${id}} should seed at 0`,
      ).toBe(0);
    }
    // Regression lock: at least one binBaseName:null debug fixture is present
    // in the iterated set and seeds at 0. This is the gap Part C fixed — before
    // it, debug fixtures were excluded and their fadeTo threw under DEV.
    const debugIds = Object.values(SOURCE_REGISTRY)
      .filter((e) => e.type === 'volume' && e.binBaseName === null)
      .map((e) => e.id);
    expect(debugIds.length).toBeGreaterThan(0);
    for (const id of debugIds) {
      expect(
        state.subsystems.fades.opacityOf({ kind: 'volumeField', id }),
        `debug volumeField{${id}} should seed at 0`,
      ).toBe(0);
    }
  });
});

// ── Intent-subset closures ───────────────────────────────────────────
//
// The intent rows carry the optional read/post/guard closures; the
// register-only rows must not. These tests assert the closures are present and
// behave as the contract: intent reads a leaf, plus the per-row post/guard
// side effects.

describe('FADE_LAYERS intent subset', () => {
  const INTENT_KEYS: readonly VisibilityLayerKey[] = [
    'survey',
    'surveyLabel',
    'structureRing',
    'structureLabel',
    'volumeField',
    'volumesMaster',
    'filaments',
    'orbitTrails',
    'milkyWayDisk',
    'milkyWayLabel',
    'flow',
  ];
  const REGISTRATION_ONLY_KEYS: readonly VisibilityLayerKey[] = [
    'proceduralDisks',
    'texturedDisks',
    'scaleBar',
  ];

  it('every intent row exposes intent; register-only rows do not', () => {
    for (const key of INTENT_KEYS) {
      const row = rowFor(key);
      expect(typeof row.intent, `${key}.intent`).toBe('function');
    }
    for (const key of REGISTRATION_ONLY_KEYS) {
      const row = rowFor(key);
      expect(row.intent, `${key}.intent`).toBeUndefined();
    }
  });

  it('survey row intent reads galaxyCatalogs.items[id].enabled', () => {
    const row = rowFor('survey');
    expect(row.intent?.(makeSettings({ sdssEnabled: false }), 'sdss')).toBe(false);
    expect(row.intent?.(makeSettings({ sdssEnabled: true }), 'sdss')).toBe(true);
  });

  it('surveyLabel row intent reads famousGalaxy.labelEnabled', () => {
    const row = rowFor('surveyLabel');
    expect(row.intent?.(makeSettings({ famousLabelEnabled: false }), undefined)).toBe(false);
    expect(row.intent?.(makeSettings({ famousLabelEnabled: true }), undefined)).toBe(true);
  });

  it('orbitTrails row intent + seed follow settings.orbitTrails.enabled', () => {
    const row = rowFor('orbitTrails');
    expect(row.intent?.(makeSettings({ orbitTrailsEnabled: false }), undefined)).toBe(false);
    expect(row.intent?.(makeSettings({ orbitTrailsEnabled: true }), undefined)).toBe(true);
    // Settings-derived seed (no demand-loaded guard): on → 1, off → 0.
    expect(row.seed(makeSettings({ orbitTrailsEnabled: false }), undefined)).toBe(0);
    expect(row.seed(makeSettings({ orbitTrailsEnabled: true }), undefined)).toBe(1);
    // And no guard — the conic table is always present (unlike flow/filaments).
    expect(row.guard).toBeUndefined();
  });

  it('surveyLabel seed follows famousGalaxy.labelEnabled', () => {
    const row = rowFor('surveyLabel');
    expect(row.seed(makeSettings({ famousLabelEnabled: false }), undefined)).toBe(0);
    expect(row.seed(makeSettings({ famousLabelEnabled: true }), undefined)).toBe(1);
  });

  it('volume-field row post lazy-loads debug volumes on enable only', () => {
    const load = vi.fn<(req: unknown) => void>();
    const slot = {
      state: () => ({ kind: 'idle' }) as const,
      load,
    };
    function makeVolumeState(enabled: boolean): EngineState {
      return {
        assetSlots: { syntheticVolumes: { 'debug-gaussian': slot } },
        settings: { volumes: { items: { 'debug-gaussian': { enabled } } } },
      } as unknown as EngineState;
    }
    const row = rowFor('volumeField');

    row.post?.(makeVolumeState(true), 'debug-gaussian');
    expect(load).toHaveBeenCalledTimes(1);

    load.mockClear();
    row.post?.(makeVolumeState(false), 'debug-gaussian');
    expect(load).not.toHaveBeenCalled();
  });

  it('flow row guard gates on the renderer’s fieldLoaded()', () => {
    const row = rowFor('flow');
    const fieldLoaded = vi.fn<() => boolean>(() => false);
    const state = {
      gpu: { flowFieldRenderer: { fieldLoaded } },
    } as unknown as EngineState;
    expect(row.guard?.(state, undefined)).toBe(false);
    fieldLoaded.mockReturnValue(true);
    expect(row.guard?.(state, undefined)).toBe(true);
  });

  it('survey row guard gates on the renderer holding the catalog', () => {
    // Same demand-loaded pattern as flow/filaments/volumeField: a catalog
    // whose .bin is still downloading must not burn its fade window.
    const row = rowFor('survey');
    const state = {
      gpu: { renderer: { hasCatalog: (id: string) => id === '2mrs' } },
    } as unknown as EngineState;
    expect(row.guard?.(state, 'sdss')).toBe(false);
    expect(row.guard?.(state, '2mrs')).toBe(true);
    // No renderer yet (mid-bootstrap) → suppressed.
    expect(row.guard?.({ gpu: {} } as unknown as EngineState, 'sdss')).toBe(false);
  });

  it('filaments row guard gates on the renderer’s hasCloud()', () => {
    // Same demand-loaded pattern as flow: with no skeleton uploaded, a fade
    // toward "visible" must be suppressed — otherwise an authored slow reveal
    // ramps invisibly during the download and the commit-time default fade
    // stomps it (the beat-05 pop-in).
    const row = rowFor('filaments');
    const hasCloud = vi.fn<() => boolean>(() => false);
    const state = {
      gpu: { filamentRenderer: { hasCloud } },
    } as unknown as EngineState;
    expect(row.guard?.(state, undefined)).toBe(false);
    hasCloud.mockReturnValue(true);
    expect(row.guard?.(state, undefined)).toBe(true);
  });

  it('constellations row guard gates on the renderer’s hasData()', () => {
    // Same demand-loaded pattern as filaments/flow: the row seeds at 0 and its
    // fade must stay suppressed until the artifact is uploaded (hasData true).
    // The slot commit uploads then kicks the fade through the bridge — the guard
    // is already satisfied at that point (Bug 1 fix).
    const row = rowFor('constellations');
    const hasData = vi.fn<() => boolean>(() => false);
    const state = {
      gpu: { constellationRenderer: { hasData } },
    } as unknown as EngineState;
    expect(row.guard?.(state, undefined)).toBe(false);
    hasData.mockReturnValue(true);
    expect(row.guard?.(state, undefined)).toBe(true);
    // No renderer yet (mid-bootstrap) → suppressed.
    expect(row.guard?.({ gpu: {} } as unknown as EngineState, undefined)).toBe(false);
  });

  it('volume-field row guard gates on the renderer holding the field; debug fixtures exempt', () => {
    const row = rowFor('volumeField');
    const state = {
      gpu: { volumeFieldRenderer: { listIds: () => ['cf4-density'] } },
    } as unknown as EngineState;
    // Not in the renderer's map → suppressed; present → fades.
    expect(row.guard?.(state, 'mcpm')).toBe(false);
    expect(row.guard?.(state, 'cf4-density')).toBe(true);
    // Debug fixtures are loaded BY this row's own post (maybeLazyLoadDebugVolume),
    // and a guard skips post — so they are never suppressed.
    expect(row.guard?.(state, 'debug-gaussian')).toBe(true);
    // No renderer yet (mid-bootstrap): demand-loaded ids suppressed, debug exempt.
    const bare = { gpu: {} } as unknown as EngineState;
    expect(row.guard?.(bare, 'mcpm')).toBe(false);
    expect(row.guard?.(bare, 'debug-gaussian')).toBe(true);
  });
});
