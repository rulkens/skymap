import { ZERO_FOCUS } from '../../../../src/services/engine/subsystems/structureFocusSubsystem';
import { describe, expect, it } from 'vitest';
import { produceStructureLabels } from '../../../../src/layers/structure/present/produceStructureLabels';
import { createStructureStore } from '../../../../src/layers/structure/load/createStructureStore';
import { STRUCTURE_ID_CODES } from '../../../../src/data/structure/structureIds';
import { makeStructureFade } from '../../../fixtures/makeStructureFade';
import { MARKER_RADIUS_RETUNE } from '../../../../src/data/markerRadiusRetune';
import { STRUCTURE_LABEL_ABOVE_GAP_PX } from '../../../../src/layers/structure/data/structureLabelAboveGapPx';
import { unpackPick } from '../../../../src/data/selectionEncoding';
import { structurePickId } from '../../../../src/utils/picking/structurePickId';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import type { Label2D } from '../../../../src/@types/rendering/Label2D';
import type { StructureStore } from '../../../../src/layers/structure/@types/StructureStore';
import type { StructureId } from '../../../../src/@types/data/structure/StructureId';
import type { StructureScale } from '../../../../src/@types/data/structure/StructureScale';

// produceStructureLabels reads its `store` argument for the records,
// `state.selection.focus` for focusedOnly mode and `state.settings.labels`; the
// category's fade arrives as the handed value, so no fade registry rides along.
function makeState(
  opts: {
    focusedStructureId?: string | null;
    focusedOnly?: boolean;
  } = {},
): TestState {
  const focusedStructureId = opts.focusedStructureId ?? null;
  return {
    store: createStructureStore(),
    settings: { labels: { focusedOnly: opts.focusedOnly ?? false } },
    selection: {
      focus: focusedStructureId === null ? null : { type: 'structure', id: focusedStructureId },
      select: null,
      hover: null,
    },
  } as unknown as TestState;
}

type TestState = EngineState & { store: StructureStore };

// One frame of the producer over the fixture's own store.
function labelsOf(
  state: TestState,
  ctx: FrameView,
  scale: StructureScale,
  fade: Readonly<Record<StructureId, number>> = makeStructureFade(),
) {
  return produceStructureLabels(state.store, scale)(state, ctx, fade);
}

// The fixture camera sits 5 Mpc from the heliocentric origin — NOT at the
// origin itself, because origin distance is the surveyDeepZoom band's key and
// a camera at the origin is "deep zoom": the producer would emit nothing.
// Every record's worldPos carries the same +5 z offset so the camera-to-
// structure distances the apparent-size fades read are unchanged.
const CAM_Z = 5;

/** `focusBlend` (frame-owned) nests under `snapshot`; every other override is a view field. */
function makeCtx(
  over: { drawCamPos?: Readonly<[number, number, number]>; focusBlend?: number } = {},
): FrameView {
  const { focusBlend = 0, ...viewOver } = over;
  return {
    snapshot: { focusBlend, nowMs: 0, focus: ZERO_FOCUS },
    drawCamPos: [0, 0, CAM_Z],
    // Identity pose: screen-up is world +Y.
    cam: { yaw: 0, pitch: 0, roll: 0, poseBasis: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
    canvasSize: { width: 1920, height: 1080 },
    drawPxPerRad: 1080 / (2 * Math.tan((60 * Math.PI) / 180 / 2)),
    ...viewOver,
  } as unknown as FrameView;
}

const rec = (id: string, over: Partial<StructureInfo> = {}): StructureInfo =>
  ({
    id,
    name: id,
    worldPos: [10, 0, CAM_Z],
    category: 'galaxy-cluster',
    featured: true,
    physicalRadiusMpc: 5,
    ...over,
  }) as StructureInfo;

describe('produceStructureLabels', () => {
  it('emits a label only for featured structures', () => {
    const state = makeState();
    state.store.setGroup('bulk', [rec('a'), rec('b', { featured: false })]);
    const out = labelsOf(state, makeCtx(), 'cosmic');
    expect(out.labels.map((l) => l.id)).toEqual(['a']);
  });

  it('wraps a long name onto two balanced lines; short names stay one line', () => {
    const state = makeState();
    state.store.setGroup('anchors', [
      rec('lan', { name: 'Laniakea Supercluster' }),
      rec('virgo', { name: 'Virgo Cluster', worldPos: [0, 10, CAM_Z] }),
    ]);
    const texts = labelsOf(state, makeCtx(), 'cosmic').labels.map((l) => l.text);
    expect(texts).toEqual(['Laniakea\nSupercluster', 'Virgo Cluster']);
  });

  it('skips a category whose handed value is 0', () => {
    const state = makeState();
    state.store.setGroup('anchors', [rec('c1', { category: 'galaxy-cluster' })]);
    expect(
      labelsOf(state, makeCtx(), 'cosmic', makeStructureFade(1, { 'galaxy-cluster': 0 })).labels,
    ).toEqual([]);
  });

  it('keeps emitting a category at a falling value (the fade-out tail)', () => {
    const state = makeState();
    state.store.setGroup('anchors', [rec('c1', { category: 'galaxy-cluster' })]);
    expect(
      labelsOf(
        state,
        makeCtx(),
        'cosmic',
        makeStructureFade(1, { 'galaxy-cluster': 0.5 }),
      ).labels.map((l) => l.id),
    ).toEqual(['c1']);
  });

  it('sets prominencePx to the ring apparent radius and never declutters', () => {
    // Two featured structures at the same position → both labels emitted
    // (no internal declutter; the director de-collides later). Their
    // prominencePx equals the ring apparent radius.
    const state = makeState();
    state.store.setGroup('anchors', [rec('a'), rec('b')]);
    const out = labelsOf(state, makeCtx(), 'cosmic');
    expect(out.labels.map((l) => l.id)).toEqual(['a', 'b']);
    // radius 5 Mpc / 10 Mpc distance × pxPerRad (= halfH/tan(fovY/2) = 540/tan(30°))
    const pxPerRad = 540 / Math.tan((30 * Math.PI) / 180);
    const expected = (5 / 10) * pxPerRad;
    expect(out.labels[0]!.prominencePx).toBeCloseTo(expected, 3);
  });

  it('fades the label out as the ring grows past the close-approach band', () => {
    // Camera very close → apparent radius far past markerMaxApparentRadiusPx
    // (700 + 400 band) → fully faded → label dropped entirely.
    const state = makeState();
    state.store.setGroup('anchors', [rec('huge', { worldPos: [0.1, 0, CAM_Z] })]);
    expect(labelsOf(state, makeCtx(), 'cosmic').labels).toEqual([]);
  });

  it('scales by the handed value exactly once', () => {
    // At full blend: the director recedes labels, so a producer that receded on its
    // own would land below 0.25.
    const state = makeState();
    state.store.setGroup('anchors', [rec('a')]);
    const atRestAlpha = labelsOf(state, makeCtx(), 'cosmic').labels[0]!.fadeAlpha!;
    const handedAlpha = labelsOf(
      state,
      makeCtx({ focusBlend: 1 }),
      'cosmic',
      makeStructureFade(0.25),
    ).labels[0]!.fadeAlpha!;

    expect(handedAlpha).toBeCloseTo(atRestAlpha * 0.25, 6);
  });

  it('focusedOnly mode: emits only the focused structure label', () => {
    const state = makeState({ focusedStructureId: 'a', focusedOnly: true });
    state.store.setGroup('anchors', [rec('a'), rec('b')]);
    const out = labelsOf(state, makeCtx(), 'cosmic');
    expect(out.labels.map((l) => l.id)).toEqual(['a']);
  });

  it('focusedOnly mode: emits nothing when no structure is focused', () => {
    const state = makeState({ focusedOnly: true });
    state.store.setGroup('anchors', [rec('a'), rec('b')]);
    expect(labelsOf(state, makeCtx(), 'cosmic').labels).toEqual([]);
  });

  it('emits nothing at deep zoom — the surveyDeepZoom band empties the producer', () => {
    // Camera 0.001 Mpc from the heliocentric origin (inside the band's goneAt
    // edge). The record sits 10 Mpc from the CAMERA — squarely in the flat
    // band of both apparent-size fades, featured, all toggles on — so the
    // band factor is the only thing suppressing it.
    const state = makeState();
    state.store.setGroup('anchors', [rec('a', { worldPos: [10, 0, 0.001] })]);
    const out = labelsOf(
      state,
      makeCtx({ drawCamPos: [0, 0, 0.001] as Readonly<[number, number, number]> }),
      'cosmic',
    );
    expect(out.labels).toEqual([]);
  });

  it('scales fadeAlpha by a fractional band factor mid-descent', () => {
    // Camera 0.005 Mpc from the origin: strictly inside the band (goneAt
    // 0.002 < 0.005 < fullAt ≈ 0.0103), so the label FADES rather than
    // popping — a strict fraction, not the 0/1 a boolean gate would produce.
    const state = makeState();
    state.store.setGroup('anchors', [rec('a', { worldPos: [10, 0, 0.005] })]);
    const out = labelsOf(
      state,
      makeCtx({ drawCamPos: [0, 0, 0.005] as Readonly<[number, number, number]> }),
      'cosmic',
    );
    const alpha = out.labels[0]!.fadeAlpha!;
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(1);
  });

  it("an 'above' category's label is anchored above its ring with a bottom alignment", () => {
    // Nebula on the near0 slab, inside its visibility band (camera 0.03 Mpc from
    // the origin): camera-relative anchor [0.01, 0, 0], ring radius 0.001 Mpc at
    // 0.01 Mpc. Straight up from the centre by the drawn radius plus the pixel
    // gap converted to Mpc at that distance.
    const state = makeState();
    state.store.setGroup('anchors', [
      rec('n1', { category: 'nebula', worldPos: [0.01, 0, 0.03], physicalRadiusMpc: 0.001 }),
    ]);
    const ctx = makeCtx({ drawCamPos: [0, 0, 0.03] as Readonly<[number, number, number]> });
    const label = labelsOf(state, ctx, 'milkyWay').labels[0]!;
    const pxPerRad = 540 / Math.tan((30 * Math.PI) / 180);
    const lift = 0.001 * MARKER_RADIUS_RETUNE + (STRUCTURE_LABEL_ABOVE_GAP_PX * 0.01) / pxPerRad;
    expect(label.alignY).toBe('bottom');
    expect(label.worldPos[0]).toBeCloseTo(0.01, 9);
    expect(label.worldPos[1]).toBeCloseTo(lift, 9);
    expect(label.worldPos[2]).toBeCloseTo(0, 9);
  });

  it("a 'centre' category's label anchor and alignment are unchanged", () => {
    const state = makeState();
    state.store.setGroup('anchors', [rec('c1', { category: 'galaxy-cluster' })]);
    const label = labelsOf(state, makeCtx(), 'cosmic').labels[0]!;
    expect(label.worldPos).toEqual([10, 0, CAM_Z]);
    expect(label.alignY).toBe('center');
  });

  it('stamps each label with the pick id its own ring writes — a PER-CATEGORY index', () => {
    // The ring pick's localIdx indexes `byCategory(cat)`, not `all()`. The
    // fixture interleaves two categories and drops a non-featured record so a
    // global counter, an emitted-labels counter, or an all()-position index
    // each produce a DIFFERENT number here — and each would silently resolve a
    // click to the wrong structure.
    const state = makeState();
    state.store.setGroup('anchors', [
      rec('c1', { category: 'galaxy-cluster' }),
      rec('s1', { category: 'supercluster', worldPos: [0, 10, CAM_Z] }),
      rec('c2', { category: 'galaxy-cluster', featured: false }),
      rec('c3', { category: 'galaxy-cluster', worldPos: [0, -10, CAM_Z] }),
      rec('s2', { category: 'supercluster', worldPos: [-10, 0, CAM_Z] }),
    ]);
    const labels = labelsOf(state, makeCtx(), 'cosmic').labels;
    expect(labels.map((l) => l.id)).toEqual(['c1', 's1', 'c3', 's2']);

    // Round-trip every emitted label through the decode side: unpack the
    // stamped word and index the category table the source code names.
    for (const label of labels) {
      const record = state.store.byId(label.id)!;
      const pick = unpackPick(label.pickId!)!;
      expect(pick.sourceCode).toBe(STRUCTURE_ID_CODES[record.category]);
      expect(state.store.byCategory(record.category)[pick.localIdx]?.id).toBe(label.id);
    }
  });

  it('outside the focused sphere a label draws but carries no pick; inside and at rest it keeps it', () => {
    const state = makeState();
    state.store.setGroup('anchors', [
      rec('in', { worldPos: [10, 0, CAM_Z] }),
      rec('out', { worldPos: [0, 10, CAM_Z] }),
    ]);
    const focus = {
      center: [10, 0, CAM_Z],
      apparentRadiusMpc: 1,
      physicalRadiusMpc: 0.5,
      blend: 1,
    } as const;
    const ctx = makeCtx();
    const focused = { ...ctx, snapshot: { ...ctx.snapshot, focus } } as FrameView;
    const byId = (labels: readonly Label2D[], id: string) => labels.find((l) => l.id === id)!;

    const rest = labelsOf(state, ctx, 'cosmic').labels;
    expect(byId(rest, 'out').pickId).toBeDefined();

    const under = labelsOf(state, focused, 'cosmic').labels;
    expect(byId(under, 'in').pickId).toBeDefined();
    expect(byId(under, 'out').pickId).toBeUndefined();
    expect(byId(under, 'out').fadeAlpha).toBeGreaterThan(0);
    // Not clickable, still named: emphasis keys on the subject, not the pick.
    expect(byId(under, 'out').subjectId).toBe(structurePickId('galaxy-cluster', 1));
  });
});
