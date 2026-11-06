import type { CameraArmBasisCtx } from './CameraArmBasisCtx';
import type { PivotFraming } from './PivotFraming';
import type { Vec2 } from '../../math/Vec2';
import type { CameraTuning } from '../orbitCamera/CameraTuning';
import type { PositionedId } from '../../scene/PositionedId';
import type { ViewFrustum } from '../projection/ViewFrustum';

/** `CameraArmBasisCtx` plus the gesture-time fields only `engage`/`release`/`step`/`stepCameraArm` need. */
export type CameraArmCtx = CameraArmBasisCtx & {
  readonly focusBodyId: PositionedId | null;
  readonly pivot: PivotFraming;
  readonly viewportPx: Readonly<Vec2>;
  /** The main view's frustum: cursor rays map through it. */
  readonly frustum: ViewFrustum;
  /** The lens, for rates (radians per pixel); never a ray. */
  readonly fovYRad: number;
  readonly tuning: CameraTuning;
  /** The drain's clock, ms: what a memory that decays at rest measures its pause by. */
  readonly nowMs: number;
};
