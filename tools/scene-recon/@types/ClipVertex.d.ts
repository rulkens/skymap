import type { Vec2 } from '../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../src/@types/math/Vec3';

/** `key` names the vertex for welding: a source vertex is `v<index>`; a cut vertex is
 *  `<lower key>|<higher key>|<plane key>`, so two triangles cutting a shared edge agree. */
export type ClipVertex = { readonly positionM: Vec3; readonly uv: Vec2; readonly key: string };
