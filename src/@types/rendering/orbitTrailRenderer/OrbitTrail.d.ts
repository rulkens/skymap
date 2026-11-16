/**
 * OrbitTrail — one orbit to draw as a fading conic: the ellipse plus its colour and alpha.
 */

import type { Vec3 } from '../../math/Vec3';
import type { OrbitConic } from '../../scene/OrbitConic';

export type OrbitTrail = OrbitConic & { readonly color: Readonly<Vec3>; readonly fade: number };
