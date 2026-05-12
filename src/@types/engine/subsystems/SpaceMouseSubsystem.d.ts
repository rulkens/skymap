import type { OrbitCamera } from '../../camera/OrbitCamera';

export type SpaceMouseSubsystem = {
  /**
   * Open the device-picker UI and open the selected device.  Forwards
   * directly to `SpaceMouseInput.connect()`.  Returns `{ ok: true }`
   * on success, `{ ok: false }` on user-cancelled or browser-unsupported.
   */
  connect(): Promise<{ ok: boolean }>;
  /** Release the device and wipe the cached axes.  Idempotent. */
  disconnect(): void;
  /** True when a HIDDevice is currently open. */
  isConnected(): boolean;
  /** Update the user-facing sensitivity scalar (applied AFTER the cube curve). */
  setSensitivity(value: number): void;
  /**
   * Fast predicate for the still-animating gate — returns true iff any
   * axis in the latest report is non-zero.  Runs once per frame.
   */
  hasAxes(): boolean;
  /**
   * Apply the latest axes to `cam`, scaled by elapsed wall-clock time.
   * No-op (resets the dt baseline) when all axes are zero.  Calls the
   * engine-supplied `cancelTween` callback before mutating `cam` so
   * the focus tween yields to user input — same precedence rule as
   * mouse drag.
   */
  applyToCamera(cam: OrbitCamera, nowMs: number): void;
  /** Tear-down: release the device.  Called from engine.destroy(). */
  destroy(): void;
};
