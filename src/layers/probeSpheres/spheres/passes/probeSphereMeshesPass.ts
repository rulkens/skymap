/**
 * probeSphereMeshesPass — the spheres as lit meshes on their host's body-m row, through core's one
 * mesh handle, in the material the debug section sets. Unpicked: deep links reach them.
 */

import { meshBodiesPassOver } from '../../../../services/engine/frame/meshBodiesPassOver';
import { PROBE_SPHERE_ROSTER } from '../data/probeSphereRoster';

export const probeSphereMeshesPass = meshBodiesPassOver(
  'probe-sphere-meshes',
  PROBE_SPHERE_ROSTER,
  () => null,
  (state) => {
    const { color, metallic, roughness } = state.settings.probeSpheres;
    return { baseColor: color, metallic, roughness };
  },
);
