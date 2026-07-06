import { describe, expect, it, vi } from 'vitest';
import { produceFamousLabels } from '../../../../src/services/engine/presentation/produceFamousLabels';
import { LABEL_RECESSION } from '../../../../src/services/engine/presentation/focusRecession';
import { createEngineData } from '../../../../src/services/engine/data/createEngineData';
import { createFadeRegistry } from '../../../../src/services/animation/fadeRegistry';
import { Source } from '../../../../src/data/sources';
import type { FadeRegistry } from '../../../../src/@types/animation/FadeRegistry';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { FamousMetaEntry } from '../../../../src/@types/loading/FamousMetaEntry';

// Convenience factory used wherever the test doesn't care about wake behavior.
function makeRegistry(): FadeRegistry {
  return createFadeRegistry({ requestRender: () => {} });
}

// produceFamousLabels reads `state.data.galaxies` for the records,
// `state.subsystems.fades` for the `galaxyNames` opacity (read-only), and
// `state.settings.galaxyCatalogs.items.famousGalaxy.labelEnabled` for the
// visibility gate. The fixture supplies all three; the `galaxyNames` handle is
// registered at 1 so the at-rest opacity is 1. The famous label gate defaults
// visible.
function makeState(
  opts: { fades?: FadeRegistry; focusedOnly?: boolean; focus?: object | null } = {},
): EngineState {
  const fades = opts.fades ?? makeRegistry();
  fades.register({ kind: 'labelLayer', layer: 'galaxyNames' }, 1);
  return {
    data: createEngineData(),
    subsystems: {
      fades,
      // clipPlayer is non-nullable; return factor 1 so the clip channel is
      // behaviour-neutral and existing assertions are unaffected.
      clipPlayer: {
        tick: vi.fn<(nowMs: number) => void>(),
        stop: vi.fn<() => void>(),
        clipOpacityOf: vi.fn<(layer: string, nowMs: number) => number>(() => 1),
        destroy: vi.fn<() => void>(),
      },
    },
    selection: { focus: opts.focus ?? null, select: null, hover: null },
    settings: {
      galaxyCatalogs: { items: { famousGalaxy: { enabled: true, labelEnabled: true } } },
      labels: { focusedOnly: opts.focusedOnly ?? false },
    },
  } as unknown as EngineState;
}

function makeCtx(over: Partial<ReadyFrameContext> = {}): ReadyFrameContext {
  return {
    drawCamPos: [0, 0, 0],
    canvasSize: { width: 1920, height: 1080 },
    drawPxPerRad: 1080 / (2 * Math.tan((60 * Math.PI) / 180 / 2)),
    fovYRad: (60 * Math.PI) / 180,
    focusBlend: 0,
    ...over,
  } as unknown as ReadyFrameContext;
}

// pxPerRad the producer derives from the ctx above (= drawPxPerRad).
const PX_PER_RAD = 1080 / (2 * Math.tan((30 * Math.PI) / 180));
const sizePxAt = (diameterKpc: number, distanceMpc: number) =>
  (diameterKpc / (distanceMpc * 1000)) * PX_PER_RAD;

const meta = (...entries: Partial<FamousMetaEntry>[]): FamousMetaEntry[] =>
  entries.map((e) => ({ id: 'x', names: [], description: '', type: '', ...e }) as FamousMetaEntry);

const famousCatalog = (positions: number[], diameters: number[]): GalaxyCatalog =>
  ({
    count: diameters.length,
    positions: new Float32Array(positions),
    diameterKpc: new Float32Array(diameters),
  }) as unknown as GalaxyCatalog;

function seed(
  state: EngineState,
  entries: Partial<FamousMetaEntry>[],
  positions: number[],
  diameters: number[],
): void {
  state.data.galaxies.setFamousMeta(meta(...entries));
  state.data.galaxies.setCatalog(Source.FamousGalaxy, famousCatalog(positions, diameters));
}

describe('produceFamousLabels', () => {
  it('emits a lifted label + anchor line for a galaxy above the size gate', () => {
    const state = makeState();
    // 120 kpc galaxy at 10 Mpc → ~11.2 px (above the 6 px gate, full alpha).
    seed(state, [{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
    const out = produceFamousLabels(state, makeCtx());

    expect(out.labels.map((l) => l.id)).toEqual(['famous-m31']);
    const label = out.labels[0]!;
    expect(label.text).toBe('M31');
    expect(label.alignX).toBe('center');
    expect(label.alignY).toBe('baseline');
    // offset = max(0.05, 1.5 × 0.12 Mpc) = 0.18; label lifts in +Y.
    expect(label.worldPos[1]).toBeCloseTo(0.18, 6);
    expect(label.fadeAlpha).toBe(1);
    expect(label.prominencePx).toBeCloseTo(sizePxAt(120, 10), 3);

    expect(out.lines.map((m) => m.id)).toEqual(['famous-m31-anchor']);
    // line runs from the dot to 75 % of the lift.
    expect(out.lines[0]!.toWorld[1]).toBeCloseTo(0.18 * 0.75, 6);
  });

  it('skips a galaxy whose apparent size is below the threshold', () => {
    const state = makeState();
    seed(state, [{ id: 'far', names: ['Far'] }], [100000, 0, 0], [40]);
    const out = produceFamousLabels(state, makeCtx());
    expect(out.labels).toEqual([]);
    expect(out.lines).toEqual([]);
  });

  it('emits nothing when famous labels are hidden AND the fade-out has completed', () => {
    // The gate is opacity-aware: hidden alone is not enough — the galaxyNames
    // fade must have reached 0 for the producer to fall silent. Simulate a
    // completed fade-out by forcing the handle to 0.
    const fades = makeRegistry();
    fades.register({ kind: 'labelLayer', layer: 'galaxyNames' }, 1);
    fades.setImmediate({ kind: 'labelLayer', layer: 'galaxyNames' }, 0);
    const state = makeState({ fades });
    seed(state, [{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
    state.settings.galaxyCatalogs.items.famousGalaxy.labelEnabled = false;
    expect(produceFamousLabels(state, makeCtx()).labels).toEqual([]);
  });

  it('keeps emitting while the galaxyNames fade-out tail is non-zero (no pop on toggle-out)', () => {
    // Toggle-off scenario mid-fade: the famous label gate is false but the
    // galaxyNames opacity is still ramping down (0.5 here). The producer must
    // KEEP emitting at the reduced alpha so the labels fade out smoothly.
    const midFade = makeRegistry();
    midFade.register({ kind: 'labelLayer', layer: 'galaxyNames' }, 1);
    midFade.setImmediate({ kind: 'labelLayer', layer: 'galaxyNames' }, 0.5);
    const fading = makeState({ fades: midFade });
    seed(fading, [{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
    fading.settings.galaxyCatalogs.items.famousGalaxy.labelEnabled = false;
    const out = produceFamousLabels(fading, makeCtx());
    expect(out.labels.map((l) => l.id)).toEqual(['famous-m31']);
    // Emitted at the half opacity (full distance-fade alpha here is 1 × 0.5).
    expect(out.labels[0]!.fadeAlpha).toBeCloseTo(0.5, 6);
    expect(out.lines[0]!.fadeAlpha).toBeCloseTo(0.5, 6);

    // Once the fade reaches 0, the producer falls silent.
    const done = makeRegistry();
    done.register({ kind: 'labelLayer', layer: 'galaxyNames' }, 1);
    done.setImmediate({ kind: 'labelLayer', layer: 'galaxyNames' }, 0);
    const settled = makeState({ fades: done });
    seed(settled, [{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
    settled.settings.galaxyCatalogs.items.famousGalaxy.labelEnabled = false;
    expect(produceFamousLabels(settled, makeCtx()).labels).toEqual([]);
  });

  it('emits nothing when the famous catalog is absent or meta is empty', () => {
    const noCatalog = makeState();
    noCatalog.data.galaxies.setFamousMeta(meta({ id: 'm31', names: ['M31'] }));
    expect(produceFamousLabels(noCatalog, makeCtx()).labels).toEqual([]);

    const noMeta = makeState();
    noMeta.data.galaxies.setCatalog(Source.FamousGalaxy, famousCatalog([10, 0, 0], [120]));
    expect(produceFamousLabels(noMeta, makeCtx()).labels).toEqual([]);
  });

  it('scales worldEmMpc with diameter (40 kpc anchors the category default)', () => {
    const state = makeState();
    // 40 kpc galaxy at 3 Mpc → ~12.5 px (full alpha); worldEm == reference.
    seed(state, [{ id: 'ref', names: ['Ref'] }], [3, 0, 0], [40]);
    const out = produceFamousLabels(state, makeCtx());
    expect(out.labels[0]!.worldEmMpc).toBeCloseTo(0.0125, 6);
  });

  it('bakes galaxyNames opacity into famous label fadeAlpha', () => {
    // At-rest (galaxyNames at 1) → full distance-fade alpha.
    const atRest = makeState();
    seed(atRest, [{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
    const atRestAlpha = produceFamousLabels(atRest, makeCtx()).labels[0]!.fadeAlpha!;

    // galaxyNames at 0.5 → half the at-rest alpha for label AND its anchor line.
    const fades = makeRegistry();
    fades.register({ kind: 'labelLayer', layer: 'galaxyNames' }, 1);
    fades.setImmediate({ kind: 'labelLayer', layer: 'galaxyNames' }, 0.5);
    const dimmed = makeState({ fades });
    seed(dimmed, [{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
    const out = produceFamousLabels(dimmed, makeCtx());

    expect(out.labels[0]!.fadeAlpha).toBeCloseTo(atRestAlpha * 0.5, 6);
    expect(out.lines[0]!.fadeAlpha).toBeCloseTo(atRestAlpha * 0.5, 6);
  });

  it('famous labels recede uniformly at blend > 0', () => {
    // No per-member exemption: every famous label is scaled by LABEL_RECESSION
    // at full blend (there is no focused-famous-structure path here).
    const atRest = makeState();
    seed(atRest, [{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
    const atRestAlpha = produceFamousLabels(atRest, makeCtx()).labels[0]!.fadeAlpha!;

    const focused = makeState();
    seed(focused, [{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
    const recededAlpha = produceFamousLabels(focused, makeCtx({ focusBlend: 1 })).labels[0]!
      .fadeAlpha!;

    expect(recededAlpha).toBeCloseTo(atRestAlpha * LABEL_RECESSION, 6);
  });

  it('anchor lines fade with their labels', () => {
    // The connector carries the same × layerAlpha factor as its label, at both
    // a dimmed opacity and under recession.
    const fades = makeRegistry();
    fades.register({ kind: 'labelLayer', layer: 'galaxyNames' }, 1);
    fades.setImmediate({ kind: 'labelLayer', layer: 'galaxyNames' }, 0.5);
    const state = makeState({ fades });
    seed(state, [{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
    const out = produceFamousLabels(state, makeCtx({ focusBlend: 1 }));

    expect(out.lines[0]!.fadeAlpha).toBeCloseTo(out.labels[0]!.fadeAlpha!, 6);
  });

  it('focusedOnly mode: emits only the focused famous galaxy', () => {
    // Two famous galaxies, both above the size gate; the focus ref addresses
    // catalog row 1 (m87). Only its label (and anchor line) survives.
    const state = makeState({
      focusedOnly: true,
      focus: { type: 'galaxyCatalog', source: Source.FamousGalaxy, index: 1 },
    });
    seed(
      state,
      [
        { id: 'm31', names: ['M31'] },
        { id: 'm87', names: ['M87'] },
      ],
      [10, 0, 0, 0, 10, 0],
      [120, 120],
    );
    const out = produceFamousLabels(state, makeCtx());
    expect(out.labels.map((l) => l.id)).toEqual(['famous-m87']);
    expect(out.lines.map((m) => m.id)).toEqual(['famous-m87-anchor']);
  });

  it('focusedOnly mode: emits nothing when the focus is not a famous galaxy', () => {
    const cases = [
      null,
      { type: 'structure', id: 'cluster-virgo' },
      { type: 'milkyWay' },
      { type: 'galaxyCatalog', source: Source.SDSS, index: 0 },
    ];
    for (const focus of cases) {
      const state = makeState({ focusedOnly: true, focus });
      seed(state, [{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
      expect(produceFamousLabels(state, makeCtx()).labels).toEqual([]);
    }
  });

  it('at-rest output is unchanged (galaxyNames at 1, blend 0)', () => {
    // Golden: galaxyNames at 1 × recession 1 (blend 0) ⇒ layerAlpha 1, so the
    // emitted fadeAlpha equals the raw distance-fade value (1 here).
    const state = makeState();
    seed(state, [{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
    const out = produceFamousLabels(state, makeCtx());
    expect(out.labels[0]!.fadeAlpha).toBe(1);
    expect(out.lines[0]!.fadeAlpha).toBe(1);
  });
});
