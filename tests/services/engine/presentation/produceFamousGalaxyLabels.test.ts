import { describe, expect, it, vi } from 'vitest';
import { mat4 } from 'wgpu-matrix';
import { produceFamousGalaxyLabels } from '../../../../src/services/engine/presentation/produceFamousGalaxyLabels';
import { LABEL_RECESSION } from '../../../../src/services/engine/presentation/focusRecession';
import { FAMOUS_LABEL_STYLE } from '../../../../src/services/engine/presentation/famousLabelStyle';
import {
  LEADER_LINE_PADDING_PX,
  MIN_LABEL_CLEARANCE_PX,
} from '../../../../src/services/engine/presentation/leaderLineStyle';
import { createEngineData } from '../../../../src/services/engine/data/createEngineData';
import { createFadeRegistry } from '../../../../src/services/animation/fadeRegistry';
import { ATLAS_FONT_SIZE } from '../../../../src/data/fonts';
import { Source } from '../../../../src/data/sources';
import { unpackPick } from '../../../../src/data/selectionEncoding';
import type { FadeRegistry } from '../../../../src/@types/animation/FadeRegistry';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { FamousGalaxyMetaEntry } from '../../../../src/@types/loading/FamousGalaxyMetaEntry';
import type { Label2D } from '../../../../src/@types/rendering/Label2D';
import type { LabelBBox } from '../../../../src/@types/rendering/LabelBBox';

// Convenience factory used wherever the test doesn't care about wake behavior.
function makeRegistry(): FadeRegistry {
  return createFadeRegistry({ requestRender: () => {} });
}

// Measured ink bbox the labelRenderer stub reports (atlas px, anchor-relative,
// +Y down). maxY = 12 puts the text's true bottom 12 atlas px BELOW the
// baseline anchor (a descender), which the producer scales by the em clamp to
// place the line top — nonzero so the tests bite on that scaling.
const MEASURED_BBOX: LabelBBox = { minX: -50, minY: -30, maxX: 50, maxY: 12 };

// Screen offset of the text's true bottom BELOW the label anchor: bbox.maxY
// scaled by displayEmPx / ATLAS_FONT_SIZE. At the fixture distances the
// projected em (worldEm/clipW · h/2, a few px) is far below the style's
// minPixelSize, so the clamp pins displayEmPx to exactly that minimum.
const TEXT_BOTTOM_BELOW_ANCHOR_PX =
  MEASURED_BBOX.maxY * (FAMOUS_LABEL_STYLE.minPixelSize / ATLAS_FONT_SIZE);

// produceFamousGalaxyLabels reads `state.famousGalaxiesMeta` for the sidecar records and
// `state.data.galaxies` for the positional catalog, `state.subsystems.fades`
// for the `galaxy` layer opacity (read-only),
// `state.settings.galaxyCatalogs.items.famousGalaxy.labelEnabled` for the
// visibility gate, and `state.gpu.labelRenderer.measure` for the caption's ink
// bbox (which places the leader-line top). The fixture supplies all five; the
// `galaxy` handle is registered at 1 so the at-rest opacity is 1. The
// famous label gate defaults visible.
function makeState(
  opts: {
    fades?: FadeRegistry;
    focusedOnly?: boolean;
    focus?: object | null;
    bbox?: LabelBBox;
  } = {},
): EngineState {
  const fades = opts.fades ?? makeRegistry();
  fades.register({ kind: 'labelLayer', layer: 'galaxy' }, 1);
  const bbox = opts.bbox ?? MEASURED_BBOX;
  return {
    data: createEngineData(),
    famousGalaxiesMeta: [],
    gpu: { labelRenderer: { measure: vi.fn<(label: Label2D) => LabelBBox>(() => bbox) } },
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

// View-projection matching the ctx below: camera at the origin looking down
// +X (toward the seeded galaxies at [10, 0, 0]), 60° vertical fov, 16:9.
// The producer projects through this to compute the screen-space label lift.
const VP = mat4.multiply(
  mat4.perspective((60 * Math.PI) / 180, 1920 / 1080, 0.1, 1000),
  mat4.lookAt([0, 0, 0], [1, 0, 0], [0, 1, 0]),
) as Float32Array;

/** Project a world point through VP to screen pixels (screen +Y down). */
function screenOf(p: readonly number[]): [number, number] {
  const clipX = VP[0]! * p[0]! + VP[4]! * p[1]! + VP[8]! * p[2]! + VP[12]!;
  const clipY = VP[1]! * p[0]! + VP[5]! * p[1]! + VP[9]! * p[2]! + VP[13]!;
  const clipW = VP[3]! * p[0]! + VP[7]! * p[1]! + VP[11]! * p[2]! + VP[15]!;
  return [(clipX / clipW / 2 + 0.5) * 1920, (1 - (clipY / clipW / 2 + 0.5)) * 1080];
}

function makeCtx(over: Partial<ReadyFrameContext> = {}): ReadyFrameContext {
  return {
    drawCamPos: [0, 0, 0],
    vp: VP,
    canvasSize: { width: 1920, height: 1080 },
    drawPxPerRad: 1080 / (2 * Math.tan((60 * Math.PI) / 180 / 2)),
    fovYRad: (60 * Math.PI) / 180,
    focusBlend: 0,
    nowMs: 0,
    ...over,
  } as unknown as ReadyFrameContext;
}

// pxPerRad the producer derives from the ctx above (= drawPxPerRad).
const PX_PER_RAD = 1080 / (2 * Math.tan((30 * Math.PI) / 180));
const sizePxAt = (diameterKpc: number, distanceMpc: number) =>
  (diameterKpc / (distanceMpc * 1000)) * PX_PER_RAD;

const meta = (...entries: Partial<FamousGalaxyMetaEntry>[]): FamousGalaxyMetaEntry[] =>
  entries.map(
    (e) => ({ id: 'x', names: [], description: '', type: '', ...e }) as FamousGalaxyMetaEntry,
  );

const famousCatalog = (positions: number[], diameters: number[]): GalaxyCatalog =>
  ({
    count: diameters.length,
    positions: new Float32Array(positions),
    diameterKpc: new Float32Array(diameters),
  }) as unknown as GalaxyCatalog;

// `famousGalaxiesMeta` is readonly on `EngineState` (the getter delegates to
// the Redux store in the real engine); the fixture is a plain object
// literal, so writing through a mutable-view cast is the direct way to seed
// it here.
function setFamousGalaxiesMeta(
  state: EngineState,
  entries: Partial<FamousGalaxyMetaEntry>[],
): void {
  (state as unknown as { famousGalaxiesMeta: FamousGalaxyMetaEntry[] }).famousGalaxiesMeta = meta(
    ...entries,
  );
}

function seed(
  state: EngineState,
  entries: Partial<FamousGalaxyMetaEntry>[],
  positions: number[],
  diameters: number[],
): void {
  setFamousGalaxiesMeta(state, entries);
  state.data.galaxies.setCatalog(Source.FamousGalaxy, famousCatalog(positions, diameters));
}

describe('produceFamousGalaxyLabels', () => {
  it('emits a lifted label + anchor line for a galaxy above the size gate', () => {
    const state = makeState();
    // 120 kpc galaxy at 5 Mpc → ~22.4 px apparent size: comfortably above the
    // 6 px gate AND in the proportional-lift regime (1.5 × 22.4 ≈ 33.7 px sits
    // above the clearance-raised floor of 28 + ~4.3 px ink drop, so neither
    // floor bites in this test).
    seed(state, [{ id: 'm31', names: ['M31'] }], [5, 0, 0], [120]);
    const out = produceFamousGalaxyLabels(state, makeCtx());

    expect(out.labels.map((l) => l.id)).toEqual(['famous-m31']);
    const label = out.labels[0]!;
    expect(label.text).toBe('M31');
    expect(label.alignX).toBe('center');
    expect(label.alignY).toBe('baseline');
    // Screen-space lift: liftPx = 1.5 × the apparent size — proportional. The
    // label anchor projects to exactly liftPx straight up from the dot
    // (screen +Y is down), at any camera orientation.
    // Precision 2 (±0.005 px) absorbs the f32 project→un-project round trip.
    const liftPx = 1.5 * sizePxAt(120, 5);
    const dot = screenOf([5, 0, 0]);
    const anchor = screenOf(label.worldPos);
    expect(anchor[0]).toBeCloseTo(dot[0], 2);
    expect(dot[1] - anchor[1]).toBeCloseTo(liftPx, 2);
    expect(label.fadeAlpha).toBe(1);
    expect(label.prominencePx).toBeCloseTo(sizePxAt(120, 5), 3);

    // Leader present, from the dot up to exactly the padding below the
    // text's measured bottom.
    expect(label.leader).toBeDefined();
    expect(label.leader!.fromWorld).toEqual([5, 0, 0]);
    const tip = screenOf(label.leader!.toWorld);
    expect(tip[0]).toBeCloseTo(dot[0], 2);
    expect(tip[1] - anchor[1]).toBeCloseTo(TEXT_BOTTOM_BELOW_ANCHOR_PX + LEADER_LINE_PADDING_PX, 2);
  });

  it('keeps the line top exactly the padding below the label bottom at any lift', () => {
    // The structural invariant: the line top DERIVES from the measured text
    // bottom minus the padding, so the gap is identical at different lifts.
    // Two distances in the proportional regime → two lifts (~33.7 px and
    // ~42.1 px); the old fraction-of-the-lift geometry would have produced
    // two different gaps (0.25 × lift), so this discriminates derivation from
    // coincidence.
    for (const distanceMpc of [5, 4]) {
      const state = makeState();
      seed(state, [{ id: 'm31', names: ['M31'] }], [distanceMpc, 0, 0], [120]);
      const out = produceFamousGalaxyLabels(state, makeCtx());

      const anchor = screenOf(out.labels[0]!.worldPos);
      const tip = screenOf(out.labels[0]!.leader!.toWorld);
      expect(tip[1] - anchor[1]).toBeCloseTo(
        TEXT_BOTTOM_BELOW_ANCHOR_PX + LEADER_LINE_PADDING_PX,
        2,
      );
    }
  });

  it('floors the lift so a tiny galaxy caption keeps the ink clearance', () => {
    // 120 kpc at 17 Mpc → ~6.6 px apparent size (the M110 case): the
    // proportional lift would be ~9.9 px — the caption would sit on the
    // galaxy and its thumbnail. The clearance guarantee holds for the
    // measured INK bottom, so the anchor lands at exactly clearance + ink
    // drop (the descender hangs below the baseline anchor) — the text's true
    // bottom clears the dot by MIN_LABEL_CLEARANCE_PX. The line still
    // derives from the text bottom, so the padding invariant holds under the
    // floor too.
    const state = makeState();
    seed(state, [{ id: 'm110', names: ['M110'] }], [17, 0, 0], [120]);
    const out = produceFamousGalaxyLabels(state, makeCtx());

    const dot = screenOf([17, 0, 0]);
    const anchor = screenOf(out.labels[0]!.worldPos);
    expect(dot[1] - anchor[1]).toBeCloseTo(MIN_LABEL_CLEARANCE_PX + TEXT_BOTTOM_BELOW_ANCHOR_PX, 2);
    const tip = screenOf(out.labels[0]!.leader!.toWorld);
    expect(tip[1] - anchor[1]).toBeCloseTo(TEXT_BOTTOM_BELOW_ANCHOR_PX + LEADER_LINE_PADDING_PX, 2);
  });

  it('keeps a deep-hanging caption clear of the galaxy and keeps its line', () => {
    // A caption whose ink extends deep below its anchor (a top-aligned or
    // centre-aligned block: bbox maxY 70 atlas px → 25 px on screen at the
    // 30 px em clamp) on a tiny galaxy: an anchor-only 28 px floor would let
    // the ink reach within 3 px of the galaxy AND suppress the line
    // (28 − 25 − 6 < 0) — the caption painted over its subject with no
    // connector. The clearance guarantee instead raises the lift by the
    // deficit: the measured ink bottom stays MIN_LABEL_CLEARANCE_PX above
    // the dot, and the line is present with the exact padding gap.
    const inkDropPx = 70 * (FAMOUS_LABEL_STYLE.minPixelSize / ATLAS_FONT_SIZE);
    const state = makeState({ bbox: { minX: -50, minY: -30, maxX: 50, maxY: 70 } });
    seed(state, [{ id: 'm31', names: ['M31'] }], [17, 0, 0], [120]);
    const out = produceFamousGalaxyLabels(state, makeCtx());

    expect(out.labels.map((l) => l.id)).toEqual(['famous-m31']);
    const dot = screenOf([17, 0, 0]);
    const anchor = screenOf(out.labels[0]!.worldPos);
    // The ink bottom (anchor + ink drop, screen +Y down) clears the dot by
    // exactly the guaranteed minimum.
    expect(dot[1] - (anchor[1] + inkDropPx)).toBeCloseTo(MIN_LABEL_CLEARANCE_PX, 2);
    // The connector reappears, top at the padding below the ink bottom.
    expect(out.labels[0]!.leader).toBeDefined();
    const tip = screenOf(out.labels[0]!.leader!.toWorld);
    expect(tip[1] - anchor[1]).toBeCloseTo(inkDropPx + LEADER_LINE_PADDING_PX, 2);
  });

  it('skips a galaxy whose apparent size is below the threshold', () => {
    const state = makeState();
    seed(state, [{ id: 'far', names: ['Far'] }], [100000, 0, 0], [40]);
    const out = produceFamousGalaxyLabels(state, makeCtx());
    expect(out.labels).toEqual([]);
  });

  it('emits nothing when famous labels are hidden AND the fade-out has completed', () => {
    // The gate is opacity-aware: hidden alone is not enough — the galaxy-layer
    // fade must have reached 0 for the producer to fall silent. Simulate a
    // completed fade-out by forcing the handle to 0.
    const fades = makeRegistry();
    fades.register({ kind: 'labelLayer', layer: 'galaxy' }, 1);
    fades.setImmediate({ kind: 'labelLayer', layer: 'galaxy' }, 0);
    const state = makeState({ fades });
    seed(state, [{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
    state.settings.galaxyCatalogs.items.famousGalaxy.labelEnabled = false;
    expect(produceFamousGalaxyLabels(state, makeCtx()).labels).toEqual([]);
  });

  it('keeps emitting while the galaxy-layer fade-out tail is non-zero (no pop on toggle-out)', () => {
    // Toggle-off scenario mid-fade: the famous label gate is false but the
    // galaxy-layer opacity is still ramping down (0.5 here). The producer must
    // KEEP emitting at the reduced alpha so the labels fade out smoothly.
    const midFade = makeRegistry();
    midFade.register({ kind: 'labelLayer', layer: 'galaxy' }, 1);
    midFade.setImmediate({ kind: 'labelLayer', layer: 'galaxy' }, 0.5);
    const fading = makeState({ fades: midFade });
    seed(fading, [{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
    fading.settings.galaxyCatalogs.items.famousGalaxy.labelEnabled = false;
    const out = produceFamousGalaxyLabels(fading, makeCtx());
    expect(out.labels.map((l) => l.id)).toEqual(['famous-m31']);
    // Emitted at the half opacity (full distance-fade alpha here is 1 × 0.5).
    expect(out.labels[0]!.fadeAlpha).toBeCloseTo(0.5, 6);

    // Once the fade reaches 0, the producer falls silent.
    const done = makeRegistry();
    done.register({ kind: 'labelLayer', layer: 'galaxy' }, 1);
    done.setImmediate({ kind: 'labelLayer', layer: 'galaxy' }, 0);
    const settled = makeState({ fades: done });
    seed(settled, [{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
    settled.settings.galaxyCatalogs.items.famousGalaxy.labelEnabled = false;
    expect(produceFamousGalaxyLabels(settled, makeCtx()).labels).toEqual([]);
  });

  it('emits nothing when the famous catalog is absent or meta is empty', () => {
    const noCatalog = makeState();
    setFamousGalaxiesMeta(noCatalog, [{ id: 'm31', names: ['M31'] }]);
    expect(produceFamousGalaxyLabels(noCatalog, makeCtx()).labels).toEqual([]);

    const noMeta = makeState();
    noMeta.data.galaxies.setCatalog(Source.FamousGalaxy, famousCatalog([10, 0, 0], [120]));
    expect(produceFamousGalaxyLabels(noMeta, makeCtx()).labels).toEqual([]);
  });

  it('scales worldEmMpc with diameter (40 kpc anchors the category default)', () => {
    const state = makeState();
    // 40 kpc galaxy at 3 Mpc → ~12.5 px (full alpha); worldEm == reference.
    seed(state, [{ id: 'ref', names: ['Ref'] }], [3, 0, 0], [40]);
    const out = produceFamousGalaxyLabels(state, makeCtx());
    expect(out.labels[0]!.worldEmMpc).toBeCloseTo(0.0125, 6);
  });

  it('bakes galaxy-layer opacity into famous label fadeAlpha', () => {
    // At-rest (galaxy layer at 1) → full distance-fade alpha.
    const atRest = makeState();
    seed(atRest, [{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
    const atRestAlpha = produceFamousGalaxyLabels(atRest, makeCtx()).labels[0]!.fadeAlpha!;

    // galaxy layer at 0.5 → half the at-rest alpha for label AND its anchor line.
    const fades = makeRegistry();
    fades.register({ kind: 'labelLayer', layer: 'galaxy' }, 1);
    fades.setImmediate({ kind: 'labelLayer', layer: 'galaxy' }, 0.5);
    const dimmed = makeState({ fades });
    seed(dimmed, [{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
    const out = produceFamousGalaxyLabels(dimmed, makeCtx());

    expect(out.labels[0]!.fadeAlpha).toBeCloseTo(atRestAlpha * 0.5, 6);
  });

  it('famous labels recede uniformly at blend > 0', () => {
    // No per-member exemption: every famous label is scaled by LABEL_RECESSION
    // at full blend (there is no focused-famous-structure path here).
    const atRest = makeState();
    seed(atRest, [{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
    const atRestAlpha = produceFamousGalaxyLabels(atRest, makeCtx()).labels[0]!.fadeAlpha!;

    const focused = makeState();
    seed(focused, [{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
    const recededAlpha = produceFamousGalaxyLabels(focused, makeCtx({ focusBlend: 1 })).labels[0]!
      .fadeAlpha!;

    expect(recededAlpha).toBeCloseTo(atRestAlpha * LABEL_RECESSION, 6);
  });

  it('focusedOnly mode: emits only the focused famous galaxy', () => {
    // Two famous galaxies, both above the size gate and in front of the
    // camera (which looks down +X); the focus ref addresses catalog row 1
    // (m87). Only its label (and anchor line) survives.
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
      [10, 0, 0, 10, 1, 0],
      [120, 120],
    );
    const out = produceFamousGalaxyLabels(state, makeCtx());
    expect(out.labels.map((l) => l.id)).toEqual(['famous-m87']);
    expect(out.labels[0]!.leader).toBeDefined();
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
      expect(produceFamousGalaxyLabels(state, makeCtx()).labels).toEqual([]);
    }
  });

  it('at-rest output is unchanged (galaxy layer at 1, blend 0)', () => {
    // Golden: galaxy layer at 1 × recession 1 (blend 0) ⇒ layerAlpha 1, so the
    // emitted fadeAlpha equals the raw distance-fade value (1 here).
    const state = makeState();
    seed(state, [{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
    const out = produceFamousGalaxyLabels(state, makeCtx());
    expect(out.labels[0]!.fadeAlpha).toBe(1);
  });

  it('caps a very close companion (e.g. the LMC) to the near-distance pixel ceiling', () => {
    // Inside the near band (< 0.1 Mpc), the ramp is fully bottomed out at the
    // 60 px near cap rather than the category's 150 px `maxPixelSize` — the
    // bug this fixes: a fixed 150 px ceiling let the LMC/SMC tower over the
    // view from inside the Milky Way.
    const state = makeState();
    seed(state, [{ id: 'lmc', names: ['LMC'] }], [0.05, 0, 0], [10]);
    const out = produceFamousGalaxyLabels(state, makeCtx());
    expect(out.labels[0]!.maxPixelSize).toBe(60);
  });

  it('keeps the full 150 px ceiling for a distant famous galaxy (e.g. M31)', () => {
    // Beyond the far band (> 1 Mpc), the ramp is fully saturated at the
    // category's normal `maxPixelSize` — the dramatic close-approach labels
    // for far companions like M31 must not shrink.
    const state = makeState();
    seed(state, [{ id: 'm31', names: ['M31'] }], [3, 0, 0], [40]);
    const out = produceFamousGalaxyLabels(state, makeCtx());
    expect(out.labels[0]!.maxPixelSize).toBe(FAMOUS_LABEL_STYLE.maxPixelSize);
  });

  it('yields a strictly intermediate ceiling in the near-to-far ramp band', () => {
    const state = makeState();
    seed(state, [{ id: 'mid', names: ['Mid'] }], [0.5, 0, 0], [20]);
    const out = produceFamousGalaxyLabels(state, makeCtx());
    expect(out.labels[0]!.maxPixelSize).toBeGreaterThan(60);
    expect(out.labels[0]!.maxPixelSize).toBeLessThan(FAMOUS_LABEL_STYLE.maxPixelSize);
  });

  it("stamps each label with its catalog row's pick id, size-gate skips included", () => {
    // The point pick stamps `instance_index` — the CATALOG row. A label set
    // that skipped a row below the size gate and then numbered its own output
    // would resolve every later label to the previous galaxy.
    const state = makeState();
    seed(
      state,
      [{ id: 'a' }, { id: 'tiny' }, { id: 'c' }],
      [5, 0, 0, 5, 0, 0, 5, 0, 0],
      [120, 0.001, 120],
    );
    const labels = produceFamousGalaxyLabels(state, makeCtx()).labels;
    expect(labels.map((l) => l.id)).toEqual(['famous-a', 'famous-c']);
    for (const label of labels) {
      const pick = unpackPick(label.pickId!)!;
      expect(pick.sourceCode).toBe(Source.FamousGalaxy);
      expect(state.famousGalaxiesMeta[pick.localIdx]!.id).toBe(label.id.replace('famous-', ''));
    }
  });
});
