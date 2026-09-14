/** CelestialBody — every `SceneBody` arm with a ground `radiusM`, i.e. all but
 *  `MeshBody` (see its `boundingRadiusM` for why a hull doesn't count). */

import type { SceneBody } from './SceneBody';
import type { MeshBody } from './MeshBody';

export type CelestialBody = Exclude<SceneBody, MeshBody>;
