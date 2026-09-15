import type { RungBasisCtx } from './RungBasisCtx';
import type { BodyId } from '../data/body/BodyId';
import type { PivotFraming } from './PivotFraming';
import type { Vec2 } from '../math/Vec2';
import type { CameraTuning } from './CameraTuning';

/** `RungBasisCtx` plus the gesture-time fields only `engage`/`release`/`step`/`stepRung` need. */
export type RungCtx = RungBasisCtx & {
  readonly focusBodyId: BodyId | null;
  readonly pivot: PivotFraming;
  readonly viewportPx: Readonly<Vec2>;
  readonly fovYRad: number;
  readonly tuning: CameraTuning;
};
