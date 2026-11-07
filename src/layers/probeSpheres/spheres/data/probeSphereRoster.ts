import { PROBE_SPHERE_IDS } from './probeSphereIds';

/** The spheres as a roster: what the mesh and glint passes draw and the selection kind claims. */
export const PROBE_SPHERE_ROSTER: ReadonlySet<string> = new Set(PROBE_SPHERE_IDS);
