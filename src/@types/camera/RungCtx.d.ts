import type { RungBasisCtx } from './RungBasisCtx';
import type { SceneBodyId } from '../scene/SceneBodyId';
import type { PivotFraming } from './PivotFraming';
import type { Vec2 } from '../math/Vec2';
import type { CameraTuning } from './CameraTuning';
import type { PlaceId } from '../scene/PlaceId';

/** `RungBasisCtx` plus the gesture-time fields only `engage`/`release`/`step`/`stepRung` need. */
export type RungCtx = RungBasisCtx & {
  readonly focusBodyId: SceneBodyId | PlaceId | null;
  readonly pivot: PivotFraming;
  readonly viewportPx: Readonly<Vec2>;
  readonly fovYRad: number;
  readonly tuning: CameraTuning;
};
