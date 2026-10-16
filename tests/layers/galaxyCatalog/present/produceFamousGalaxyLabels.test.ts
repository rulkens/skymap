import { ZERO_FOCUS } from '../../../../src/services/engine/subsystems/structureFocusSubsystem';
import { describe, expect, it, vi } from 'vitest';
import type { FocusUniformsValue } from '../../../../src/@types/rendering/FocusUniformsValue';
import { mat4 } from 'wgpu-matrix';
import { produceFamousGalaxyLabels } from '../../../../src/layers/galaxyCatalog/present/produceFamousGalaxyLabels';
import { FAMOUS_LABEL_STYLE } from '../../../../src/services/engine/presentation/famousLabelStyle';
import {
  LEADER_LINE_PADDING_PX,
  MIN_LABEL_CLEARANCE_PX,
} from '../../../../src/services/engine/presentation/leaderLineStyle';
import { createEngineData } from '../../../../src/services/engine/data/createEngineData';
import { ATLAS_FONT_SIZE } from '../../../../src/data/fonts';
import { Source } from '../../../../src/data/sources';
import {
  packSelection,
  PICK_SENTINEL_OFFSET,
  unpackPick,
} from '../../../../src/data/selectionEncoding';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { GalaxyCatalogRuntime } from '../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { FamousGalaxyMetaEntry } from '../../../../src/@types/loading/FamousGalaxyMetaEntry';
import type { Label2D } from '../../../../src/@types/rendering/Label2D';
import type { LabelBBox } from '../../../../src/@types/rendering/LabelBBox';

// The producers only read the ink bbox; real glyph metrics would pin the
// fixtures to a font file, so the layout is mocked to report a chosen box.
const layout = vi.hoisted(() => ({ bbox: null as LabelBBox | null }));
vi.mock('../../../../src/services/gpu/labelLayout/textLayoutOf', () => ({
  textLayoutOf: () => ({ quads: [], bbox: layout.bbox }),
}));

/** The value core hands for the `famousGalaxy` label item. */
const handed = (famousGalaxy: number) => ({ famousGalaxy });
const ONE = handed(1);

// Measured ink bbox the textLayoutOf mock reports (atlas px, anchor-relative,
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

// produceFamousGalaxyLabels reads its Layer's runtime for the sidecar records
// and the positional catalog, and the text layout bbox for the caption's ink
// bbox (which places the leader-line top); its fade arrives as the handed value.
function makeState(
  opts: {
    focusedOnly?: boolean;
    focus?: object | null;
    bbox?: LabelBBox;
  } = {},
): EngineState {
  layout.bbox = opts.bbox ?? MEASURED_BBOX;
  return {
    data: createEngineData(),
    gpu: { fontAtlases: { metricsByFont: {} } },
    selection: { focus: opts.focus ?? null, select: null, hover: null },
    settings: { labels: { focusedOnly: opts.focusedOnly ?? false } },
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

function makeCtx(over: { focusBlend?: number } = {}): FrameView {
  return {
    snapshot: { focusBlend: over.focusBlend ?? 0, nowMs: 0, focus: ZERO_FOCUS },
    drawCamPos: [0, 0, 0],
    vp: VP,
    canvasSize: { width: 1920, height: 1080 },
    drawPxPerRad: 1080 / (2 * Math.tan((60 * Math.PI) / 180 / 2)),
  } as unknown as FrameView;
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

/**
 * The runtime slice the producer closes over — its catalog map and the famous
 * sidecar. `seed` returns it; every call site hands it to the producer factory.
 */
function seed(
  entries: Partial<FamousGalaxyMetaEntry>[],
  positions: number[],
  diameters: number[],
): Pick<GalaxyCatalogRuntime, 'catalogs' | 'famousMeta'> {
  return {
    catalogs: new Map([[Source.FamousGalaxy, famousCatalog(positions, diameters)]]),
    famousMeta: meta(...entries),
  } as Pick<GalaxyCatalogRuntime, 'catalogs' | 'famousMeta'>;
}

describe('produceFamousGalaxyLabels', () => {
  it('emits a lifted label + anchor line for a galaxy above the size gate', () => {
    const state = makeState();
    // 120 kpc galaxy at 5 Mpc → ~22.4 px apparent size: comfortably above the
    // 6 px gate AND in the proportional-lift regime (1.5 × 22.4 ≈ 33.7 px sits
    // above the clearance-raised floor of 28 + ~4.3 px ink drop, so neither
    // floor bites in this test).
    const runtime = seed([{ id: 'm31', names: ['M31'] }], [5, 0, 0], [120]);
    const out = produceFamousGalaxyLabels(runtime)(state, makeCtx(), ONE);

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
      const runtime = seed([{ id: 'm31', names: ['M31'] }], [distanceMpc, 0, 0], [120]);
      const out = produceFamousGalaxyLabels(runtime)(state, makeCtx(), ONE);

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
    const runtime = seed([{ id: 'm110', names: ['M110'] }], [17, 0, 0], [120]);
    const out = produceFamousGalaxyLabels(runtime)(state, makeCtx(), ONE);

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
    const runtime = seed([{ id: 'm31', names: ['M31'] }], [17, 0, 0], [120]);
    const out = produceFamousGalaxyLabels(runtime)(state, makeCtx(), ONE);

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
    const runtime = seed([{ id: 'far', names: ['Far'] }], [100000, 0, 0], [40]);
    const out = produceFamousGalaxyLabels(runtime)(state, makeCtx(), ONE);
    expect(out.labels).toEqual([]);
  });

  it('emits at the handed value, so a falling value draws the fade-out tail', () => {
    const state = makeState();
    const runtime = seed([{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
    const out = produceFamousGalaxyLabels(runtime)(state, makeCtx(), handed(0.5));
    expect(out.labels.map((l) => l.id)).toEqual(['famous-m31']);
    // Full distance-fade alpha here is 1, times the handed 0.5.
    expect(out.labels[0]!.fadeAlpha).toBeCloseTo(0.5, 6);
  });

  it('emits nothing when the famous catalog is absent or meta is empty', () => {
    const noCatalog = makeState();
    const noCatalogRuntime = {
      catalogs: new Map(),
      famousMeta: meta({ id: 'm31', names: ['M31'] }),
    } as Pick<GalaxyCatalogRuntime, 'catalogs' | 'famousMeta'>;
    expect(produceFamousGalaxyLabels(noCatalogRuntime)(noCatalog, makeCtx(), ONE).labels).toEqual(
      [],
    );

    const noMeta = makeState();
    const noMetaRuntime = {
      catalogs: new Map([[Source.FamousGalaxy, famousCatalog([10, 0, 0], [120])]]),
      famousMeta: [],
    } as Pick<GalaxyCatalogRuntime, 'catalogs' | 'famousMeta'>;
    expect(produceFamousGalaxyLabels(noMetaRuntime)(noMeta, makeCtx(), ONE).labels).toEqual([]);
  });

  it('scales worldEmMpc with diameter (40 kpc anchors the category default)', () => {
    const state = makeState();
    // 40 kpc galaxy at 3 Mpc → ~12.5 px (full alpha); worldEm == reference.
    const runtime = seed([{ id: 'ref', names: ['Ref'] }], [3, 0, 0], [40]);
    const out = produceFamousGalaxyLabels(runtime)(state, makeCtx(), ONE);
    expect(out.labels[0]!.worldEmMpc).toBeCloseTo(0.0125, 6);
  });

  it('bakes the handed value into famous label fadeAlpha', () => {
    // At-rest (handed 1) → full distance-fade alpha.
    const atRest = makeState();
    const atRestRuntime = seed([{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
    const atRestAlpha = produceFamousGalaxyLabels(atRestRuntime)(atRest, makeCtx(), ONE).labels[0]!
      .fadeAlpha!;

    // handed 0.5 → half the at-rest alpha for label AND its anchor line.
    const dimmed = makeState();
    const dimmedRuntime = seed([{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
    const out = produceFamousGalaxyLabels(dimmedRuntime)(dimmed, makeCtx(), handed(0.5));

    expect(out.labels[0]!.fadeAlpha).toBeCloseTo(atRestAlpha * 0.5, 6);
  });

  it('scales by the handed value exactly once', () => {
    // At full blend: the director recedes labels, so a producer that receded or
    // clipped on its own would land below 0.25.
    const atRest = makeState();
    const atRestRuntime = seed([{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
    const atRestAlpha = produceFamousGalaxyLabels(atRestRuntime)(atRest, makeCtx(), ONE).labels[0]!
      .fadeAlpha!;

    const focused = makeState();
    const focusedRuntime = seed([{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
    const handedAlpha = produceFamousGalaxyLabels(focusedRuntime)(
      focused,
      makeCtx({ focusBlend: 1 }),
      handed(0.25),
    ).labels[0]!.fadeAlpha!;

    expect(handedAlpha).toBeCloseTo(atRestAlpha * 0.25, 6);
  });

  it('focusedOnly mode: emits only the focused famous galaxy', () => {
    // Two famous galaxies, both above the size gate and in front of the
    // camera (which looks down +X); the focus ref addresses catalog row 1
    // (m87). Only its label (and anchor line) survives.
    const state = makeState({
      focusedOnly: true,
      focus: { type: 'galaxyCatalog', source: Source.FamousGalaxy, index: 1 },
    });
    const runtime = seed(
      [
        { id: 'm31', names: ['M31'] },
        { id: 'm87', names: ['M87'] },
      ],
      [10, 0, 0, 10, 1, 0],
      [120, 120],
    );
    const out = produceFamousGalaxyLabels(runtime)(state, makeCtx(), ONE);
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
      const runtime = seed([{ id: 'm31', names: ['M31'] }], [10, 0, 0], [120]);
      expect(produceFamousGalaxyLabels(runtime)(state, makeCtx(), ONE).labels).toEqual([]);
    }
  });

  it('caps a very close companion (e.g. the LMC) to the near-distance pixel ceiling', () => {
    // Inside the near band (< 0.1 Mpc), the ramp is fully bottomed out at the
    // 60 px near cap rather than the category's 150 px `maxPixelSize` — the
    // bug this fixes: a fixed 150 px ceiling let the LMC/SMC tower over the
    // view from inside the Milky Way.
    const state = makeState();
    const runtime = seed([{ id: 'lmc', names: ['LMC'] }], [0.05, 0, 0], [10]);
    const out = produceFamousGalaxyLabels(runtime)(state, makeCtx(), ONE);
    expect(out.labels[0]!.maxPixelSize).toBe(60);
  });

  it("stamps each label with its catalog row's pick id, size-gate skips included", () => {
    // The point pick stamps `instance_index` — the CATALOG row. A label set
    // that skipped a row below the size gate and then numbered its own output
    // would resolve every later label to the previous galaxy.
    const state = makeState();
    const runtime = seed(
      [{ id: 'a' }, { id: 'tiny' }, { id: 'c' }],
      [5, 0, 0, 5, 0, 0, 5, 0, 0],
      [120, 0.001, 120],
    );
    const labels = produceFamousGalaxyLabels(runtime)(state, makeCtx(), ONE).labels;
    expect(labels.map((l) => l.id)).toEqual(['famous-a', 'famous-c']);
    for (const label of labels) {
      const pick = unpackPick(label.pickId!)!;
      expect(pick.sourceCode).toBe(Source.FamousGalaxy);
      expect(runtime.famousMeta[pick.localIdx]!.id).toBe(label.id.replace('famous-', ''));
    }
  });

  it('outside the focused sphere a label draws but carries no pick; inside and at rest it keeps it', () => {
    const runtime = seed(
      [
        { id: 'in', names: ['In'] },
        { id: 'out', names: ['Out'] },
      ],
      [5, 0, 0, 5, 3, 0],
      [120, 120],
    );
    const state = makeState();
    const focus: FocusUniformsValue = {
      center: [5, 0, 0],
      apparentRadiusMpc: 1,
      physicalRadiusMpc: 0.5,
      blend: 1,
    };
    const ctx = makeCtx();
    const focused = { ...ctx, snapshot: { ...ctx.snapshot, focus } } as FrameView;
    const pickOf = (labels: readonly Label2D[], id: string) =>
      labels.find((l) => l.id === id)!.pickId;

    const rest = produceFamousGalaxyLabels(runtime)(state, ctx, ONE).labels;
    expect(pickOf(rest, 'famous-out')).toBeDefined();

    const under = produceFamousGalaxyLabels(runtime)(state, focused, ONE).labels;
    expect(pickOf(under, 'famous-in')).toBeDefined();
    expect(pickOf(under, 'famous-out')).toBeUndefined();
    expect(under.find((l) => l.id === 'famous-out')!.fadeAlpha).toBeGreaterThan(0);
  });

  it('a label not clickable under focus still names its subject', () => {
    const runtime = seed([{ id: 'out', names: ['Out'] }], [5, 3, 0], [120]);
    const focus: FocusUniformsValue = {
      center: [5, 0, 0],
      apparentRadiusMpc: 1,
      physicalRadiusMpc: 0.5,
      blend: 1,
    };
    const ctx = makeCtx();
    const focused = { ...ctx, snapshot: { ...ctx.snapshot, focus } } as FrameView;
    const label = produceFamousGalaxyLabels(runtime)(makeState(), focused, ONE).labels[0]!;
    expect(label.pickId).toBeUndefined();
    expect(label.subjectId).toBe(packSelection(Source.FamousGalaxy, 0 + PICK_SENTINEL_OFFSET));
  });
});
