/**
 * MeshShadowLayer — what one layer of `meshBodyRenderer`'s sun shadow array holds, private to
 * that renderer: the body, the mesh-frame sun it was drawn for (its re-render key) and the
 * slot it hands out, plus this frame's pose, which every `renderShadows` renews without a redraw.
 */

import type { Vec3 } from '../math/Vec3';
import type { MeshShadowCaster } from './MeshShadowCaster';
import type { MeshShadowSlot } from './MeshShadowSlot';

export type MeshShadowLayer = {
  readonly id: string;
  readonly rendered: Readonly<Vec3>;
  readonly slot: MeshShadowSlot;
  readonly caster: MeshShadowCaster;
};
