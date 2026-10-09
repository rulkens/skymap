import type { MeshBody } from '../../@types/scene/MeshBody';
import { meshBody, type MeshBodySeed } from './makers/meshBody';
import { MISSION_EVENTS } from '../missions/missionEvents.generated';

// A sampled craft enters the scene at its cited launch instant, not a re-typed copy.
function launchIso(id: string): string {
  const launch = MISSION_EVENTS.find((e) => e.bodyId === id && e.kind === 'launch');
  if (!launch) throw new Error(`sceneMeshBodies: no launch event for '${id}'`);
  return launch.iso;
}

/**
 * SCENE_MESH_BODIES — seeded mesh-drawn bodies (the fifth `SceneBody` arm).
 * The seeds carry identity and per-body dials: `boundingRadiusM` and `albedo` are
 * joined in from `MESH_ASSETS`, so the baked asset stays their single source of
 * truth and a re-bake never needs an edit here. Positions ride the position
 * drivers (`ORBITAL_ELEMENTS` or `SURFACE_FIXED_SITES`), orientation
 * `ROTATION_ELEMENTS`, all keyed on these ids.
 */
const SEED_MESH_BODIES: readonly MeshBodySeed[] = [
  {
    id: 'whale',
    label: 'Whale',
    meshKey: 'whale',
    captionRevealM: 300,
  },
  {
    id: 'petunias',
    label: 'Bowl of Petunias',
    meshKey: 'petunias',
    captionRevealM: 60,
  },
  // The real missions. No `captionRevealM`: these are
  // real objects on the default caption reach, not easter eggs to stumble on.
  // Half a radius: the 13 m magnetometer boom sets the bounding sphere, so two
  // radii would park the camera 29 m from a 4 m bus.
  // `presentFromIso`: Hubble's release from Discovery's arm; each rover's landing (UTC).
  {
    id: 'voyager1',
    label: 'Voyager 1',
    meshKey: 'voyager',
    standoffRadii: 0.5,
    presentFromIso: launchIso('voyager1'),
  },
  {
    id: 'voyager2',
    label: 'Voyager 2',
    meshKey: 'voyager',
    standoffRadii: 0.5,
    presentFromIso: launchIso('voyager2'),
  },
  { id: 'hubble', label: 'Hubble', meshKey: 'hubble', presentFromIso: '1990-04-25T19:38:00Z' },
  {
    id: 'curiosity',
    label: 'Curiosity',
    meshKey: 'curiosity',
    presentFromIso: '2012-08-06T05:17:00Z',
  },
  {
    id: 'perseverance',
    label: 'Perseverance',
    meshKey: 'perseverance',
    presentFromIso: '2021-02-18T20:55:00Z',
  },
  { id: 'spirit', label: 'Spirit', meshKey: 'mer', presentFromIso: '2004-01-04T04:35:00Z' },
  {
    id: 'opportunity',
    label: 'Opportunity',
    meshKey: 'mer',
    presentFromIso: '2004-01-25T05:05:00Z',
  },
  // ~170 m bounding radius: the default 2-radii standoff would park the
  // camera the better part of a km up, well past where the park reads.
  { id: 'soendermarken', label: 'Søndermarken', meshKey: 'soendermarken', standoffRadii: 1.5 },
];

export const SCENE_MESH_BODIES: readonly MeshBody[] = SEED_MESH_BODIES.map(meshBody);
