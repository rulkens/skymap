import { describe, it, expect } from 'vitest';

import { produceMissionCaptions } from '../../../../src/layers/missions/present/produceMissionCaptions';
import { sceneBodyLabels } from '../../../../src/services/engine/presentation/sceneBodyLabels';
import { SAMPLED_BODY_IDS } from '../../../../src/data/missions/sampledBodyIds';
import { MISSION_EMPHASIS_DIM } from '../../../../src/data/missions/missionTrailStyle';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { trajectoryRegistry } from '../../../../src/services/bodies/trajectoryRegistry';
import { ZERO_FOCUS } from '../../../../src/services/engine/subsystems/structureFocusSubsystem';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';
import { SCENE_MESH_BODIES } from '../../../../src/data/bodies/sceneMeshBodies';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { makeBodyItems } from '../../../fixtures/makeBodyItems';

import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { Label2D } from '../../../../src/@types/rendering/Label2D';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

// 720-px viewport, fovY 1 rad, tangent-exact.
const FIXTURE_PX_PER_RAD = 720 / (2 * Math.tan(1 / 2));

function makeCtx(camPos: Vec3, distance: number): FrameView {
  return {
    snapshot: {
      simDays: CONST_J2000,
      nowMs: 0,
      meshBodies: SCENE_MESH_BODIES,
      focusBlend: 0,
      focus: ZERO_FOCUS,
    },
    cam: { distance },
    drawCamPos: camPos,
    drawPxPerRad: FIXTURE_PX_PER_RAD,
    canvasSize: { width: 1280, height: 720 },
  } as unknown as FrameView;
}

function makeState(): EngineState {
  return {
    gpu: { texturedBodyRenderer: null },
    data: {
      bodies: { earth: SCENE_EARTH, planets: SCENE_PLANETS, meshBodies: SCENE_MESH_BODIES },
    },
    settings: {
      missions: { craft: null },
      bodies: { items: makeBodyItems() },
      starCatalogs: { enabled: false, items: {} },
    },
    subsystems: {
      fades: { opacityOf: () => 1 },
      clipPlayer: { clipOpacityOf: () => 1 },
    },
  } as unknown as EngineState;
}

function fadeAlphaOf(labels: readonly Label2D[], id: string): number | undefined {
  return labels.find((l) => l.id === id)?.fadeAlpha;
}

// Sampled craft are captioned only once their track is loaded; the registry
// has no unload, so a case that needs the unloaded state runs before any load.
function loadTracks(): void {
  for (const id of SAMPLED_BODY_IDS) {
    trajectoryRegistry.set({
      id,
      tDays: Float64Array.from([CONST_J2000 - 10, CONST_J2000 + 10]),
      posKm: Float64Array.from([1e9, 0, 0, 1e9, 0, 0]),
      velKmS: new Float32Array(6),
    });
  }
}

const idsOf = (out: { labels: readonly Label2D[] }): string[] => out.labels.map((l) => l.id);

describe('produceMissionCaptions', () => {
  it('each present sampled craft is captioned by exactly one producer', () => {
    const ctx = makeCtx([0, 0, 0], 1e-9);
    expect(idsOf(produceMissionCaptions(makeState(), ctx))).toEqual([]);

    loadTracks();
    const core = sceneBodyLabels(deriveBodyStates(CONST_J2000), CONST_J2000);
    for (const id of SAMPLED_BODY_IDS) {
      expect(core.some((label) => label.bodyId === id)).toBe(false);
    }
    expect(idsOf(produceMissionCaptions(makeState(), ctx))).toEqual([
      'sceneBody-voyager1',
      'sceneBody-voyager2',
    ]);
  });

  it('dims only the non-emphasised sampled craft, on a state the memo already saw', () => {
    loadTracks();
    // RENDER_ORIGIN_MPC is the Sun, so the craft's position is its caption anchor.
    const camPos = deriveBodyStates(CONST_J2000).get('voyager2')!.positionMpc as Vec3;
    const ctx = makeCtx(camPos, 1e-9);
    const state = makeState();
    const full = fadeAlphaOf(produceMissionCaptions(state, ctx).labels, 'sceneBody-voyager2')!;
    expect(full).toBeGreaterThan(0);

    // Same bodyStates identity (paused clock), so only a read outside any memo shows the change.
    (state.settings as { missions: { craft: string | null } }).missions.craft = 'voyager1';
    const out = produceMissionCaptions(state, ctx).labels;
    expect(fadeAlphaOf(out, 'sceneBody-voyager2')).toBeCloseTo(full * MISSION_EMPHASIS_DIM);
    expect(fadeAlphaOf(out, 'sceneBody-voyager1')).toBe(
      fadeAlphaOf(produceMissionCaptions(makeState(), ctx).labels, 'sceneBody-voyager1'),
    );
  });
});
