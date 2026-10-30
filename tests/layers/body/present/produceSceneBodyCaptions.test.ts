/**
 * produceSceneBodyCaptions — candidate math for Earth's and the planets' captions, read beside
 * the missions Layer's craft captions (mesh-body cases) and the blackHoles Layer's Galactic
 * Centre caption (a control with no reveal band). The producer emits EVERY
 * candidate every frame, so cases read the candidate's `fadeAlpha` (its TARGET). The shared
 * fade-band / occlusion / registry-ramp mechanics are covered here once, on core's bodies.
 */

import { ZERO_FOCUS } from '../../../../src/services/engine/subsystems/structureFocusSubsystem';
import { describe, it, expect } from 'vitest';

import { produceSceneBodyCaptions } from '../../../../src/layers/body/present/produceSceneBodyCaptions';
import { produceBlackHoleCaptions } from '../../../../src/layers/blackHoles/present/produceBlackHoleCaptions';
import { produceConstellationCaptions } from '../../../../src/layers/constellations/present/produceConstellationCaptions';
import { sceneBodyLabels } from '../../../../src/layers/body/present/sceneBodyLabels';
import { produceMissionCaptions } from '../../../../src/layers/missions/present/produceMissionCaptions';
import { meshBodyCaption } from '../../../../src/utils/labels/meshBodyCaption';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';
import { SCENE_MESH_BODIES } from '../../../../src/data/bodies/sceneMeshBodies';
import { SGR_A_STAR_ENTRY } from '../../../../src/layers/blackHoles/sources/sgrAStar';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';

import type { FocusUniformsValue } from '../../../../src/@types/rendering/FocusUniformsValue';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { ConstellationsRuntime } from '../../../../src/layers/constellations/@types/ConstellationsRuntime';
import type { Label2D } from '../../../../src/@types/rendering/Label2D';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { positionedBodiesOf } from '../../../helpers/frame/positionedBodiesOf';
import { SEEDED_STAR_CATALOGS } from '../../../../src/data/bodies/seededStarCatalogs';

// Pinned at J2000 so anchors match the producer's `sceneBodyStates` read at `ctx.simDays`.
const J2000_STATES = deriveBodyStates(CONST_J2000);
const BASE = [
  ...sceneBodyLabels(J2000_STATES),
  ...SCENE_MESH_BODIES.map((b) => meshBodyCaption(b, J2000_STATES.get(b.id)!.positionMpc, 0)),
];

const EARTH_LABEL_ID = 'sceneBody-earth';
const PLANET_LABEL_IDS: ReadonlySet<string> = new Set(
  SCENE_PLANETS.map((p) => `sceneBody-${p.id}`),
);
const SGR_A_STAR_LABEL_ID = `sceneBody-${SGR_A_STAR_ENTRY.id}`;
const PETUNIAS_LABEL_ID = 'sceneBody-petunias';

function worldPosOf(id: string): Vec3 {
  return [...BASE.find((l) => l.id === id)!.worldPos] as Vec3;
}

// 720-px viewport, fovY 1 rad, tangent-exact.
const FIXTURE_PX_PER_RAD = 720 / (2 * Math.tan(1 / 2));

const SCENE_BODIES = positionedBodiesOf(
  [...SCENE_PLANETS, ...SCENE_MESH_BODIES, ...Object.values(SEEDED_STAR_CATALOGS).flat()],
  deriveBodyStates(CONST_J2000),
);

function makeCtx(camPos: Vec3): FrameView {
  return {
    snapshot: {
      bodyStates: deriveBodyStates(CONST_J2000),
      simDays: CONST_J2000,
      nowMs: 0,
      meshBodies: SCENE_MESH_BODIES,
      sceneBodies: SCENE_BODIES,
      focusBlend: 0,
      focus: ZERO_FOCUS,
    },
    drawCamPos: camPos,
    drawPxPerRad: FIXTURE_PX_PER_RAD,
    canvasSize: { width: 1280, height: 720 },
  } as unknown as FrameView;
}

/** The `label:body` entry value: a boolean switches every category; `over` sets a mid-ramp value. */
function fadeOf(
  bodyLabels: boolean | Readonly<Record<string, boolean>> = true,
  over: Readonly<Partial<Record<string, number>>> = {},
): Readonly<Record<string, number>> {
  const named: Record<string, boolean> = typeof bodyLabels === 'boolean' ? {} : bodyLabels;
  const unnamed = typeof bodyLabels === 'boolean' ? bodyLabels : true;
  return Object.fromEntries(
    ['earth', 'planet'].map((item) => [item, over[item] ?? ((named[item] ?? unnamed) ? 1 : 0)]),
  );
}

function makeState(): EngineState {
  return {
    // Real seed tables, so `sceneOccluderBodies` yields genuine J2000 occlude weights.
    gpu: {},
    settings: {
      missions: { craft: null },
      starCatalogs: {
        enabled: true,
        items: {
          famousStar: { enabled: true, labelEnabled: true },
          sun: { enabled: true, labelEnabled: true },
          sStar: { enabled: true, labelEnabled: false },
        },
      },
    },
  } as unknown as EngineState;
}

function fadeAlphaOf(labels: readonly Label2D[], id: string): number | undefined {
  return labels.find((l) => l.id === id)?.fadeAlpha;
}

function captionsAt(ctx: FrameView): readonly Label2D[] {
  return [
    ...produceSceneBodyCaptions(makeState(), ctx, fadeOf()).labels,
    ...produceMissionCaptions(makeState(), ctx, { craft: 1 }).labels,
  ];
}

function sgrAStarAlpha(state: EngineState, ctx: FrameView): number | undefined {
  return fadeAlphaOf(
    produceBlackHoleCaptions()(state, ctx, { [SGR_A_STAR_ENTRY.id]: 1 }).labels,
    SGR_A_STAR_LABEL_ID,
  );
}

describe('produceSceneBodyCaptions', () => {
  it('mutes only the planet captions when the planet row’s label is off', () => {
    const camPos = worldPosOf(EARTH_LABEL_ID);
    const out = produceSceneBodyCaptions(
      makeState(),
      makeCtx(camPos),
      fadeOf({ earth: true, planet: false }),
    );
    for (const id of PLANET_LABEL_IDS) expect(fadeAlphaOf(out.labels, id)).toBe(0);
    expect(fadeAlphaOf(out.labels, EARTH_LABEL_ID)).toBeGreaterThan(0);
  });

  it('mutes only the Earth caption when the earth row’s label is off', () => {
    const camPos = worldPosOf(EARTH_LABEL_ID);
    const out = produceSceneBodyCaptions(
      makeState(),
      makeCtx(camPos),
      fadeOf({ earth: false, planet: true }),
    );
    expect(fadeAlphaOf(out.labels, EARTH_LABEL_ID)).toBe(0);
    const anyPlanetOn = [...PLANET_LABEL_IDS].some((id) => (fadeAlphaOf(out.labels, id) ?? 0) > 0);
    expect(anyPlanetOn).toBe(true);
  });

  it('suppresses Earth + planet captions when both body rows’ labels are off', () => {
    const camPos = worldPosOf(EARTH_LABEL_ID);
    const onOut = produceSceneBodyCaptions(makeState(), makeCtx(camPos), fadeOf());
    expect(fadeAlphaOf(onOut.labels, EARTH_LABEL_ID)).toBeGreaterThan(0);

    const offOut = produceSceneBodyCaptions(makeState(), makeCtx(camPos), fadeOf(false));
    expect(fadeAlphaOf(offOut.labels, EARTH_LABEL_ID)).toBe(0);
    for (const id of PLANET_LABEL_IDS) expect(fadeAlphaOf(offOut.labels, id)).toBe(0);
  });

  it('drops a caption once its subject outgrows the viewport', () => {
    // `worldEmMpc` is the body's radius; at 2 radii the pot fills the frame and the caption's 1.5× lift leaves the top edge.
    const pot = BASE.find((l) => l.id === PETUNIAS_LABEL_ID)!;
    const camAt = (radii: number): Vec3 => [
      pot.worldPos[0] + radii * pot.worldEmMpc,
      pot.worldPos[1],
      pot.worldPos[2],
    ];

    expect(fadeAlphaOf(captionsAt(makeCtx(camAt(2))), PETUNIAS_LABEL_ID)).toBe(0);
    expect(fadeAlphaOf(captionsAt(makeCtx(camAt(100))), PETUNIAS_LABEL_ID)).toBe(1);
  });

  it('holds a seeded reveal caption dark until the approach, leaving an unbanded one lit', () => {
    // Sgr A* is the control from the SAME poses, so only the reveal band explains a difference.
    // Earth is the wrong control: this close to the pot it overflows Earth's own caption.
    const pot = BASE.find((l) => l.id === PETUNIAS_LABEL_ID)!;
    const revealMpc =
      SCENE_MESH_BODIES.find((b) => b.id === 'petunias')!.captionRevealM! * SCALE_UNITS.M_TO_MPC;
    const ctxAt = (distMpc: number): FrameView =>
      makeCtx([pot.worldPos[0] + distMpc, pot.worldPos[1], pot.worldPos[2]]);
    const labelsAt = (distMpc: number): readonly Label2D[] => captionsAt(ctxAt(distMpc));

    expect(fadeAlphaOf(labelsAt(3 * revealMpc), PETUNIAS_LABEL_ID)).toBe(0);
    expect(fadeAlphaOf(labelsAt(revealMpc), PETUNIAS_LABEL_ID)).toBe(1);
    expect(sgrAStarAlpha(makeState(), ctxAt(3 * revealMpc))).toBe(1);
    expect(sgrAStarAlpha(makeState(), ctxAt(revealMpc))).toBe(1);
  });

  it('emits a zero-target caption rather than omitting it', () => {
    const camPos = worldPosOf(EARTH_LABEL_ID);
    const out = produceSceneBodyCaptions(
      makeState(),
      makeCtx(camPos),
      fadeOf({ earth: false, planet: true }),
    );
    const earthLabel = out.labels.find((l) => l.id === EARTH_LABEL_ID);
    expect(earthLabel).toBeDefined();
    expect(earthLabel!.fadeAlpha).toBe(0);
  });

  it('a body caption scales by its own item of the handed value', () => {
    // Earth's band target is exactly 1 here, so a handed 0.5 must halve its alpha alone.
    const camPos = worldPosOf(EARTH_LABEL_ID);
    const out = produceSceneBodyCaptions(
      makeState(),
      makeCtx(camPos),
      fadeOf(true, { earth: 0.5 }),
    );
    expect(fadeAlphaOf(out.labels, EARTH_LABEL_ID)).toBeCloseTo(0.5);
    const planetId = [...PLANET_LABEL_IDS][0]!;
    const full = produceSceneBodyCaptions(makeState(), makeCtx(camPos), fadeOf());
    expect(fadeAlphaOf(out.labels, planetId)).toBe(fadeAlphaOf(full.labels, planetId));
  });

  it('constellation captions do not double-count the registry', () => {
    const layerFade = 0.5;
    const camPos: Vec3 = [5e-4, 0, 0];
    const runtime = {
      slot: {
        committed: () => ({
          kind: 'ready' as const,
          req: undefined,
          loadedAtMs: 0,
          value: {
            version: 1 as const,
            constellations: [{ name: 'Orion', labelAnchorPc: [1, 2, 3] as Vec3, segments: [] }],
          },
        }),
      },
    } as unknown as ConstellationsRuntime;
    const ctx = {
      snapshot: { focusBlend: 0, nowMs: 0, focus: ZERO_FOCUS },
      cam: { distance: 5e-4 },
      drawCamPos: camPos,
    } as unknown as FrameView;

    const out = produceConstellationCaptions(runtime)({} as EngineState, ctx, layerFade);
    expect(out.labels[0]!.fadeAlpha).toBeCloseTo(layerFade);
  });
});

/** The overlay shaders attenuate per PIXEL and cannot tell a subject in FRONT of a body from one behind; `occludeWeight` is the producer's verdict. */
describe('produceSceneBodyCaptions occlude weight', () => {
  const WHALE_LABEL_ID = 'sceneBody-whale';
  const MOON_LABEL_ID = 'sceneBody-moon';
  const EARTH_POS = worldPosOf(EARTH_LABEL_ID);

  function direction(a: Vec3, b: Vec3): Vec3 {
    const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const n = Math.hypot(d[0], d[1], d[2]);
    return [d[0] / n, d[1] / n, d[2] / n];
  }

  function step(from: Vec3, dir: Vec3, km: number): Vec3 {
    const d = km * SCALE_UNITS.KM_TO_MPC;
    return [from[0] + dir[0] * d, from[1] + dir[1] * d, from[2] + dir[2] * d];
  }

  function occludeWeightOf(camPos: Vec3, id: string): number | undefined {
    return captionsAt(makeCtx(camPos)).find((l) => l.id === id)?.occludeWeight;
  }

  it('exempts a caption whose subject floats in FRONT of Earth', () => {
    // The whale draws over Earth but its name vanished where the text crossed the disc.
    const whale = worldPosOf(WHALE_LABEL_ID);
    const camPos = step(whale, direction(EARTH_POS, whale), 200);
    expect(occludeWeightOf(camPos, WHALE_LABEL_ID)).toBe(0);
  });

  it('carries the subject’s NEAR-surface distance in km as the depth channel’s cutoff', () => {
    // Centre MINUS radius: the subject's own front surface sits exactly AT the cutoff, so a body never occludes its caption.
    const moon = worldPosOf(MOON_LABEL_ID);
    const camPos = step(EARTH_POS, direction(moon, EARTH_POS), 20000);
    const label = produceSceneBodyCaptions(makeState(), makeCtx(camPos), fadeOf()).labels.find(
      (l) => l.id === MOON_LABEL_ID,
    )!;
    const base = BASE.find((l) => l.id === MOON_LABEL_ID)!;
    const centreMpc = Math.hypot(
      base.worldPos[0] - camPos[0],
      base.worldPos[1] - camPos[1],
      base.worldPos[2] - camPos[2],
    );
    expect(label.occludeNearKm).toBeCloseTo(
      (centreMpc - base.worldEmMpc) * SCALE_UNITS.MPC_TO_M * SCALE_UNITS.M_TO_KM,
      0,
    );
    // The sphere-test and depth channels are independent; the fragment takes whichever fires.
    expect(label.occludeWeight).toBe(1);
  });

  it('keeps the per-pixel rule for a subject Earth really hides', () => {
    // Anti-Moon side of Earth: the Moon is behind the disc and must still sink into the limb.
    const moon = worldPosOf(MOON_LABEL_ID);
    const camPos = step(EARTH_POS, direction(moon, EARTH_POS), 20000);
    expect(occludeWeightOf(camPos, MOON_LABEL_ID)).toBe(1);
    expect(occludeWeightOf(camPos, EARTH_LABEL_ID)).toBe(0);
  });
});

describe('produceSceneBodyCaptions focus pick', () => {
  it('outside the focused sphere a caption draws but carries no pick; inside and at rest it keeps it', () => {
    const earth = worldPosOf(EARTH_LABEL_ID);
    const ctx = makeCtx(earth);
    const focus: FocusUniformsValue = {
      center: earth,
      apparentRadiusMpc: 1e-13,
      physicalRadiusMpc: 1e-13,
      blend: 1,
    };
    const focused = { ...ctx, snapshot: { ...ctx.snapshot, focus } } as FrameView;
    const pickOf = (labels: readonly Label2D[], id: string) =>
      labels.find((l) => l.id === id)!.pickId;
    const venus = 'sceneBody-venus';

    const rest = produceSceneBodyCaptions(makeState(), ctx, fadeOf()).labels;
    expect(pickOf(rest, venus)).toBeDefined();

    const under = produceSceneBodyCaptions(makeState(), focused, fadeOf()).labels;
    expect(pickOf(under, EARTH_LABEL_ID)).toBeDefined();
    expect(pickOf(under, venus)).toBeUndefined();
  });
});
