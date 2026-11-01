import type { RungBasisCtx } from './RungBasisCtx';
import type { PivotFraming } from './PivotFraming';
import type { Vec2 } from '../math/Vec2';
import type { CameraTuning } from './CameraTuning';
import type { PositionedId } from '../scene/PositionedId';

/** `RungBasisCtx` plus the gesture-time fields only `engage`/`release`/`step`/`stepRung` need. */
export type RungCtx = RungBasisCtx & {
  readonly focusBodyId: PositionedId | null;
  readonly pivot: PivotFraming;
  readonly viewportPx: Readonly<Vec2>;
  readonly fovYRad: number;
  readonly tuning: CameraTuning;
};
