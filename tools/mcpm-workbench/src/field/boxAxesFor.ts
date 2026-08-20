import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { Vec4 } from '../../../../src/@types/math/Vec4';
import { boxBasisVectors } from './boxBasisVectors';

/** boxBasisVectors' named triplet, reshaped into gizmoHandleGeometry's `axes` tuple. The glyph
 *  build (boxPreviewPass.ts) and every gizmo pointer call site (Viewport.tsx) must feed the
 *  box's OWN rotated axes, not world UNIT_AXES, so arrows/crosses/rings rotate with the box.
 *  One home for the reshape both consumers need. */
export function boxAxesFor(rotation: Readonly<Vec4>): readonly [Vec3, Vec3, Vec3] {
  const basis = boxBasisVectors(rotation);
  return [basis.x, basis.y, basis.z];
}
