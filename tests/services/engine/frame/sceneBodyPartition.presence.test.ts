import { describe, expect, it } from 'vitest';

import { canvasViewOf } from '../../../helpers/frame/canvasViewOf';
import { makeBodyItems } from '../../../fixtures/makeBodyItems';
import { assembleOrbitCamera } from '../../../../src/services/engine/camera/assembleOrbitCamera';
import { sceneBodyPartition } from '../../../../src/services/engine/frame/sceneBodyPartition';
import { sceneBodyLabels } from '../../../../src/services/engine/presentation/sceneBodyLabels';
import { produceMissionCaptions } from '../../../../src/layers/missions/present/produceMissionCaptions';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { trajectoryRegistry } from '../../../../src/services/bodies/trajectoryRegistry';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SCENE_MESH_BODIES } from '../../../../src/data/bodies/sceneMeshBodies';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { APP_VISIBILITY } from '../../../../src/compositions/appVisibility';
import { SAMPLED_BODY_IDS } from '../../../../src/data/missions/sampledBodyIds';
import { SCENE_BODY_CAPTION_LABEL } from '../../../../src/data/labels/sceneBodyCaptionLabel';
import { claimedLabelItemsOf } from '../../../../src/utils/visibility/claimedLabelItemsOf';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { PassState } from '../../../../src/@types/engine/frame/PassState';
import type { PositionedSceneBody } from '../../../../src/@types/engine/frame/PositionedSceneBody';
import type { MeshBody } from '../../../../src/@types/scene/MeshBody';
import type { PlanetBody } from '../../../../src/@types/scene/PlanetBody';
import type { StarBody } from '../../../../src/@types/scene/StarBody';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { Mat3 } from '../../../../src/@types/math/Mat3';

// One module instance per test file, so the registry set here stays out of the main suite.
const T0 = 2444000.5;
const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

const STATE = {
  booted: true,
  gpu: {
    galaxyPointRenderer: {},
    galaxyPickRenderer: {},
    renderTargets: {},
    compositor: {},
    texturedBodyRenderer: null,
  },
  subsystems: {
    texturedDisks: {},
    fades: { opacityOf: () => 1 },
    clipPlayer: { clipOpacityOf: () => 1 },
  },
  visibilityEntries: APP_VISIBILITY,
  selectionRows: { hover: null, select: null, focus: null },
  slabRows: [],
  data: { bodies: { earth: SCENE_EARTH, planets: [], meshBodies: SCENE_MESH_BODIES } },
  settings: {
    bodies: { items: makeBodyItems() },
    missions: { craft: null },
  },
  picking: { pickInFlight: false, cursorTexPx: null },
} as unknown as EngineState;

const POSE: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1e-9 };

const viewAt = (simDays: number) =>
  canvasViewOf(
    STATE,
    {
      cam: assembleOrbitCamera(
        POSE,
        { fovYRad: 1, aspect: 16 / 9, near: 0.1, far: 10000 },
        IDENTITY,
        IDENTITY,
      ),
      arm: absoluteArm(POSE),
      altitudeMpc: POSE.distance,
      nowMs: 0,
      simDays,
    },
    { width: 1920, height: 1080 },
  )!;

const drawnIds = (simDays: number): string[] => {
  const view = viewAt(simDays);
  const { glints, meshes } = sceneBodyPartition(STATE as never, view);
  return [...glints, ...meshes].map((body) => body.id);
};
// Core captions every body but the sampled craft, which the missions Layer claims and captions.
const CRAFT_FADE = Object.fromEntries(SAMPLED_BODY_IDS.map((id) => [id, 1]));
const labelIds = (simDays: number): string[] =>
  [
    ...sceneBodyLabels(
      deriveBodyStates(simDays),
      simDays,
      claimedLabelItemsOf(APP_VISIBILITY, SCENE_BODY_CAPTION_LABEL),
    ),
    ...produceMissionCaptions(STATE, viewAt(simDays), CRAFT_FADE).labels,
  ].map((label) => label.id);

describe('spacecraft presence', () => {
  it('a body with a presence date is absent before it, present after', () => {
    const before = 2443392.5; // 1977-09-06
    const after = 2460000.5; // 2023
    for (const id of ['hubble', 'spirit', 'opportunity', 'curiosity', 'perseverance']) {
      expect(viewAt(before).snapshot.meshBodies.map((b) => b.id)).not.toContain(id);
      expect(labelIds(before)).not.toContain(`sceneBody-${id}`);
      expect(viewAt(after).snapshot.meshBodies.map((b) => b.id)).toContain(id);
      expect(labelIds(after)).toContain(`sceneBody-${id}`);
    }
    expect(viewAt(before).snapshot.meshBodies.map((b) => b.id)).toContain('whale');
  });

  it('an absent craft is in neither glints nor meshes and has no label', () => {
    expect(drawnIds(T0 + 5)).not.toContain('voyager1');
    expect(labelIds(T0 + 5)).not.toContain('sceneBody-voyager1');
  });

  it('a present craft is', () => {
    trajectoryRegistry.set({
      id: 'voyager1',
      tDays: Float64Array.from([T0, T0 + 10]),
      posKm: Float64Array.from([1e9, 0, 0, 1e9, 0, 0]),
      velKmS: new Float32Array(6),
    });
    expect(viewAt(T0 + 5).snapshot.meshBodies.map((b) => b.id)).toContain('voyager1');
    expect(labelIds(T0 + 5)).toContain('sceneBody-voyager1');
    // Before launch the track exists but the craft does not.
    const preLaunch = 2443000.5; // 1976
    expect(viewAt(preLaunch).snapshot.meshBodies.map((b) => b.id)).not.toContain('voyager1');
    expect(drawnIds(preLaunch)).not.toContain('voyager1');
    expect(labelIds(preLaunch)).not.toContain('sceneBody-voyager1');
  });
});

// The four-way routing of core's own bodies, fed straight through `sceneBodies`.
const PX_PER_RAD = 720 / (2 * Math.tan(Math.PI / 6));
const CAM: Vec3 = [0, 0, 0];
const CLOSE = (radiusM: number) => radiusM * 5; // resolved (~hundreds of px)
const AU_M = SCALE_UNITS.AU_TO_MPC / SCALE_UNITS.M_TO_MPC; // deep sub-pixel

const planetAt = (id: string, radiusM: number, distanceM: number): PositionedSceneBody => ({
  body: {
    id,
    label: id,
    surface: { datumRadiusM: radiusM, reliefM: [0, 0] },
    albedo: [0.5, 0.5, 0.5],
    resolvePx: 3,
  } satisfies PlanetBody,
  positionMpc: [distanceM * SCALE_UNITS.M_TO_MPC, 0, 0],
});
const meshAt = (id: string, radiusM: number, distanceM: number): PositionedSceneBody => ({
  body: {
    id,
    label: id,
    boundingRadiusM: radiusM,
    albedo: [0.5, 0.5, 0.5],
    meshKey: `${id}-mesh`,
    standoffRadii: 2,
    resolvePx: 3,
  } satisfies MeshBody,
  positionMpc: [distanceM * SCALE_UNITS.M_TO_MPC, 0, 0],
});

/** The frame's mesh bodies are the meshes given; `sceneBodies` may hold more. Planet ids are
 *  `SCENE_PLANETS` ids, so core counts them as its own. */
function partition(
  own: readonly PositionedSceneBody[],
  resident: (id: string) => boolean,
  extra: readonly PositionedSceneBody[] = [],
) {
  const state = {
    gpu: {
      texturedBodyRenderer: { hasMap: (id: string) => resident(id) },
      meshBodyRenderer: { hasMesh: (id: string) => resident(id) },
    },
  } as unknown as PassState;
  const ctx = {
    snapshot: {
      meshBodies: own.filter((p) => 'meshKey' in p.body).map((p) => p.body),
      sceneBodies: [...own, ...extra],
    },
    drawCamPos: CAM,
    drawPxPerRad: PX_PER_RAD,
  } as unknown as FrameView;
  return sceneBodyPartition(state, ctx);
}
const bodiesOf = (bodies: readonly PositionedSceneBody[]) => bodies.map((p) => p.body);
const idsOf = (bodies: readonly { readonly id: string }[]) => bodies.map((b) => b.id);

describe('sceneBodyPartition routing', () => {
  it('is disjoint and covering — every own body lands in exactly one branch', () => {
    const bodies = [
      planetAt('mars', 3390000, CLOSE(3390000)), // resolved, registry
      planetAt('titan', 2575000, CLOSE(2575000)), // resolved, not registry
      planetAt('jupiter', 69911000, AU_M), // sub-pixel glint
      meshAt('whale', 6.8, CLOSE(6.8)), // resolved mesh
    ];
    const { glints, flat, textured, meshes } = partition(bodies, () => true);
    const all = idsOf([...glints, ...flat, ...textured, ...meshes]);
    expect(all).toHaveLength(bodies.length);
    expect(new Set(all)).toEqual(new Set(idsOf(bodiesOf(bodies))));
  });

  it('routes a resolved registry body to textured iff its texture is resident', () => {
    const mars = planetAt('mars', 3390000, CLOSE(3390000));
    const resident = partition([mars], (id) => id === 'mars');
    expect(resident.textured).toEqual([mars.body]);
    expect(resident.flat).toEqual([]);
    const notResident = partition([mars], () => false);
    expect(notResident.flat).toEqual([mars.body]);
    expect(notResident.textured).toEqual([]);
  });

  it('keeps a resolved non-registry body flat even when residency says yes', () => {
    const bodies = [planetAt('titan', 2575000, CLOSE(2575000)), planetAt('proteus', 210000, 1e6)];
    const { flat, textured, glints } = partition(bodies, () => true);
    expect(new Set(flat)).toEqual(new Set(bodiesOf(bodies)));
    expect(textured).toEqual([]);
    expect(glints).toEqual([]);
  });

  it('routes a sub-3px body, planet or mesh, to glints', () => {
    const bodies = [planetAt('jupiter', 69911000, AU_M), meshAt('whale', 6.8, AU_M)];
    const { glints, flat, textured, meshes } = partition(bodies, () => true);
    expect(glints).toEqual(bodiesOf(bodies));
    expect([...flat, ...textured, ...meshes]).toEqual([]);
  });

  it('routes a resolved MeshBody to meshes, never textured or flat', () => {
    const whale = meshAt('whale', 6.8, CLOSE(6.8));
    const { meshes, flat, textured, glints } = partition([whale], () => true);
    expect(idsOf(meshes)).toEqual(['whale']);
    expect([...flat, ...textured, ...glints]).toEqual([]);
  });

  // A moon drawn from a shape model keeps its sphere until the mesh decodes.
  it('routes a resolved shape-model moon to meshes once resident, flat until then', () => {
    const phobos = planetAt('phobos', 11000, 55000);
    expect(idsOf(partition([phobos], () => true).meshes)).toEqual(['phobos']);
    const loading = partition([phobos], () => false);
    expect(loading.flat).toEqual([phobos.body]);
    expect(loading.meshes).toEqual([]);
  });

  // A mission mesh has no sphere to fall back to: drawing one would be a wrong shape.
  it('drops a resolved MeshBody whose mesh is not resident from every branch', () => {
    const whale = meshAt('whale', 6.8, CLOSE(6.8));
    const { meshes, flat, textured, glints } = partition([whale], () => false);
    expect([...meshes, ...flat, ...textured, ...glints]).toEqual([]);
  });

  it("takes only core's own bodies", () => {
    const sun: PositionedSceneBody = {
      body: {
        id: 'sun',
        label: 'Sun',
        absMag: 4.8,
        color: [1, 1, 1],
        surface: { datumRadiusM: 6.96e8, reliefM: [0, 0] },
        resolvePx: 4,
      } satisfies StarBody,
      positionMpc: [CLOSE(6.96e8) * SCALE_UNITS.M_TO_MPC, 0, 0],
    };
    const { glints, flat, textured, meshes } = partition([], () => false, [sun]);
    expect([...glints, ...flat, ...textured, ...meshes]).toEqual([]);
  });
});
