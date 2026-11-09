/**
 * label2DDirector — the antique look never prints a name that has no owner on the plate
 * (review round 9): a name behind a globe's ring, a planet too small to print,
 * a crowded town's name, a title wider than the plate. Fixture as `label2DDirector.test.ts`:
 * identity vp, so world [x,y,0] lands at ((x·0.5+0.5)·W, (0.5−y·0.5)·H).
 */

import { describe, expect, it, vi } from 'vitest';
import { mat4d } from 'wgpu-matrix';
import { createLabel2DDirector } from '../../../../src/services/engine/subsystems/label2DDirector';
import { FOREGROUND_LABEL_DIRECTOR } from '../../../../src/data/labels/foregroundLabelDirectorConfig';
import { NEAR0 } from '../../../../src/services/engine/frame/slabs';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CAPTION_PRIORITY_SCALE } from '../../../../src/data/labels/captionPriorityScale';
import { LABEL_EM_PX_RETUNE } from '../../../../src/data/labels/labelSizingDefaults';
import { ANTIQUE_LABEL_STYLE } from '../../../../src/data/labels/antiqueLabelStyle';
import { createOrbitCamera } from '../../../../src/utils/camera/orbitCamera/createOrbitCamera';
import { labelScreenRect } from '../../../../src/utils/labels/labelScreenRect';
import { alignXFraction } from '../../../../src/utils/labels/alignXFraction';
import { antiquePlateKeepOut } from '../../../../src/utils/labels/antiquePlateKeepOut';
import type { Label2D } from '../../../../src/@types/rendering/Label2D';
import type { Label2DProducer } from '../../../../src/@types/engine/subsystems/Label2DProducer';
import type { LabelName } from '../../../../src/@types/animation/LabelName';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { Slab } from '../../../../src/@types/engine/frame/Slab';

const KM = SCALE_UNITS.MPC_TO_M * SCALE_UNITS.M_TO_KM;

function lookState(select: string | null = null): EngineState {
  return {
    subsystems: { fades: { fadeTo: vi.fn() } },
    selection: {
      hover: null,
      focus: null,
      select: select === null ? null : { type: 'body', id: select },
    },
    ui: { uiHidden: false },
    viewCover: {},
    selectionKindRows: [
      { type: 'body', encodePick: (ref: { id: string }) => (ref.id === 'saturn' ? 7 : null) },
    ],
    settings: { antique: { enabled: true } },
    viewRig: 'mono',
    gpu: { fontAtlases: null },
  } as unknown as EngineState;
}

const NEAR0_SLAB: Slab = {
  index: NEAR0,
  near: 1e-6,
  far: 1,
  vp: mat4d.identity() as Float64Array,
  frame: { kind: 'world-mpc', originRelative: true },
  distanceRangeM: [1e-6 * SCALE_UNITS.MPC_TO_M, 1 * SCALE_UNITS.MPC_TO_M],
  precision: 'f64',
  reversedZ: true,
};

function ctxOf(width = 1000, height = 1000, nowMs = 0): FrameView {
  return {
    cam: createOrbitCamera({
      target: [0, 0, 0],
      distance: 1,
      yaw: 0,
      pitch: 0,
      fovYRad: Math.PI / 2,
      aspect: width / height,
      near: 0.1,
      far: 100,
    }),
    frustum: { tanLeft: -1, tanRight: 1, tanDown: -1, tanUp: 1 },
    snapshot: { devicePixelRatio: 1, bodyStates: new Map(), nowMs, focusBlend: 0 },
    drawCamPos: [0, 0, 0],
    slabs: [NEAR0_SLAB],
    canvasSize: { width, height },
    drawPxPerRad: height / 2 / LABEL_EM_PX_RETUNE,
  } as unknown as FrameView;
}

const producerOf = (labels: Label2D[], label?: LabelName): Label2DProducer => ({
  id: label ?? 'p',
  label,
  produceLabels: () => ({ labels, awake: false }),
});

// A short name rising from its anchor, ~20 atlas px a character, shifted by its alignment
// as the atlas lays it out.
const measure = (label: Label2D) => {
  const width = 20 * label.text.length;
  const minX = -width * alignXFraction(label.alignX ?? 'left');
  return { minX, minY: -30, maxX: minX + width, maxY: 0 };
};

const name = (id: string, worldPos: [number, number, number], extra: Partial<Label2D> = {}) =>
  ({
    id,
    worldPos,
    text: 'Name',
    font: 'cormorant',
    pixelSize: 10,
    fadeAlpha: 1,
    declutterPriority: 10 * CAPTION_PRIORITY_SCALE,
    ...extra,
  }) as Label2D;

// Saturn, centred: a 200 px globe whose ring runs left–right, 400 px out and 80 px tall
// (identity vp: a world unit is 500 px, so the ring's radius is in those units).
const saturn = name('sceneBody-saturn', [0, 0, -1e-8], {
  text: 'Saturn',
  declutterPriority: 20 * CAPTION_PRIORITY_SCALE,
  worldEmMpc: 1e-11,
  occludeNearKm: 1e-8 * KM,
  lift: {
    subjectSizePx: 200,
    ring: { pole: [0, Math.cos(0.2), Math.sin(0.2)], outerRadiusMpc: 0.8 },
  },
});

function run(producers: Label2DProducer[], state = lookState(), ctx = ctxOf()): Label2D[] {
  const dir = createLabel2DDirector(FOREGROUND_LABEL_DIRECTOR);
  dir.attachRenderers({ setLabels: vi.fn() } as never, { setLines: vi.fn() } as never, measure);
  for (const p of producers) dir.registerProducer(p);
  dir.runFrame(state, ctx);
  return dir.labels() as Label2D[];
}

describe('label2DDirector under the antique look: names with no owner', () => {
  it("keeps a star's name off a globe's ring, not off the sky beside the ring", () => {
    // (850, 500): out on the ring past the globe's rim. (500, 150): as far out, above the ring.
    const onRing = name('star-ankaa', [0.7, 0, 0]);
    const aboveRing = name('star-achernar', [-0.05, 0.7, 0]);
    const ids = run([
      producerOf([saturn], 'body'),
      producerOf([onRing, aboveRing], 'starCatalog'),
    ]).map((l) => l.id);
    expect(ids).not.toContain('star-ankaa');
    expect(ids).toContain('star-achernar');
  });

  it('names a listed planet too small for a globe, whose sign stands on the plate', () => {
    const glint = name('sceneBody-saturn', [0.2, 0.2, 0], {
      subjectId: 7,
      lift: { subjectSizePx: 0.2 },
    });
    expect(run([producerOf([glint], 'body')]).map((l) => l.id)).toEqual(['sceneBody-saturn']);
  });

  it('keeps an unlisted small body unnamed: it has no sign either', () => {
    const bennu = name('sceneBody-bennu', [0.2, 0.2, 0], { lift: { subjectSizePx: 0.2 } });
    expect(run([producerOf([bennu], 'body')])).toEqual([]);
  });

  it('sets a crowded name on its fallback side, and keeps its own side when that is clear', () => {
    const winner = name('earthTown-amsteldam', [0.04, 0, 0], {
      declutterPriority: 15 * CAPTION_PRIORITY_SCALE + 358,
    });
    const london = name('earthTown-london', [0, 0, 0], {
      declutterPriority: 15 * CAPTION_PRIORITY_SCALE + 328,
      alignX: 'left',
    } as Partial<Label2D>);
    const crowded = { ...london, fallback: { ...london, alignX: 'right' as const } };
    const placed = run([producerOf([winner, crowded], 'body')]);
    expect(placed.map((l) => l.id)).toEqual(['earthTown-amsteldam', 'earthTown-london']);
    expect(placed[1]!.alignX).toBe('right');

    const alone = run([producerOf([crowded], 'body')]);
    expect(alone[0]!.alignX).toBe('left');
  });

  it("fits a subject's title inside the neatline on a phone-narrow plate", () => {
    const width = 400;
    const height = 850;
    const subject = name('famous-m51', [0, 0, 0], {
      text: 'Messier 51 (Whirlpool Galaxy) in Canes Venatici, after Lord Rosse',
      subjectId: 7,
      lift: { subjectSizePx: 300 },
    });
    const state = lookState('saturn');
    const ctx = (nowMs: number) => ctxOf(width, height, nowMs);
    const dir = createLabel2DDirector(FOREGROUND_LABEL_DIRECTOR);
    dir.attachRenderers({ setLabels: vi.fn() } as never, { setLines: vi.fn() } as never, measure);
    dir.registerProducer(producerOf([subject], 'famousGalaxy'));
    dir.runFrame(state, ctx(0));
    dir.runFrame(state, ctx(ANTIQUE_LABEL_STYLE.titleGrowMs));

    const title = dir.labels()[0]!;
    expect(title.maxPixelSize).toBeLessThan(ANTIQUE_LABEL_STYLE.subjectPx);
    const ink = labelScreenRect({
      label: title,
      bbox: measure(title),
      screenPx: [(title.worldPos[0] * 0.5 + 0.5) * width, (0.5 - title.worldPos[1] * 0.5) * height],
      clipW: 1,
      pxPerRad: height / 2 / LABEL_EM_PX_RETUNE,
      devicePixelRatio: 1,
    });
    const { inner } = antiquePlateKeepOut([width, height], true, [], ink);
    expect(ink.x0).toBeGreaterThanOrEqual(inner.x0);
    expect(ink.x1).toBeLessThanOrEqual(inner.x1);
  });
});
