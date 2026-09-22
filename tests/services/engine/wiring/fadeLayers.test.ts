/**
 * fadeLayers — the manifest's seed values, the load-bearing pair being that a
 * default-off session must not flash its layer on frame 1 and that demand-loaded
 * rows seed at 0 so their first-load `fadeTo(1)` still fades in.
 *
 * The fixture carries a REAL fade registry, so the assertions read `opacityOf`
 * rather than counting `register` spy calls.
 */

import { describe, it, expect, vi } from 'vitest';
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
import { VISIBILITY_ACTION_ROW } from '../../../../src/services/animation/visibilityActionRow';
import { galaxyCatalogFadeRows } from '../../../../src/layers/galaxyCatalog/present/galaxyCatalogFadeRows';
import { zoneOfAvoidanceFadeRows } from '../../../../src/layers/zoneOfAvoidance/present/zoneOfAvoidanceFadeRows';
import type { GalaxyCatalogRuntime } from '../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime';

/** The galaxyCatalog Layer's rows are half of the composed manifest; its own suite covers their behaviour. */
const GALAXY_RUNTIME = {
  pointRenderer: { hasCatalog: () => true },
} as unknown as GalaxyCatalogRuntime;

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
    // `seedFades` walks the COMPOSED rows; over an empty layer tuple that is
    // the core manifest these tests are written against.
    fadeRows: FADE_LAYERS,
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

  it('seeds the milkyWay disk at 0 when disabled', () => {
    // A default-off session must not flash the Milky Way on frame 1.
    const state = makeState({ milkyWayEnabled: false });
    seedFades(state);
    expect(state.subsystems.fades.opacityOf({ kind: 'milkyWay' })).toBe(0);
  });

  // ── volumesMaster gating ─────────────────────────────────────────

  // ── label-layer handles ──────────────────────────────────────────

  it('seeds the milkyWay label at 0 when settings.milkyWay.labelEnabled is false', () => {
    const state = makeState({ milkyWayLabelEnabled: false });
    seedFades(state);
    expect(state.subsystems.fades.opacityOf({ kind: 'labelLayer', layer: 'milkyWay' })).toBe(0);
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

  it('seeds EVERY volume field at 0', () => {
    const state = makeState();
    seedFades(state);
    // Derive the expected set from the registry — every type:'volume' entry.
    // Not hardcoded.
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
  });
});

// ── Intent-subset closures ───────────────────────────────────────────
//
// The intent rows carry the optional read/post/guard closures; the
// register-only rows must not. These tests assert the closures are present and
// behave as the contract: intent reads a leaf, plus the per-row post/guard
// side effects.

describe('FADE_LAYERS intent subset', () => {
  it('a row drives a fade iff its layer writes a setting', () => {
    // FADE_LAYERS and VISIBILITY_ACTION_ROW deliberately don't merge (they
    // close over different domains — EngineState vs settings-item id lists),
    // but they agree on one thing: a row exposes `intent` exactly when its
    // VISIBILITY_ACTION_ROW counterpart has a real settings write. `actions`
    // is the surviving shared truth after `writes` (Task 5) went: total, and
    // `[]` unconditionally for the three registration-only layers, non-empty
    // for every real write given a settings fixture whose per-item records
    // are populated (volumeField's fan-out needs at least one item id).
    const settings = makeSettings();
    settings.volumes.items = {
      mcpm: { enabled: true },
    } as unknown as EngineSettingsState['volumes']['items'];
    for (const row of [
      ...FADE_LAYERS,
      ...galaxyCatalogFadeRows(GALAXY_RUNTIME),
      ...zoneOfAvoidanceFadeRows(),
    ]) {
      const writesASetting = VISIBILITY_ACTION_ROW[row.key].actions(true, settings).length > 0;
      expect(row.intent === undefined, `${row.key}: intent vs actions`).toBe(!writesASetting);
    }
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

  it('volume-field row guard gates on the renderer holding the field', () => {
    const row = rowFor('volumeField');
    const state = {
      gpu: { volumeFieldRenderer: { listIds: () => ['cf4-density'] } },
    } as unknown as EngineState;
    // Not in the renderer's map → suppressed; present → fades.
    expect(row.guard?.(state, 'mcpm')).toBe(false);
    expect(row.guard?.(state, 'cf4-density')).toBe(true);
    // No renderer yet (mid-bootstrap): demand-loaded ids suppressed.
    const bare = { gpu: {} } as unknown as EngineState;
    expect(row.guard?.(bare, 'mcpm')).toBe(false);
  });
});
