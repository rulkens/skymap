/**
 * MeshShadowCaster — one resident mesh body as the `mesh-shadows` compute hands it to
 * `meshBodyRenderer.renderShadows`: its pose on its slab host this frame, in the HOST's fixed
 * axes (`bodyStateInHostFrame`), and the sun in its own mesh frame (`rotMᵀ · sunDirLocal`).
 */

import type { Mat3 } from '../math/Mat3';
import type { Vec3 } from '../math/Vec3';

export type MeshShadowCaster = {
  readonly id: string;
  readonly posM: Readonly<Vec3>;
  readonly rotM: Readonly<Mat3>;
  /** Unit; the slot's re-render key. */
  readonly sunDirMesh: Readonly<Vec3>;
  /** Squared camera distance in any unit: slots go to the nearest first. */
  readonly cameraDistanceSq: number;
  /** The host whose surface tiles take this body's shadow: a `surfaceFixed` site's, else null. */
  readonly groundHostId: string | null;
};
