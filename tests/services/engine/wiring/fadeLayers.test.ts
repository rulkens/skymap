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
 *      `settings.milkyWay.labelEnabled`, galaxyNames + scaleBar at 1.
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
import { SOURCE_REGISTRY } from '../../../../src/data/sources';
import type { VisibilityLayerKey } from '../../../../src/@types/animation/VisibilityLayerKey';
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
function makeState(
  opts: {
    milkyWayEnabled?: boolean;
    milkyWayLabelEnabled?: boolean;
    volumesMasterEnabled?: boolean;
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
      structures: { enabled: true, items },
    },
    subsystems: {
      fades: createFadeRegistry({ requestRender: vi.fn<() => void>() }),
    },
  } as unknown as EngineState;
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

  it('seeds galaxyNames (surveyLabel) and scaleBar at 1', () => {
    // Famous-galaxy labels reuse galaxyNames and consume its opacity directly,
    // so a 0 would hide them. scaleBar is React-side / tour-addressable, never
    // auto-faded by the engine, so it starts at 1.
    const state = makeState();
    seedFades(state);
    expect(state.subsystems.fades.opacityOf({ kind: 'labelLayer', layer: 'galaxyNames' })).toBe(1);
    expect(state.subsystems.fades.opacityOf({ kind: 'labelLayer', layer: 'scaleBar' })).toBe(1);
  });

  // ── per-structure ring + label handles ───────────────────────────

  it('seeds a ring + label handle per structure source, defaulting to 1', () => {
    const state = makeState();
    seedFades(state);
    for (const id of STRUCTURE_IDS) {
      expect(
        state.subsystems.fades.opacityOf({ kind: 'structure', id }),
        `structure{${id}} ring should seed at 1`,
      ).toBe(1);
      expect(
        state.subsystems.fades.opacityOf({ kind: 'labelLayer', layer: 'structure', category: id }),
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
      state.subsystems.fades.opacityOf({ kind: 'labelLayer', layer: 'structure', category: label }),
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

  it('seeds every resident volume field at 0', () => {
    const state = makeState();
    seedFades(state);
    // Derive the expected resident set from the registry — the same exclusion
    // seedFades applies (type:'volume' && binBaseName !== null). Not hardcoded.
    const residentVolumeIds = Object.values(SOURCE_REGISTRY)
      .filter((e) => e.type === 'volume' && e.binBaseName !== null)
      .map((e) => e.id);
    expect(residentVolumeIds.length).toBeGreaterThan(0);
    for (const id of residentVolumeIds) {
      expect(
        state.subsystems.fades.opacityOf({ kind: 'volumeField', id }),
        `volumeField{${id}} should seed at 0`,
      ).toBe(0);
    }
  });
});
