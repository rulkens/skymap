/**
 * CelestialBody — every `SceneBody` arm that is an astronomical object: a
 * planet, moon, star or anchor point, each an authored sphere of `radiusM` the
 * camera can descend to and measure an altitude over. A `MeshBody` is the one
 * arm that is not one — it is a baked object with a `boundingRadiusM` hull — so
 * the camera's altitude lane (`h/R`, the regime engage/disengage test, the
 * body-fixed world arm) takes THIS type and the compiler keeps a mesh out of it.
 */

import type { SceneBody } from './SceneBody';
import type { MeshBody } from './MeshBody';

export type CelestialBody = Exclude<SceneBody, MeshBody>;
