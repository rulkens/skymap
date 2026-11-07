import type { MeshBody } from '../../../../@types/scene/MeshBody';
import type { ProbeSphereId } from '../../@types/ProbeSphereId';
import { meshBody } from '../../../../data/bodies/makers/meshBody';
import { buildProbeSphereMesh } from '../../spheres/load/buildProbeSphereMesh';
import { PROBE_SPHERE_RADIUS_M } from '../../spheres/data/probeSphereRadiusM';

/** One probe sphere's identity: every sphere shares the one generated mesh. */
export function probeSphereBody(id: ProbeSphereId, label: string): MeshBody {
  return meshBody({
    id,
    label,
    meshKey: 'probe-sphere',
    generated: {
      buildMesh: buildProbeSphereMesh,
      boundingRadiusM: PROBE_SPHERE_RADIUS_M,
      albedo: [1, 1, 1],
    },
  });
}
