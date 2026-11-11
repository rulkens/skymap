import type { Size } from '../../rendering/Size';
import type { Vec3 } from '../../math/Vec3';
import type { BodyState } from '../../scene/BodyState';
import type { PositionedId } from '../../scene/PositionedId';
import type { SelectionRowBase } from '../selection/SelectionRowBase';

/**
 * FrameReadoutCtx — what a `FrameReadoutRow` reads from the frame. Built
 * before the ready return, so it carries the assembled camera's values, never
 * a derived view: `camPosMpc` equals the canvas view's `drawCamPos` (the main
 * view has no eye offset).
 */
export type FrameReadoutCtx = {
  readonly nowMs: number;
  readonly booted: boolean;
  /** The frame context derived (cam + GPU handles populated); false on bootstrap frames. */
  readonly isReady: boolean;
  /** CSS px; the backing-store size silently breaks the scale bar on retina. */
  readonly canvasCssPx: Size;
  readonly camPosMpc: Readonly<Vec3>;
  readonly fovYRad: number;
  /** Eye to pivot-surface range (`FrameContextInput.altitudeMpc`). */
  readonly altitudeMpc: number;
  readonly focusRow: SelectionRowBase | null;
  readonly bodyStates: ReadonlyMap<PositionedId, BodyState>;
};
