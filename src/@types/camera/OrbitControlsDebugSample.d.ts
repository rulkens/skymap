/**
 * OrbitControlsDebugSample — a snapshot of `orbitControls.ts`'s gesture
 * closure state, pushed out via `OrbitControlsOptions.onDebugSample` for the
 * DebugPanel's Camera section. `dragMode`/`activePointers` live only in that
 * module's closure with no other read surface; this is the minimal read-only
 * window onto them.
 */
export type OrbitControlsDebugSample = {
  readonly dragMode: 'orbit' | 'pan' | 'pinch' | 'tilt' | null;
  readonly activePointers: number;
  /** Last wheel event's `deltaY`, unmodified. */
  readonly wheelDeltaY: number;
  /** `performance.now()` when the last wheel event arrived — a reader computes "ms since". */
  readonly wheelAtMs: number;
  /** Whether the last wheel tick was applied, or dropped as inherited mid-drag momentum. */
  readonly wheelDropped: boolean;
};
