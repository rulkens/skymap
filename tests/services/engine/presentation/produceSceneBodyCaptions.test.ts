/**
 * produceSceneBodyCaptions — candidate math for the true-scale foreground
 * bodies (Earth, the local star map, the planets, Sgr A*).
 *
 * Cases moved from `foregroundLabelsLayer.test.ts` (Task 4, spec §12): the
 * producer emits EVERY candidate caption every frame — declutter and the
 * temporal envelope moved to the director — so each case now reads the
 * candidate's `fadeAlpha` (the producer's TARGET) instead of asking whether
 * the id survived into the drawn/decluttered set.
 */

import { describe, it, expect } from 'vitest';

import { produceSceneBodyCaptions } from '../../../../src/services/engine/presentation/produceSceneBodyCaptions';
import {
  sceneBodyLabels,
  sceneBodyLabelId,
  SCENE_STAR_LABEL_IDS,
} from '../../../../src/services/engine/presentation/sceneBodyLabels';
import { SCALE_FADE_BANDS } from '../../../../src/services/engine/presentation/scaleFadeBands';
import { SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC } from '../../../../src/services/engine/frame/solarSystemLabelMaxDistance';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';
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
  } as unknown as ReadyFrameContext;
}

/**
 * `bodyLabels` seeds ALL body rows from one flag by default, so a test that
 * only cares whether body captions are on at all passes a bare boolean; the
 * per-row cases pass the bits separately, which is the axis those rows buy.
 * Moved verbatim from `foregroundLabelsLayer.test.ts`'s `makeState`.
 */
function makeState(
  starMapLabelsEnabled = true,
  bodyLabels: boolean | Readonly<Record<string, boolean>> = true,
  starMapEnabled = true,
  sunVisible = true,
  starCatalogsMasterEnabled = true,
): EngineState {
  const named: Record<string, boolean> =
    typeof bodyLabels === 'boolean' ? {} : { ...bodyLabels, sun: bodyLabels.sun ?? true };
  const unnamed = typeof bodyLabels === 'boolean' ? bodyLabels : true;
  return {
    settings: {
      bodies: {
        items: makeBodyItems((id) => ({
          ...(id === 'sun' ? { enabled: sunVisible } : {}),
          labelEnabled: named[id] ?? unnamed,
        })),
      },
      starCatalogs: {
        enabled: starCatalogsMasterEnabled,
        items: { famousStar: { enabled: starMapEnabled, labelEnabled: starMapLabelsEnabled } },
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
});
