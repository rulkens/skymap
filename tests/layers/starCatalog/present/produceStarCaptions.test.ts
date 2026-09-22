/**
 * produceStarCaptions — the star Layer's twin of `produceSceneBodyCaptions`'s
 * tests: candidate math for the curated map and the Sun. Cases specific to
 * the star family (kind routing, pick ids, the two-level visibility gate, the
 * starCatalogLabel/bodyLabel clip split) live here; the shared fade-band /
 * occlusion / registry-ramp mechanics stay covered once, on core's bodies, in
 * `produceSceneBodyCaptions.test.ts`.
 */

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
import type { StarCatalogRuntime } from '../../../../src/layers/starCatalog/@types/StarCatalogRuntime';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { Label2D } from '../../../../src/@types/rendering/Label2D';
import type { ForegroundCaption } from '../../../../src/services/engine/presentation/foregroundCaption';

// `runtime` is unread by the producer (see its header) — an empty stub proves
// nothing on it is dereferenced.
const RUNTIME = {} as unknown as StarCatalogRuntime;

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

function makeCtx(camPos: Vec3): FrameView {
  return {
    snapshot: { simDays: CONST_J2000, nowMs: 0 },
    cam: { distance: 5e-4 },
    drawCamPos: camPos,
    drawPxPerRad: FIXTURE_PX_PER_RAD,
    canvasSize: { width: 1280, height: 720 },
  } as unknown as FrameView;
}

/**
 * Mirrors `produceSceneBodyCaptions.test.ts`'s `makeState`, trimmed to the
 * two star-catalog rows this producer reads plus the body records
 * `sceneOccluderBodies`/`sceneBodyPartition` need to not throw.
 */
function makeState(
  famousEnabled = true,
  famousLabelEnabled = true,
  sunEnabled = true,
  sunLabelEnabled = true,
  clusterEnabled = true,
  registryOverrides: Readonly<Partial<Record<string, number>>> = {},
  clipOverrides: Readonly<Partial<Record<'bodyLabel' | 'starCatalogLabel', number>>> = {},
): EngineState {
  return {
    gpu: { texturedBodyRenderer: null },
    data: { bodies: { earth: SCENE_EARTH, planets: SCENE_PLANETS, meshBodies: SCENE_MESH_BODIES } },
    settings: {
      starCatalogs: {
        enabled: clusterEnabled,
        items: {
          famousStar: { enabled: famousEnabled, labelEnabled: famousLabelEnabled },
          sun: { enabled: sunEnabled, labelEnabled: sunLabelEnabled },
          sStar: { enabled: true, labelEnabled: false },
        },
      },
    },
    subsystems: {
      fades: {
        opacityOf: (handle: { item?: string }) => {
          const item = handle.item;
          if (item !== undefined && item in registryOverrides) return registryOverrides[item]!;
          if (item === 'famousStar') return famousLabelEnabled ? 1 : 0;
          if (item === 'sun') return sunLabelEnabled ? 1 : 0;
          return 1;
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

describe('produceStarCaptions', () => {
  it('captions every drawn famous star and the Sun with their kinds, and no S-star', () => {
    // `Label2DProducerOutput` types its labels as the base `Label2D`, but
    // every one this producer emits is built by `bodyCaption` and so carries
    // `kind` at runtime — the cast states that once, for every case below.
    const out = produceStarCaptions(RUNTIME)(makeState(), makeCtx(EARTH_POS))
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
      { structures: { byId: () => null, byCategory: () => [] } },
      undefined,
      NO_STARS_LOADED,
    );
    const out = produceStarCaptions(RUNTIME)(makeState(), makeCtx(EARTH_POS));

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

  it("drops a catalog's captions with its item toggle", () => {
    const onOut = produceStarCaptions(RUNTIME)(makeState(), makeCtx(EARTH_POS));
    expect(fadeAlphaOf(onOut.labels, PROXIMA_ID)).toBeGreaterThan(0);
    expect(fadeAlphaOf(onOut.labels, SUN_ID)).toBeGreaterThan(0);

    // Famous-star row off: the map goes dark, the Sun (its own row) does not.
    const famousOffOut = produceStarCaptions(RUNTIME)(
      makeState(false /* famousEnabled */),
      makeCtx(EARTH_POS),
    );
    expect(fadeAlphaOf(famousOffOut.labels, PROXIMA_ID)).toBe(0);
    expect(fadeAlphaOf(famousOffOut.labels, SUN_ID)).toBeGreaterThan(0);

    // Sun row off: the Sun goes dark, the map does not.
    const sunOffOut = produceStarCaptions(RUNTIME)(
      makeState(true, true, false /* sunEnabled */),
      makeCtx(EARTH_POS),
    );
    expect(fadeAlphaOf(sunOffOut.labels, SUN_ID)).toBe(0);
    expect(fadeAlphaOf(sunOffOut.labels, PROXIMA_ID)).toBeGreaterThan(0);
  });

  it('mutes every star caption when the cluster master is off, even with rows and labels on', () => {
    // `subjectVisible` for a star row is `starCatalogs.enabled &&
    // items[id].enabled` — the master must silence both rows, the Sun
    // included, exactly as it silences the drawn dots.
    const out = produceStarCaptions(RUNTIME)(
      makeState(true, true, true, true, false /* clusterEnabled */),
      makeCtx(EARTH_POS),
    );
    expect(fadeAlphaOf(out.labels, PROXIMA_ID)).toBe(0);
    expect(fadeAlphaOf(out.labels, SUN_ID)).toBe(0);
  });

  it('dims the star-map captions through the starCatalogLabel clip, the Sun through bodyLabel', () => {
    // The Sun's tour-clip grouping rides with the bodies even though its
    // persistent toggle lives in the starCatalog cluster (produceStarCaptions'
    // header) — a landmine this pins directly.
    const out = produceStarCaptions(RUNTIME)(
      makeState(true, true, true, true, true, {}, { starCatalogLabel: 0.25 }),
      makeCtx(EARTH_POS),
    );
    expect(fadeAlphaOf(out.labels, PROXIMA_ID)).toBeCloseTo(0.25);
    expect(fadeAlphaOf(out.labels, SUN_ID)).toBeCloseTo(1);
  });
});
