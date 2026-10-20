import type { PlanetBody } from '../../scene/PlanetBody';
import type { MeshBody } from '../../scene/MeshBody';
import type { MeshPresentation } from '../../scene/MeshPresentation';

export type SceneBodyPartition = {
  readonly glints: readonly (PlanetBody | MeshBody)[];
  readonly flat: readonly PlanetBody[];
  readonly textured: readonly PlanetBody[];
  readonly meshes: readonly MeshPresentation[];
};
