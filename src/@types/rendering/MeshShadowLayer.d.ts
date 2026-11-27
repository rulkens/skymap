/**
 * MeshShadowLayer — what one layer of `meshBodyRenderer`'s sun shadow array holds, private to
 * that renderer: the mesh-frame sun it was drawn for (its re-render key), what it hands the
 * draws that read it, and the body's pose this frame, which every `renderShadows` renews
 * without a redraw.
 */

import type { Vec3 } from '../../../packages/shared/src/@types/math/Vec3';
import type { MeshShadowCaster } from './MeshShadowCaster';
import type { MeshShadowSlot } from './MeshShadowSlot';

export type MeshShadowLayer = {
  readonly rendered: Readonly<Vec3>;
  readonly shadow: MeshShadowSlot;
  readonly caster: MeshShadowCaster;
};
