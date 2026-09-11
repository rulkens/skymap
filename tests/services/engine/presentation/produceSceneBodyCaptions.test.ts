/**
 * produceSceneBodyCaptions — candidate math for the true-scale foreground
 * bodies (Earth, the local star map, the planets, Sgr A*).
 *
 * Cases moved from `foregroundLabelsPass.test.ts` (Task 4, spec §12): the
 * producer emits EVERY candidate caption every frame — declutter and the
 * temporal envelope moved to the director — so each case now reads the
 * candidate's `fadeAlpha` (the producer's TARGET) instead of asking whether
 * the id survived into the drawn/decluttered set.
 */

import { describe, it, expect } from 'vitest';

import { produceSceneBodyCaptions } from '../../../../src/services/engine/presentation/produceSceneBodyCaptions';
import { produceConstellationCaptions } from '../../../../src/services/engine/presentation/produceConstellationCaptions';
import { CAPTION_FADE_RULES } from '../../../../src/services/engine/presentation/captionFadeRules';
import { constellationLayerOpacity } from '../../../../src/services/engine/presentation/constellationLayerOpacity';
import {
  sceneBodyLabels,
  sceneBodyLabelId,
  SCENE_STAR_LABEL_IDS,
} from '../../../../src/services/engine/presentation/sceneBodyLabels';
import { SCALE_FADE_BANDS } from '../../../../src/services/engine/presentation/scaleFadeBands';
import { SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC } from '../../../../src/services/engine/frame/solarSystemLabelMaxDistance';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';
import { SCENE_STARS } from '../../../../src/data/bodies/sceneStars';
import { SCENE_MESH_BODIES } from '../../../../src/data/bodies/sceneMeshBodies';
import { SGR_A_STAR_ENTRY } from '../../../../src/data/sources/sgr-a-star';
import { makeBodyItems } from '../../../fixtures/makeBodyItems';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';

import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { Label2D } from '../../../../src/@types/rendering/Label2D';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

// The producer binds its caption epoch to `ctx.simDays`; pin it at J2000 so
// this file's anchors match the producer's internal `sceneBodyStates` read.
const J2000_STATES = deriveBodyStates(CONST_J2000);
const BASE = sceneBodyLabels(J2000_STATES);

const SUN_LABEL_ID = sceneBodyLabelId('sun');
const EARTH_LABEL_ID = sceneBodyLabelId('earth');
const PROXIMA_LABEL_ID = sceneBodyLabelId('proxima-centauri');
const PLANET_LABEL_IDS: ReadonlySet<string> = new Set(
  SCENE_PLANETS.map((p) => sceneBodyLabelId(p.id)),
);
const SGR_A_STAR_LABEL_ID = sceneBodyLabelId(SGR_A_STAR_ENTRY.id);
const PETUNIAS_LABEL_ID = sceneBodyLabelId('petunias');

function worldPosOf(id: string): Vec3 {
  return [...BASE.find((l) => l.id === id)!.worldPos] as Vec3;
}

function makeCtx(camPos: Vec3, distance = 5e-4): ReadyFrameContext {
  return {
    cam: { distance },
    drawCamPos: camPos,
    fovYRad: 1,
    simDays: CONST_J2000,
    canvasSize: { width: 1280, height: 720 },
    nowMs: 0,
  } as unknown as ReadyFrameContext;
}

/**
 * `bodyLabels` seeds ALL body rows from one flag by default, so a test that
 * only cares whether body captions are on at all passes a bare boolean; the
 * per-row cases pass the bits separately, which is the axis those rows buy.
 * Moved verbatim from `foregroundLabelsPass.test.ts`'s `makeState`.
 *
 * `registryOverrides`/`clipOverrides` key by a fade handle's `item` (e.g.
 * `'earth'`, `'famousStar'`) / clip key (`'bodyLabel'`, `'starCatalogLabel'`).
 * Left at the defaults, `fades.opacityOf` MIRRORS `labelEnabled` — the
 * already-resolved state a settled toggle reaches — so every case that
 * doesn't care about the mid-ramp value reads exactly as it did before the
 * registry read existed. Only the ramp-behaviour cases below diverge the two.
 */
function makeState(
  starMapLabelsEnabled = true,
  bodyLabels: boolean | Readonly<Record<string, boolean>> = true,
  starMapEnabled = true,
  sunVisible = true,
  starCatalogsMasterEnabled = true,
  registryOverrides: Readonly<Partial<Record<string, number>>> = {},
  clipOverrides: Readonly<Partial<Record<'bodyLabel' | 'starCatalogLabel', number>>> = {},
): EngineState {
  const named: Record<string, boolean> =
    typeof bodyLabels === 'boolean' ? {} : { ...bodyLabels, sun: bodyLabels.sun ?? true };
  const unnamed = typeof bodyLabels === 'boolean' ? bodyLabels : true;
  const bodyItems = makeBodyItems((id) => ({
    ...(id === 'sun' ? { enabled: sunVisible } : {}),
    labelEnabled: named[id] ?? unnamed,
  }));
  return {
    // `sceneOccluderBodies` (the per-caption depth gate) reads the real seed
    // tables off the state, so the fixture carries them rather than a stub:
    // the captions' occlude weights are then the genuine J2000 geometry.
    gpu: { texturedBodyRenderer: null },
    data: {
      bodies: {
        earth: SCENE_EARTH,
        planets: SCENE_PLANETS,
        stars: SCENE_STARS,
        meshBodies: SCENE_MESH_BODIES,
      },
    },
    settings: {
      bodies: { items: bodyItems },
      starCatalogs: {
        enabled: starCatalogsMasterEnabled,
        items: { famousStar: { enabled: starMapEnabled, labelEnabled: starMapLabelsEnabled } },
      },
    },
    subsystems: {
      fades: {
        opacityOf: (handle: { item?: string }) => {
          const item = handle.item;
          if (item !== undefined && item in registryOverrides) return registryOverrides[item]!;
          if (item === 'famousStar') return starMapLabelsEnabled ? 1 : 0;
          return item !== undefined && (bodyItems[item]?.labelEnabled ?? true) ? 1 : 0;
        },
      },
      clipPlayer: {
        clipOpacityOf: (key: 'bodyLabel' | 'starCatalogLabel') => clipOverrides[key] ?? 1,
      },
    },
  } as unknown as EngineState;
}

function fadeAlphaOf(labels: readonly Label2D[], id: string): number | undefined {
  return labels.find((l) => l.id === id)?.fadeAlpha;
}

describe('produceSceneBodyCaptions', () => {
  it('suppresses the map captions when the star-map label toggle is off, Sun and Earth aside', () => {
    // Park the eye almost on Proxima — deep inside the neighbourhood, so its
    // caption target WOULD be nonzero; the toggle-off must still zero it.
    const proximaPos = worldPosOf(PROXIMA_LABEL_ID);
    const camPos: Vec3 = [proximaPos[0] - 1e-12, proximaPos[1], proximaPos[2]];

    const onOut = produceSceneBodyCaptions(makeState(true), makeCtx(camPos));
    expect(fadeAlphaOf(onOut.labels, PROXIMA_LABEL_ID)).toBeGreaterThan(0);

    // Toggle OFF: the map star's target drops to 0, but Earth and the Sun —
    // which rides the star seed table yet answers to its OWN body row — stay
    // nonzero. Muting the curated neighbourhood must not silence the descent's
    // aim point.
    const offOut = produceSceneBodyCaptions(makeState(false), makeCtx(camPos));
    expect(fadeAlphaOf(offOut.labels, PROXIMA_LABEL_ID)).toBe(0);
    expect(fadeAlphaOf(offOut.labels, SUN_LABEL_ID)).toBeGreaterThan(0);
    expect(fadeAlphaOf(offOut.labels, EARTH_LABEL_ID)).toBeGreaterThan(0);
  });

  it('mutes only the Sun caption when the sun row’s label is off', () => {
    const camPos = worldPosOf(EARTH_LABEL_ID);
    const out = produceSceneBodyCaptions(
      makeState(true, { earth: true, planet: true, sun: false }),
      makeCtx(camPos),
    );
    expect(fadeAlphaOf(out.labels, SUN_LABEL_ID)).toBe(0);
    expect(fadeAlphaOf(out.labels, PROXIMA_LABEL_ID)).toBeGreaterThan(0);
  });

  it('mutes the Sun caption when its own visibility row is off, even with its label on', () => {
    // `visibleStars` hides the Sun's DOT when `bodies.items.sun.enabled` is
    // false; the caption must not survive that gate. `sunVisible: false` here
    // with the Sun's `labelEnabled` still true isolates exactly that axis.
    const camPos = worldPosOf(EARTH_LABEL_ID);
    const out = produceSceneBodyCaptions(
      makeState(true, { earth: true, planet: true, sun: true }, true, /* sunVisible */ false),
      makeCtx(camPos),
    );
    expect(fadeAlphaOf(out.labels, SUN_LABEL_ID)).toBe(0);
    expect(fadeAlphaOf(out.labels, EARTH_LABEL_ID)).toBeGreaterThan(0);
  });

  it('suppresses the star map but KEEPS the Sun when the famous-star row is off', () => {
    const camPos = worldPosOf(EARTH_LABEL_ID);
    const onOut = produceSceneBodyCaptions(makeState(true, true, true), makeCtx(camPos));
    expect(fadeAlphaOf(onOut.labels, PROXIMA_LABEL_ID)).toBeGreaterThan(0);

    const offOut = produceSceneBodyCaptions(makeState(true, true, false), makeCtx(camPos));
    expect(fadeAlphaOf(offOut.labels, PROXIMA_LABEL_ID)).toBe(0);
    expect(fadeAlphaOf(offOut.labels, SUN_LABEL_ID)).toBeGreaterThan(0);
    expect(fadeAlphaOf(offOut.labels, EARTH_LABEL_ID)).toBeGreaterThan(0);
  });

  it('mutes the star map when the cluster master is off, even with the row and label on', () => {
    // `subjectVisible` for the star row is `starCatalogs.enabled &&
    // items.famousStar.enabled` — a caption must not survive the cluster
    // master that hid the dot it names.
    const camPos = worldPosOf(EARTH_LABEL_ID);
    const out = produceSceneBodyCaptions(
      makeState(true, true, true, true, /* starCatalogsMasterEnabled */ false),
      makeCtx(camPos),
    );
    expect(fadeAlphaOf(out.labels, PROXIMA_LABEL_ID)).toBe(0);
    expect(fadeAlphaOf(out.labels, SUN_LABEL_ID)).toBeGreaterThan(0);
    expect(fadeAlphaOf(out.labels, EARTH_LABEL_ID)).toBeGreaterThan(0);
  });

  it('mutes only the planet captions when the planet row’s label is off', () => {
    const camPos = worldPosOf(EARTH_LABEL_ID);
    const out = produceSceneBodyCaptions(
      makeState(true, { earth: true, planet: false }),
      makeCtx(camPos),
    );
    for (const id of PLANET_LABEL_IDS) expect(fadeAlphaOf(out.labels, id)).toBe(0);
    expect(fadeAlphaOf(out.labels, EARTH_LABEL_ID)).toBeGreaterThan(0);
  });

  it('mutes only the Earth caption when the earth row’s label is off', () => {
    const camPos = worldPosOf(EARTH_LABEL_ID);
    const out = produceSceneBodyCaptions(
      makeState(true, { earth: false, planet: true }),
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

    // Both body rows off (the boolean form of `bodyLabels`): Earth/planet
    // targets drop to 0, but the star map — an independent toggle — still
    // shows.
    const offOut = produceSceneBodyCaptions(makeState(true, false), makeCtx(camPos));
    expect(fadeAlphaOf(offOut.labels, EARTH_LABEL_ID)).toBe(0);
    expect(fadeAlphaOf(offOut.labels, PROXIMA_LABEL_ID)).toBeGreaterThan(0);
  });

  it('shows the local neighbourhood at full alpha from Earth and none beyond the neighbourhood', () => {
    const starLabels = (labels: readonly Label2D[]) =>
      labels.filter((l) => SCENE_STAR_LABEL_IDS.has(l.id));

    const camPos = worldPosOf(EARTH_LABEL_ID);
    const fullAlphaStarIds = BASE.filter((l) => SCENE_STAR_LABEL_IDS.has(l.id))
      .filter((l) => {
        const distPc =
          Math.hypot(
            l.worldPos[0] - camPos[0],
            l.worldPos[1] - camPos[1],
            l.worldPos[2] - camPos[2],
          ) / SCALE_UNITS.PC_TO_MPC;
        return distPc <= SCALE_FADE_BANDS.starCaption.fullAt;
      })
      .map((l) => l.id);
    expect(fullAlphaStarIds.length).toBeGreaterThan(0);

    const nearOut = produceSceneBodyCaptions(makeState(), makeCtx(camPos));
    const byId = new Map(starLabels(nearOut.labels).map((l) => [l.id, l]));
    for (const id of fullAlphaStarIds) {
      const emitted = byId.get(id);
      expect(emitted, `expected ${id} emitted from Earth`).toBeDefined();
      expect(emitted!.fadeAlpha, `expected ${id} at full alpha from Earth`).toBe(1);
    }

    // Far outside the neighbourhood (Mpc-scale, past every seed's gone edge):
    // every star caption's target is 0.
    const farOut = produceSceneBodyCaptions(makeState(), makeCtx([2, 3, 5]));
    for (const l of starLabels(farOut.labels)) expect(l.fadeAlpha).toBe(0);
  });

  it('fades the Sun caption in on descent — exactly 0 at the enable gate, no pop', () => {
    // The Sun sits at the render origin, so parking the eye `originDistMpc`
    // out along +X makes the Sun caption's own distance-from-camera equal
    // that value — the quantity `sunCaption` keys on.
    const sunFadeAt = (originDistMpc: number): number =>
      fadeAlphaOf(
        produceSceneBodyCaptions(makeState(), makeCtx([originDistMpc, 0, 0])).labels,
        SUN_LABEL_ID,
      )!;

    // At the enable gate the target is EXACTLY 0 — the no-pop anchor:
    // `goneAt` equals the layer's (former) enable gate BY IMPORT.
    expect(sunFadeAt(SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC)).toBe(0);

    // Mid-band: a genuine fraction, strictly inside (0, 1).
    const mid = sunFadeAt(0.75 * SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);

    // At and below the full edge (half the gate distance) the target holds at
    // full alpha all the way down.
    expect(sunFadeAt(SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC / 2)).toBe(1);
    expect(sunFadeAt(1e-5)).toBe(1);
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

  it('composes prominencePx so the kind tier dominates apparent size', () => {
    // Park the eye almost on Proxima: its apparent size is enormous while the
    // Sun, 1.3 pc away, is sub-pixel — pure apparent-size priority would rank
    // Proxima above the Sun. The composed score (tier · TIER_SCALE + clamped
    // size) must still rank the Sun higher: kind tier (sun 40 > star 10)
    // dominates, apparent size only breaks ties within a tier.
    const proximaPos = worldPosOf(PROXIMA_LABEL_ID);
    const camPos: Vec3 = [proximaPos[0] - 1e-12, proximaPos[1], proximaPos[2]];
    const out = produceSceneBodyCaptions(makeState(), makeCtx(camPos));

    const sunProminence = out.labels.find((l) => l.id === SUN_LABEL_ID)!.prominencePx!;
    const proximaProminence = out.labels.find((l) => l.id === PROXIMA_LABEL_ID)!.prominencePx!;
    expect(sunProminence).toBeGreaterThan(proximaProminence);
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

  it('emits a zero-target caption rather than omitting it', () => {
    const camPos = worldPosOf(EARTH_LABEL_ID);
    const out = produceSceneBodyCaptions(
      makeState(true, { earth: false, planet: true }),
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
    const out = produceSceneBodyCaptions(
      makeState(true, true, true, true, true, { earth: 0.5 }),
      makeCtx(camPos),
    );
    expect(fadeAlphaOf(out.labels, EARTH_LABEL_ID)).toBeCloseTo(0.5);
  });

  it('a body caption keeps being emitted while its registry ramp runs after the toggle goes off', () => {
    const camPos = worldPosOf(EARTH_LABEL_ID);

    // Toggle off, but the registry hasn't caught up yet (still 0.5 into its
    // fade-out ramp): the caption keeps showing at the ramped alpha rather
    // than truncating to 0 the instant the setting flips.
    const midRamp = produceSceneBodyCaptions(
      makeState(true, { earth: false, planet: true }, true, true, true, { earth: 0.5 }),
      makeCtx(camPos),
    );
    expect(fadeAlphaOf(midRamp.labels, EARTH_LABEL_ID)).toBeCloseTo(0.5);

    // Ramp complete (registry reaches 0): the caption is still EMITTED (the
    // zero-target contract) but its alpha has now reached 0 too.
    const rampDone = produceSceneBodyCaptions(
      makeState(true, { earth: false, planet: true }, true, true, true, { earth: 0 }),
      makeCtx(camPos),
    );
    const earthLabel = rampDone.labels.find((l) => l.id === EARTH_LABEL_ID);
    expect(earthLabel).toBeDefined();
    expect(earthLabel!.fadeAlpha).toBe(0);
  });

  it('the star-map captions dim with the starCatalogLabel clip channel', () => {
    const camPos = worldPosOf(EARTH_LABEL_ID);
    const out = produceSceneBodyCaptions(
      makeState(true, true, true, true, true, {}, { starCatalogLabel: 0.25 }),
      makeCtx(camPos),
    );
    // The star map's full-alpha members scale by the clip channel...
    expect(fadeAlphaOf(out.labels, PROXIMA_LABEL_ID)).toBeCloseTo(0.25);
    // ...but the body kinds read the SEPARATE bodyLabel clip key, untouched
    // here, so Earth stays at its unscaled band target.
    expect(fadeAlphaOf(out.labels, EARTH_LABEL_ID)).toBeCloseTo(1);
  });

  it('constellation captions do not double-count the registry', () => {
    // The row states its stance rather than omitting it: `null`, because
    // `produceConstellationCaptions` already composes its own registry read.
    expect(CAPTION_FADE_RULES.constellation.fadeHandle).toBeNull();

    const layerFade = 0.5;
    const camPos: Vec3 = [5e-4, 0, 0];
    const state = {
      assetSlots: {
        constellations: {
          state: () => ({
            kind: 'ready' as const,
            value: {
              version: 1 as const,
              constellations: [{ name: 'Orion', labelAnchorPc: [1, 2, 3] as Vec3, segments: [] }],
            },
          }),
        },
      },
      subsystems: {
        fades: { opacityOf: () => layerFade },
        clipPlayer: { clipOpacityOf: () => 1 },
      },
    } as unknown as EngineState;
    const ctx = {
      cam: { distance: 5e-4 },
      drawCamPos: camPos,
      focusBlend: 0,
      nowMs: 0,
    } as unknown as ReadyFrameContext;

    const out = produceConstellationCaptions(state, ctx);
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
