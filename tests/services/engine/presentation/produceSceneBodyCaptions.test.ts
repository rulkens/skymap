/**
 * produceSceneBodyCaptions — candidate math for the true-scale foreground
 * bodies core owns (Earth, the planets, Sgr A*, the mesh bodies). The seeded
 * stars and the Sun moved to the star Layer's `produceStarCaptions` —
 * `produceStarCaptions.test.ts` covers their kind routing, pick ids and
 * clip-channel split; the shared fade-band / occlusion / registry-ramp
 * mechanics stay covered here, once, on core's bodies.
 *
 * Cases moved from `foregroundLabelsPass.test.ts` (Task 4, spec §12): the
 * producer emits EVERY candidate caption every frame — declutter and the
 * temporal envelope moved to the director — so each case now reads the
 * candidate's `fadeAlpha` (the producer's TARGET) instead of asking whether
 * the id survived into the drawn/decluttered set.
 */

import { describe, it, expect } from 'vitest';

import { produceSceneBodyCaptions } from '../../../../src/services/engine/presentation/produceSceneBodyCaptions';
import { produceConstellationCaptions } from '../../../../src/layers/constellations/present/produceConstellationCaptions';
import { CAPTION_FADE_RULES } from '../../../../src/services/engine/presentation/captionFadeRules';
import { constellationLayerOpacity } from '../../../../src/layers/constellations/present/constellationLayerOpacity';
import {
  sceneBodyLabels,
  sceneBodyLabelId,
} from '../../../../src/services/engine/presentation/sceneBodyLabels';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC } from '../../../../src/services/engine/frame/solarSystemLabelMaxDistance';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';
import { SCENE_MESH_BODIES } from '../../../../src/data/bodies/sceneMeshBodies';
import { SGR_A_STAR_ENTRY } from '../../../../src/data/sources/sgr-a-star';
import { makeBodyItems } from '../../../fixtures/makeBodyItems';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';

import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { ConstellationsRuntime } from '../../../../src/layers/constellations/@types/ConstellationsRuntime';
import type { Label2D } from '../../../../src/@types/rendering/Label2D';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

// The producer binds its caption epoch to `ctx.simDays`; pin it at J2000 so
// this file's anchors match the producer's internal `sceneBodyStates` read.
const J2000_STATES = deriveBodyStates(CONST_J2000);
const BASE = sceneBodyLabels(J2000_STATES);

const EARTH_LABEL_ID = sceneBodyLabelId('earth');
const PLANET_LABEL_IDS: ReadonlySet<string> = new Set(
  SCENE_PLANETS.map((p) => sceneBodyLabelId(p.id)),
);
const SGR_A_STAR_LABEL_ID = sceneBodyLabelId(SGR_A_STAR_ENTRY.id);
const PETUNIAS_LABEL_ID = sceneBodyLabelId('petunias');

function worldPosOf(id: string): Vec3 {
  return [...BASE.find((l) => l.id === id)!.worldPos] as Vec3;
}

// 720-px viewport, fovY 1 rad, tangent-exact.
const FIXTURE_PX_PER_RAD = 720 / (2 * Math.tan(1 / 2));

function makeCtx(camPos: Vec3, distance = 5e-4): FrameView {
  return {
    snapshot: { simDays: CONST_J2000, nowMs: 0 },
    cam: { distance },
    drawCamPos: camPos,
    drawPxPerRad: FIXTURE_PX_PER_RAD,
    canvasSize: { width: 1280, height: 720 },
  } as unknown as FrameView;
}

/**
 * `bodyLabels` seeds ALL body rows from one flag by default, so a test that
 * only cares whether body captions are on at all passes a bare boolean; the
 * per-row cases pass the bits separately, which is the axis those rows buy.
 * Moved verbatim from `foregroundLabelsPass.test.ts`'s `makeState`.
 *
 * `starCatalogs` is a fixed, uninteresting fixture: `sceneOccluderBodies`
 * reads it (for the star-sphere occluder set), but no case here inspects a
 * star caption any more, so its values never drive an assertion.
 *
 * `registryOverrides`/`clipOverrides` key by a fade handle's `item` (e.g.
 * `'earth'`) / clip key (`'bodyLabel'`). Left at the defaults,
 * `fades.opacityOf` MIRRORS `labelEnabled` — the already-resolved state a
 * settled toggle reaches — so every case that doesn't care about the
 * mid-ramp value reads exactly as it did before the registry read existed.
 * Only the ramp-behaviour cases below diverge the two.
 */
function makeState(
  bodyLabels: boolean | Readonly<Record<string, boolean>> = true,
  registryOverrides: Readonly<Partial<Record<string, number>>> = {},
  clipOverrides: Readonly<Partial<Record<'bodyLabel', number>>> = {},
): EngineState {
  const named: Record<string, boolean> = typeof bodyLabels === 'boolean' ? {} : bodyLabels;
  const unnamed = typeof bodyLabels === 'boolean' ? bodyLabels : true;
  const bodyItems = makeBodyItems((id) => ({ labelEnabled: named[id] ?? unnamed }));
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
      },
    },
    settings: {
      bodies: { items: bodyItems },
      starCatalogs: {
        enabled: true,
        items: {
          famousStar: { enabled: true, labelEnabled: true },
          sun: { enabled: true, labelEnabled: true },
          sStar: { enabled: true, labelEnabled: false },
        },
      },
    },
    subsystems: {
      fades: {
        opacityOf: (handle: { item?: string }) => {
          const item = handle.item;
          if (item !== undefined && item in registryOverrides) return registryOverrides[item]!;
          return item !== undefined && (bodyItems[item]?.labelEnabled ?? true) ? 1 : 0;
        },
      },
      clipPlayer: {
        clipOpacityOf: (key: 'bodyLabel') => clipOverrides[key] ?? 1,
      },
    },
  } as unknown as EngineState;
}

function fadeAlphaOf(labels: readonly Label2D[], id: string): number | undefined {
  return labels.find((l) => l.id === id)?.fadeAlpha;
}

describe('produceSceneBodyCaptions', () => {
  it('mutes only the planet captions when the planet row’s label is off', () => {
    const camPos = worldPosOf(EARTH_LABEL_ID);
    const out = produceSceneBodyCaptions(
      makeState({ earth: true, planet: false }),
      makeCtx(camPos),
    );
    for (const id of PLANET_LABEL_IDS) expect(fadeAlphaOf(out.labels, id)).toBe(0);
    expect(fadeAlphaOf(out.labels, EARTH_LABEL_ID)).toBeGreaterThan(0);
  });

  it('mutes only the Earth caption when the earth row’s label is off', () => {
    const camPos = worldPosOf(EARTH_LABEL_ID);
    const out = produceSceneBodyCaptions(
      makeState({ earth: false, planet: true }),
      makeCtx(camPos),
    );
    expect(fadeAlphaOf(out.labels, EARTH_LABEL_ID)).toBe(0);
    const anyPlanetOn = [...PLANET_LABEL_IDS].some((id) => (fadeAlphaOf(out.labels, id) ?? 0) > 0);
    expect(anyPlanetOn).toBe(true);
  });

  it('suppresses Earth + planet captions when both body rows’ labels are off', () => {
    const camPos = worldPosOf(EARTH_LABEL_ID);
    const onOut = produceSceneBodyCaptions(makeState(), makeCtx(camPos));
    expect(fadeAlphaOf(onOut.labels, EARTH_LABEL_ID)).toBeGreaterThan(0);

    const offOut = produceSceneBodyCaptions(makeState(false), makeCtx(camPos));
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
    const out = produceSceneBodyCaptions(
      makeState(),
      makeCtx(camPos, SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC * 2),
    );
    expect(fadeAlphaOf(out.labels, SGR_A_STAR_LABEL_ID)).toBeGreaterThan(0);
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
        produceSceneBodyCaptions(makeState(), makeCtx(camAt(2))).labels,
        PETUNIAS_LABEL_ID,
      ),
    ).toBe(0);
    // Backed off, the same caption is untouched by the rule.
    expect(
      fadeAlphaOf(
        produceSceneBodyCaptions(makeState(), makeCtx(camAt(100))).labels,
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
    const labelsAt = (distMpc: number): readonly Label2D[] =>
      produceSceneBodyCaptions(
        makeState(),
        makeCtx([pot.worldPos[0] + distMpc, pot.worldPos[1], pot.worldPos[2]]),
      ).labels;

    // Past twice the reveal distance the pot's name is gone; at it, full.
    const far = labelsAt(3 * revealMpc);
    const near = labelsAt(revealMpc);
    expect(fadeAlphaOf(far, PETUNIAS_LABEL_ID)).toBe(0);
    expect(fadeAlphaOf(near, PETUNIAS_LABEL_ID)).toBe(1);
    expect(fadeAlphaOf(far, SGR_A_STAR_LABEL_ID)).toBe(1);
    expect(fadeAlphaOf(near, SGR_A_STAR_LABEL_ID)).toBe(1);
  });

  it('emits a zero-target caption rather than omitting it', () => {
    const camPos = worldPosOf(EARTH_LABEL_ID);
    const out = produceSceneBodyCaptions(
      makeState({ earth: false, planet: true }),
      makeCtx(camPos),
    );
    const earthLabel = out.labels.find((l) => l.id === EARTH_LABEL_ID);
    expect(earthLabel).toBeDefined();
    expect(earthLabel!.fadeAlpha).toBe(0);
  });

  it('a body caption dims with its fade-registry handle', () => {
    // Earth's band target is exactly 1 at this camera distance (well inside
    // `SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC`), so a registry opacity of 0.5
    // must halve the emitted alpha with nothing else in play.
    const camPos = worldPosOf(EARTH_LABEL_ID);
    const out = produceSceneBodyCaptions(makeState(true, { earth: 0.5 }), makeCtx(camPos));
    expect(fadeAlphaOf(out.labels, EARTH_LABEL_ID)).toBeCloseTo(0.5);
  });

  it('a body caption keeps being emitted while its registry ramp runs after the toggle goes off', () => {
    const camPos = worldPosOf(EARTH_LABEL_ID);

    // Toggle off, but the registry hasn't caught up yet (still 0.5 into its
    // fade-out ramp): the caption keeps showing at the ramped alpha rather
    // than truncating to 0 the instant the setting flips.
    const midRamp = produceSceneBodyCaptions(
      makeState({ earth: false, planet: true }, { earth: 0.5 }),
      makeCtx(camPos),
    );
    expect(fadeAlphaOf(midRamp.labels, EARTH_LABEL_ID)).toBeCloseTo(0.5);

    // Ramp complete (registry reaches 0): the caption is still EMITTED (the
    // zero-target contract) but its alpha has now reached 0 too.
    const rampDone = produceSceneBodyCaptions(
      makeState({ earth: false, planet: true }, { earth: 0 }),
      makeCtx(camPos),
    );
    const earthLabel = rampDone.labels.find((l) => l.id === EARTH_LABEL_ID);
    expect(earthLabel).toBeDefined();
    expect(earthLabel!.fadeAlpha).toBe(0);
  });

  it('a body caption dims with the bodyLabel clip channel', () => {
    const camPos = worldPosOf(EARTH_LABEL_ID);
    const out = produceSceneBodyCaptions(makeState(true, {}, { bodyLabel: 0.25 }), makeCtx(camPos));
    expect(fadeAlphaOf(out.labels, EARTH_LABEL_ID)).toBeCloseTo(0.25);
  });

  it('constellation captions do not double-count the registry', () => {
    // The row states its stance rather than omitting it: `null`, because
    // `produceConstellationCaptions` already composes its own registry read.
    expect(CAPTION_FADE_RULES.constellation.fadeHandle).toBeNull();

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
    const state = {
      subsystems: {
        fades: { opacityOf: () => layerFade },
        clipPlayer: { clipOpacityOf: () => 1 },
      },
    } as unknown as EngineState;
    const ctx = {
      snapshot: { focusBlend: 0, nowMs: 0 },
      cam: { distance: 5e-4 },
      drawCamPos: camPos,
    } as unknown as FrameView;

    const out = produceConstellationCaptions(runtime)(state, ctx);
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
  const WHALE_LABEL_ID = sceneBodyLabelId('whale');
  const MOON_LABEL_ID = sceneBodyLabelId('moon');
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
    return produceSceneBodyCaptions(makeState(), makeCtx(camPos)).labels.find((l) => l.id === id)
      ?.occludeWeight;
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
    const label = produceSceneBodyCaptions(makeState(), makeCtx(camPos)).labels.find(
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
