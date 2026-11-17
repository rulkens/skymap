import type { CameraTuning } from '../../../../../../@types/camera/orbitCamera/CameraTuning';
import type { GroundRadiusLookup } from '../../../../../../@types/camera/terrain/GroundRadiusLookup';
import type { Vec2 } from '../../../../../../@types/math/Vec2';
import type { Vec3 } from '../../../../../../@types/math/Vec3';
import type { ViewFrustum } from '../../../../../../@types/camera/projection/ViewFrustum';

/** Everything the body arm's input and nudge cells read about the viewport and the host. */
export type SurfaceStepCtx = {
  readonly viewportPx: Readonly<Vec2>;
  /** Cursor rays map through it; `fovYRad` stays the lens for rates and tolerances. */
  readonly frustum: ViewFrustum;
  readonly fovYRad: number;
  readonly bodyRadiusM: number;
  /** Descent-floor multiple of the datum (`bodyStandoffRadii`); a body may override the global. */
  readonly standoffRadii: number;
  /** What the floor stands off from, per direction; `bodyRadiusM` keeps the band arithmetic. */
  readonly groundRadiusAtM: GroundRadiusLookup;
  /** Relief shells the gesture/zoom pick marches between (spec §8.1); the datum-sphere
   *  fallback on a miss is the call sites' own policy, not this ctx's. */
  readonly innerBoundRadiusM: number;
  readonly outerBoundRadiusM: number;
  /** Scene-frame up in BODY-FIXED axes (unit); the body rotates under it, so resample per drain. */
  readonly sceneUpLocal: Readonly<Vec3>;
  /** A focus HOSTED on this body, body-fixed metres — it owns the zoom's pivot. */
  readonly focusPivotM: Readonly<Vec3> | null;
  readonly tuning: CameraTuning;
};
