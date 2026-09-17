/**
 * StepInputs — everything `stepCameraRuntime` reads for one frame, as values:
 * the frame's ONE store snapshot, the drained input steps, the sim instant and
 * body snapshot derived before the step, and the clip epoch the player already
 * ticked. Two sizes on purpose: `canvasPx` is the CSS size the cursor math
 * maps through; `aspect` is the backing store's, which only changes on a resize.
 */

import type { BodyId } from '../../data/body/BodyId';
import type { BodyState } from '../../scene/BodyState';
import type { CameraDriver } from './CameraDriver';
import type { CameraState } from '../../camera/CameraState';
import type { Epoch } from './Epoch';
import type { InputStep } from '../../camera/InputStep';
import type { TerrainHeightAtLookup } from '../../camera/TerrainHeightAtLookup';
import type { Vec2 } from '../../math/Vec2';
import type { RootState } from '../../../store/types';

export type StepInputs = {
  readonly nowMs: number;
  readonly simDays: number;
  readonly rootState: RootState;
  readonly canvasPx: Readonly<Vec2>;
  /** `canvas.width / canvas.height` after `resizeCanvasToDisplay`. */
  readonly aspect: number;
  readonly steps: readonly InputStep[];
  readonly bodies: ReadonlyMap<BodyId, BodyState>;
  /** `SurfaceTileSubsystem.terrainHeightAt` bound by `runFrame`, or a `() =>
   *  0` stub pre-boot — the ground-collision row's source (F3a, spec §8.3). */
  readonly terrainHeightAt: TerrainHeightAtLookup;
  readonly clipEpoch: Epoch<NonNullable<CameraState['clip']>>;
  readonly drivers: readonly CameraDriver[];
};
