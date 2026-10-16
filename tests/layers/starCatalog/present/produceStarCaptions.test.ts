/**
 * produceStarCaptions — the star Layer's twin of `produceSceneBodyCaptions`'s
 * tests: candidate math for the curated map and the Sun. Cases specific to
 * the star family (kind routing, pick ids, each caption reading its own item of
 * the handed value) live here; the shared fade-band / occlusion mechanics stay
 * covered once, on core's bodies, in `produceSceneBodyCaptions.test.ts`.
 */

import { ZERO_FOCUS } from '../../../../src/services/engine/subsystems/structureFocusSubsystem';
import { describe, it, expect } from 'vitest';

import { produceStarCaptions } from '../../../../src/layers/starCatalog/present/produceStarCaptions';
import { SCENE_STARS } from '../../../../src/data/bodies/sceneStars';
import { SCENE_SUN } from '../../../../src/data/bodies/sceneSun';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';
import { SCENE_MESH_BODIES } from '../../../../src/data/bodies/sceneMeshBodies';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import {
  packSelection,
  unpackPick,
  PICK_SENTINEL_OFFSET,
} from '../../../../src/data/selectionEncoding';
import { Source } from '../../../../src/data/source';
import { selectionResolverOver } from '../../../support/selectionResolverOver';
import type { StarRowFixture } from '../../../support/selectionResolverOver';

import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { Label2D } from '../../../../src/@types/rendering/Label2D';
import type { ForegroundCaption } from '../../../../src/services/engine/presentation/foregroundCaption';
import { positionedBodiesOf } from '../../../helpers/frame/positionedBodiesOf';
import { SEEDED_STAR_CATALOGS } from '../../../../src/data/bodies/seededStarCatalogs';

const J2000_STATES = deriveBodyStates(CONST_J2000);
// Earth: ~1 AU from the Sun (negligible at parsec scale) and, by
// `SCALE_FADE_BANDS.starCaption`'s construction off the farthest catalogued
// star, within EVERY famous star's full-alpha band too — the one camera pose
// that reads every seeded catalog at its unclipped target.
const EARTH_POS = J2000_STATES.get('earth')!.positionMpc;

const PROXIMA_ID = 'sceneBody-proxima-centauri';
const SUN_ID = 'sceneBody-sun';
const PROXIMA_INDEX = SCENE_STARS.findIndex((star) => star.id === 'proxima-centauri');

/** No survey catalog loaded — irrelevant here, since seeded picks (the Sun,
 *  the famous stars) resolve without consulting the renderer. */
const NO_STARS_LOADED: StarRowFixture = {
  renderer: { loadedCatalogs: () => [][Symbol.iterator]() },
} as unknown as StarRowFixture;

const FIXTURE_PX_PER_RAD = 720 / (2 * Math.tan(1 / 2));

// The frame's scene bodies as core hands them, at the fixture's J2000 instant.
const SCENE_BODIES = positionedBodiesOf(
  [...SCENE_PLANETS, ...SCENE_MESH_BODIES, ...Object.values(SEEDED_STAR_CATALOGS).flat()],
  deriveBodyStates(CONST_J2000),
);

function makeCtx(camPos: Vec3, focusBlend = 0): FrameView {
  return {
    snapshot: {
      simDays: CONST_J2000,
      nowMs: 0,
      meshBodies: SCENE_MESH_BODIES,
      sceneBodies: SCENE_BODIES,
      focusBlend,
      focus: { ...ZERO_FOCUS, blend: focusBlend },
    },
    cam: { distance: 5e-4 },
    drawCamPos: camPos,
    drawPxPerRad: FIXTURE_PX_PER_RAD,
    canvasSize: { width: 1280, height: 720 },
  } as unknown as FrameView;
}

/** The body records `sceneOccluderBodies`/`sceneBodyPartition` need to not throw. */
function makeState(): EngineState {
  return {
    gpu: { texturedBodyRenderer: null },
    data: { bodies: { earth: SCENE_EARTH, planets: SCENE_PLANETS, meshBodies: SCENE_MESH_BODIES } },
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
  } as unknown as EngineState;
}

/** The value core hands for the `label:starCatalog` entry. */
const handed = (famousStar: number, sun = 1) => ({ famousStar, sun });

function fadeAlphaOf(labels: readonly Label2D[], id: string): number | undefined {
  return labels.find((l) => l.id === id)?.fadeAlpha;
}

describe('produceStarCaptions', () => {
  it('scales by the handed value exactly once', () => {
    // At full blend: the director recedes captions, so a producer that receded on
    // its own would land below 0.25.
    const alphaOf = (value: number, blend: number) =>
      fadeAlphaOf(
        produceStarCaptions()(makeState(), makeCtx(EARTH_POS, blend), handed(value)).labels,
        PROXIMA_ID,
      );
    const full = alphaOf(1, 0)!;
    expect(full).toBeGreaterThan(0);
    expect(alphaOf(0.25, 1)).toBeCloseTo(full * 0.25, 10);
  });

  it('captions every drawn famous star and the Sun with their kinds, and no S-star', () => {
    // `Label2DProducerOutput` types its labels as the base `Label2D`, but
    // every one this producer emits is built by `bodyCaption` and so carries
    // `kind` at runtime — the cast states that once, for every case below.
    const out = produceStarCaptions()(makeState(), makeCtx(EARTH_POS), handed(1))
      .labels as readonly ForegroundCaption[];

    // No S-star ever enters: SCENE_S_STARS is 39 rows, so a count this size
    // would be off by 39 if one leaked in.
    expect(out).toHaveLength(SCENE_STARS.length + SCENE_SUN.length);
    expect(out.filter((l) => l.kind === 'star')).toHaveLength(SCENE_STARS.length);
    expect(out.filter((l) => l.kind === 'sun')).toHaveLength(SCENE_SUN.length);

    const proxima = out.find((l) => l.id === PROXIMA_ID)!;
    expect(proxima.kind).toBe('star');
    expect(proxima.pickId).toBe(
      packSelection(Source.FamousStar, PROXIMA_INDEX + PICK_SENTINEL_OFFSET),
    );

    const sun = out.find((l) => l.id === SUN_ID)!;
    expect(sun.kind).toBe('sun');
    expect(sun.pickId).toBe(packSelection(Source.Sun, PICK_SENTINEL_OFFSET));
  });

  it("a star caption's pickId decodes and resolves to that star's starCatalog ref", () => {
    // Clicking the NAME is the affordance under test: this fails if
    // `bodyCaption`'s source/index packing ever drifts from the seed table
    // `seededStarCatalogsBySource.ts` tags picks against.
    const resolver = selectionResolverOver(
      { byId: () => null, byCategory: () => [] },
      undefined,
      NO_STARS_LOADED,
    );
    const out = produceStarCaptions()(makeState(), makeCtx(EARTH_POS), handed(1));

    const proxima = out.labels.find((l) => l.id === PROXIMA_ID)!;
    const proximaPick = unpackPick(proxima.pickId!)!;
    expect(resolver.resolvePick(proximaPick)).toEqual({
      type: 'starCatalog',
      source: Source.FamousStar,
      index: PROXIMA_INDEX,
    });

    const sun = out.labels.find((l) => l.id === SUN_ID)!;
    const sunPick = unpackPick(sun.pickId!)!;
    expect(resolver.resolvePick(sunPick)).toEqual({
      type: 'starCatalog',
      source: Source.Sun,
      index: 0,
    });
  });

  it('each caption reads its own item: the star map and the Sun fade independently', () => {
    const at = (famousStar: number, sun: number) =>
      produceStarCaptions()(makeState(), makeCtx(EARTH_POS), handed(famousStar, sun)).labels;

    // Famous-star item at 0: the map goes dark, the Sun does not.
    const famousOff = at(0, 1);
    expect(fadeAlphaOf(famousOff, PROXIMA_ID)).toBe(0);
    expect(fadeAlphaOf(famousOff, SUN_ID)).toBeGreaterThan(0);

    // Sun item at 0: the Sun goes dark, the map does not.
    const sunOff = at(1, 0);
    expect(fadeAlphaOf(sunOff, SUN_ID)).toBe(0);
    expect(fadeAlphaOf(sunOff, PROXIMA_ID)).toBeGreaterThan(0);

    // A clip or fade on one item dims only that item.
    const dimmed = at(0.25, 1);
    expect(fadeAlphaOf(dimmed, PROXIMA_ID)).toBeCloseTo(0.25 * fadeAlphaOf(at(1, 1), PROXIMA_ID)!);
    expect(fadeAlphaOf(dimmed, SUN_ID)).toBe(fadeAlphaOf(at(1, 1), SUN_ID));
  });
});
