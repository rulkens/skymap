/**
 * produceSceneBodyCaptions — candidate math for the true-scale foreground
 * bodies core owns (Earth, the planets, the mesh bodies), read beside the
 * blackHoles Layer's Galactic Centre caption where a case needs a control
 * whose reach is not the solar system's. The seeded
 * stars and the Sun moved to the star Layer's `produceStarCaptions` —
 * `produceStarCaptions.test.ts` covers their kind routing, pick ids and
 * clip-channel split; the shared fade-band / occlusion / registry-ramp
 * mechanics stay covered here, once, on core's bodies.
 *
 * Cases moved from `labelsNearPass.test.ts` (Task 4, spec §12): the
 * producer emits EVERY candidate caption every frame — declutter and the
 * temporal envelope moved to the director — so each case now reads the
 * candidate's `fadeAlpha` (the producer's TARGET) instead of asking whether
 * the id survived into the drawn/decluttered set.
 */

import { ZERO_FOCUS } from '../../../../src/services/engine/subsystems/structureFocusSubsystem';
import { describe, it, expect } from 'vitest';

import { produceSceneBodyCaptions } from '../../../../src/services/engine/presentation/produceSceneBodyCaptions';
import { produceBlackHoleCaptions } from '../../../../src/layers/blackHoles/present/produceBlackHoleCaptions';
import { produceConstellationCaptions } from '../../../../src/layers/constellations/present/produceConstellationCaptions';
import { CAPTION_FADE_RULES } from '../../../../src/services/engine/presentation/captionFadeRules';
import { constellationLayerOpacity } from '../../../../src/layers/constellations/present/constellationLayerOpacity';
import { sceneBodyLabels } from '../../../../src/services/engine/presentation/sceneBodyLabels';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC } from '../../../../src/services/engine/frame/solarSystemLabelMaxDistance';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';
import { SCENE_MESH_BODIES } from '../../../../src/data/bodies/sceneMeshBodies';
import { SGR_A_STAR_ENTRY } from '../../../../src/layers/blackHoles/sources/sgrAStar';
import { APP_VISIBILITY } from '../../../../src/compositions/appVisibility';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';

import type { FocusUniformsValue } from '../../../../src/@types/rendering/FocusUniformsValue';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { ConstellationsRuntime } from '../../../../src/layers/constellations/@types/ConstellationsRuntime';
import type { Label2D } from '../../../../src/@types/rendering/Label2D';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { positionedBodiesOf } from '../../../helpers/frame/positionedBodiesOf';
import { SEEDED_STAR_CATALOGS } from '../../../../src/data/bodies/seededStarCatalogs';

// The producer binds its caption epoch to `ctx.simDays`; pin it at J2000 so
// this file's anchors match the producer's internal `sceneBodyStates` read.
const J2000_STATES = deriveBodyStates(CONST_J2000);
const BASE = sceneBodyLabels(J2000_STATES, CONST_J2000, new Set());

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

// The frame's scene bodies as core hands them, at the fixture's J2000 instant.
const SCENE_BODIES = positionedBodiesOf(
  [...SCENE_PLANETS, ...SCENE_MESH_BODIES, ...Object.values(SEEDED_STAR_CATALOGS).flat()],
  deriveBodyStates(CONST_J2000),
);

function makeCtx(camPos: Vec3, distance = 5e-4): FrameView {
  return {
    snapshot: {
      simDays: CONST_J2000,
      nowMs: 0,
      meshBodies: SCENE_MESH_BODIES,
      sceneBodies: SCENE_BODIES,
      focusBlend: 0,
      focus: ZERO_FOCUS,
    },
    cam: { distance },
    drawCamPos: camPos,
    drawPxPerRad: FIXTURE_PX_PER_RAD,
    canvasSize: { width: 1280, height: 720 },
  } as unknown as FrameView;
}

/**
 * The value core hands for the `label:body` entry. A bare boolean switches every
 * caption category on or off; the per-category cases pass them separately. Left at
 * the defaults a switched-on category reads 1 and a switched-off one 0 (the settled
 * value its fade reaches); `over` replaces one with a mid-ramp or clipped value.
 */
function fadeOf(
  bodyLabels: boolean | Readonly<Record<string, boolean>> = true,
  over: Readonly<Partial<Record<string, number>>> = {},
): Readonly<Record<string, number>> {
  const named: Record<string, boolean> = typeof bodyLabels === 'boolean' ? {} : bodyLabels;
  const unnamed = typeof bodyLabels === 'boolean' ? bodyLabels : true;
  return Object.fromEntries(
    ['earth', 'planet', 'mesh-body'].map((item) => [
      item,
      over[item] ?? ((named[item] ?? unnamed) ? 1 : 0),
    ]),
  );
}

function makeState(): EngineState {
  return {
    // `sceneOccluderBodies` (the per-caption depth gate) reads the real seed
    // tables off the state, so the fixture carries them rather than a stub:
    // the captions' occlude weights are then the genuine J2000 geometry.
    gpu: { texturedBodyRenderer: null },
    data: {
      bodies: {
        earth: SCENE_EARTH,
        planets: SCENE_PLANETS,
        meshBodies: SCENE_MESH_BODIES,
        sceneBodies: SCENE_BODIES,
      },
    },
    settings: {
      starCatalogs: {
        enabled: true,
        items: {
          famousStar: { enabled: true, labelEnabled: true },
          sun: { enabled: true, labelEnabled: true },
          sStar: { enabled: true, labelEnabled: false },
        },
      },
    },
    // The composed entries core derives the claimed bodies from.
    visibilityEntries: APP_VISIBILITY,
  } as unknown as EngineState;
}

function fadeAlphaOf(labels: readonly Label2D[], id: string): number | undefined {
  return labels.find((l) => l.id === id)?.fadeAlpha;
}

/** The Galactic Centre caption, from its own Layer's producer. */
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

  it('keeps captioning Sgr A* past the solar-system gate while Earth and the planets go dark', () => {
    // `captionFadeRules.sgrAStar` takes NO SOLAR_SYSTEM_REACH row — it is the
    // one caption whose reach outlives the solar-system gate (8 kpc away, and
    // the galaxy-framing view that most needs it). Camera near Earth keeps the
    // Sgr A*-to-camera distance essentially R0 (fullAt on its own band, ~1 AU
    // of slack against an 8 kpc scale) while `ctx.cam.distance` — the
    // SEPARATE quantity Earth/planet's SOLAR_SYSTEM_REACH gate reads — is
    // pushed past the gate, so Earth and the planets must read exactly 0.
    const camPos = worldPosOf(EARTH_LABEL_ID);
    const ctx = makeCtx(camPos, SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC * 2);
    const out = produceSceneBodyCaptions(makeState(), ctx, fadeOf());
    expect(sgrAStarAlpha(makeState(), ctx)).toBeGreaterThan(0);
    expect(fadeAlphaOf(out.labels, EARTH_LABEL_ID)).toBe(0);
    for (const id of PLANET_LABEL_IDS) expect(fadeAlphaOf(out.labels, id)).toBe(0);
  });

  it('drops a caption once its subject outgrows the viewport', () => {
    // `worldEmMpc` is the body's radius, so a camera this far out sees the pot
    // subtend the full frame height — and its caption's own 1.5× lift would
    // carry it clean off the top edge, leader line and all.
    const pot = BASE.find((l) => l.id === PETUNIAS_LABEL_ID)!;
    const camAt = (radii: number): Vec3 => [
      pot.worldPos[0] + radii * pot.worldEmMpc,
      pot.worldPos[1],
      pot.worldPos[2],
    ];

    // At the mesh body's own 2-radii standoff — the pose an approach parks at.
    expect(
      fadeAlphaOf(
        produceSceneBodyCaptions(makeState(), makeCtx(camAt(2)), fadeOf()).labels,
        PETUNIAS_LABEL_ID,
      ),
    ).toBe(0);
    // Backed off, the same caption is untouched by the rule.
    expect(
      fadeAlphaOf(
        produceSceneBodyCaptions(makeState(), makeCtx(camAt(100)), fadeOf()).labels,
        PETUNIAS_LABEL_ID,
      ),
    ).toBe(1);
  });

  it('holds a seeded reveal caption dark until the approach, leaving an unbanded one lit', () => {
    // The petunias author `captionRevealM`; Sgr A* — 8 kpc away, so untouched
    // by a camera nudge measured in Earth-orbit metres, and carrying no reveal
    // band — is the control read from the SAME two poses, so only the band
    // can explain a difference. (Earth itself is the wrong control here: the
    // pot orbits 400 km up, so a camera this close to it is also close enough
    // to Earth's own disc to overflow Earth's caption — see the viewport-
    // overflow case above.)
    const pot = BASE.find((l) => l.id === PETUNIAS_LABEL_ID)!;
    const revealMpc =
      SCENE_MESH_BODIES.find((b) => b.id === 'petunias')!.captionRevealM! * SCALE_UNITS.M_TO_MPC;
    const ctxAt = (distMpc: number): FrameView =>
      makeCtx([pot.worldPos[0] + distMpc, pot.worldPos[1], pot.worldPos[2]]);
    const labelsAt = (distMpc: number): readonly Label2D[] =>
      produceSceneBodyCaptions(makeState(), ctxAt(distMpc), fadeOf()).labels;

    // Past twice the reveal distance the pot's name is gone; at it, full.
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
    // Earth's band target is exactly 1 at this camera distance (well inside
    // `SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC`), so a handed 0.5 must halve the emitted
    // alpha with nothing else in play, and the planets (handed 1) stay untouched.
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
    // The row states its stance rather than omitting it: `null`, because
    // `produceConstellationCaptions` already paints with its handed value.
    expect(CAPTION_FADE_RULES.constellation.fadeItem).toBeNull();

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
    const camDistMpc = Math.hypot(camPos[0], camPos[1], camPos[2]);
    expect(out.labels[0]!.fadeAlpha).toBeCloseTo(constellationLayerOpacity(camDistMpc, layerFade));
  });
});

/**
 * The per-caption depth gate. The overlay shaders attenuate per PIXEL, which
 * cannot tell a subject in FRONT of a body from one behind it; `occludeWeight`
 * is the producer's verdict on that, and these are its two real poses.
 */
describe('produceSceneBodyCaptions occlude weight', () => {
  const WHALE_LABEL_ID = 'sceneBody-whale';
  const MOON_LABEL_ID = 'sceneBody-moon';
  const EARTH_POS = worldPosOf(EARTH_LABEL_ID);

  /** Unit vector from `a` to `b`, in the Mpc frame the captions live in. */
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
    return produceSceneBodyCaptions(makeState(), makeCtx(camPos), fadeOf()).labels.find(
      (l) => l.id === id,
    )?.occludeWeight;
  }

  it('exempts a caption whose subject floats in FRONT of Earth', () => {
    // The reported bug: the whale orbits 400 km up and draws over Earth, but
    // its name vanished wherever the text crossed the disc. Eye 200 km further
    // out along the same ray — Earth fills the background, nothing stands
    // between the eye and the whale.
    const whale = worldPosOf(WHALE_LABEL_ID);
    const camPos = step(whale, direction(EARTH_POS, whale), 200);
    expect(occludeWeightOf(camPos, WHALE_LABEL_ID)).toBe(0);
  });

  it('carries the subject’s NEAR-surface distance in km as the depth channel’s cutoff', () => {
    // The sampled-depth channel compares a scene texel's distance against this.
    // The subject's own front surface sits exactly AT it, so a body never
    // occludes its own caption — which is why it is centre MINUS radius.
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
    // A subject the sphere test calls occluded keeps weight 1 — the two
    // channels are independent, and the fragment takes whichever fires.
    expect(label.occludeWeight).toBe(1);
  });

  it('keeps the per-pixel rule for a subject Earth really hides', () => {
    // Eye on the anti-Moon side of Earth, well clear of the surface: the Moon
    // is behind the disc and must still sink into the limb.
    const moon = worldPosOf(MOON_LABEL_ID);
    const camPos = step(EARTH_POS, direction(moon, EARTH_POS), 20000);
    expect(occludeWeightOf(camPos, MOON_LABEL_ID)).toBe(1);
    // Earth's own caption is anchored at Earth's centre — it must never be
    // occluded by the body it names.
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
