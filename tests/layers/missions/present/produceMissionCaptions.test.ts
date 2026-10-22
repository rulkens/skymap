import { describe, it, expect } from 'vitest';

import { produceMissionCaptions } from '../../../../src/layers/missions/present/produceMissionCaptions';
import { MISSION_CRAFT_IDS } from '../../../../src/layers/missions/present/missionCraftIds';
import { produceSceneBodyCaptions } from '../../../../src/services/engine/presentation/produceSceneBodyCaptions';
import { APP_VISIBILITY } from '../../../../src/compositions/appVisibility';
import { SAMPLED_BODY_IDS } from '../../../../src/data/bodies/sampledBodyIds';
import { MISSION_EMPHASIS_DIM } from '../../../../src/data/missions/missionTrailStyle';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { trajectoryRegistry } from '../../../../src/services/bodies/trajectoryRegistry';
import { ZERO_FOCUS } from '../../../../src/services/engine/subsystems/structureFocusSubsystem';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';
import { SCENE_MESH_BODIES } from '../../../../src/data/bodies/sceneMeshBodies';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { scaleToUnitMax } from '../../../../src/utils/color/scaleToUnitMax';
import { spacecraftPresent } from '../../../../src/utils/scene/spacecraftPresent';
import { makeBodyItems } from '../../../fixtures/makeBodyItems';

import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { Label2D } from '../../../../src/@types/rendering/Label2D';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { positionedBodiesOf } from '../../../helpers/frame/positionedBodiesOf';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';

// 720-px viewport, fovY 1 rad, tangent-exact.
const FIXTURE_PX_PER_RAD = 720 / (2 * Math.tan(1 / 2));

// The frame's scene bodies as core hands them, at the fixture's J2000 instant.
const SCENE_BODIES = positionedBodiesOf(
  [...SCENE_PLANETS, ...SCENE_MESH_BODIES],
  deriveBodyStates(CONST_J2000),
);

function makeCtx(camPos: Vec3, distance: number): FrameView {
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

function makeState(): EngineState {
  return {
    gpu: { texturedBodyRenderer: null },
    data: {
      bodies: { earth: SCENE_EARTH, planets: SCENE_PLANETS, meshBodies: SCENE_MESH_BODIES },
    },
    settings: {
      missions: { craft: null },
      bodies: { items: makeBodyItems() },
    },
    // The composed entries core derives the claimed bodies from.
    visibilityEntries: APP_VISIBILITY,
  } as unknown as EngineState;
}

// The values core hands each label entry: the one Spacecraft item, and every body category.
const CRAFT_ON = { craft: 1 };
const CRAFT_OFF = { craft: 0 };
const BODY_FADE = { earth: 1, planet: 1 };

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
const captionIds = (ids: Iterable<string>): string[] => [...ids].map((id) => `sceneBody-${id}`);
// The rovers are not yet on Mars at J2000, so they are absent here.
const presentCraftCaptions = (): string[] =>
  captionIds([...MISSION_CRAFT_IDS].filter((id) => spacecraftPresent(id, CONST_J2000)));

describe('produceMissionCaptions', () => {
  it('each craft is captioned once, by missions', () => {
    const ctx = makeCtx([0, 0, 0], 1e-9);
    const before = idsOf(produceMissionCaptions(makeState(), ctx, CRAFT_ON));
    expect(before).toEqual(presentCraftCaptions());
    expect(before).toContain('sceneBody-hubble');
    expect(before).not.toContain('sceneBody-voyager1');

    loadTracks();
    const after = idsOf(produceMissionCaptions(makeState(), ctx, CRAFT_ON));
    expect(after).toEqual(presentCraftCaptions());
    for (const id of SAMPLED_BODY_IDS) expect(after).toContain(`sceneBody-${id}`);
    const core = idsOf(produceSceneBodyCaptions(makeState(), ctx, BODY_FADE));
    expect(core).toEqual(captionIds([SCENE_EARTH.id, ...SCENE_PLANETS.map((p) => p.id)]));
  });

  it("emphasising Voyager 1 dims Voyager 2's caption and leaves Hubble's at full alpha", () => {
    loadTracks();
    // RENDER_ORIGIN_MPC is the Sun, so the craft's position is its caption anchor.
    const camPos = deriveBodyStates(CONST_J2000).get(asSceneBodyId('voyager2'))!
      .positionMpc as Vec3;
    const ctx = makeCtx(camPos, 1e-9);
    const state = makeState();
    const before = produceMissionCaptions(state, ctx, CRAFT_ON).labels;
    expect(fadeAlphaOf(before, 'sceneBody-voyager2')).toBeGreaterThan(0);
    expect(fadeAlphaOf(before, 'sceneBody-hubble')).toBeGreaterThan(0);

    // Same bodyStates identity (paused clock), so only a read outside any memo shows the change.
    (state.settings as { missions: { craft: string | null } }).missions.craft = 'voyager1';
    const after = produceMissionCaptions(state, ctx, CRAFT_ON).labels;
    expect(fadeAlphaOf(after, 'sceneBody-voyager2')).toBeCloseTo(
      fadeAlphaOf(before, 'sceneBody-voyager2')! * MISSION_EMPHASIS_DIM,
    );
    expect(fadeAlphaOf(after, 'sceneBody-voyager1')).toBe(
      fadeAlphaOf(before, 'sceneBody-voyager1'),
    );
    expect(fadeAlphaOf(after, 'sceneBody-hubble')).toBe(fadeAlphaOf(before, 'sceneBody-hubble'));
  });

  it('captions a craft by name, its albedo lifted to full brightness', () => {
    const body = SCENE_MESH_BODIES.find((b) => b.id === 'whale')!;
    const out = produceMissionCaptions(makeState(), makeCtx([0, 0, 0], 1e-9), CRAFT_ON).labels;
    const label = out.find((l) => l.id === 'sceneBody-whale')!;
    expect(label.text).toBe(body.label);
    expect(label.color).toEqual([...scaleToUnitMax(body.albedo), 1]);
  });

  it('unchecking Spacecraft hides every craft caption and nothing else', () => {
    loadTracks();
    const ctx = makeCtx([0, 0, 0], 1e-9);
    const off = produceMissionCaptions(makeState(), ctx, CRAFT_OFF).labels;
    expect(off.map((l) => l.id)).toEqual(presentCraftCaptions());
    expect(off.map((l) => l.id)).toContain('sceneBody-hubble');
    expect(off.every((l) => l.fadeAlpha === 0)).toBe(true);

    const core = produceSceneBodyCaptions(makeState(), ctx, BODY_FADE).labels;
    expect(fadeAlphaOf(core, 'sceneBody-mars')).toBeGreaterThan(0);
  });
});
