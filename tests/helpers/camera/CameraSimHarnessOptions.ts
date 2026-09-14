import type { SimBodyId } from './SimBodyId';

/** Options for {@link import('./makeCameraSimHarness').makeCameraSimHarness}. */
export type CameraSimHarnessOptions = {
  readonly fovDeg?: number;
  readonly canvasSize?: number;
  /** Body focused via `setSelectionRow` at boot; `null` skips the dispatch. */
  readonly focusBody?: SimBodyId | null;
  /** h/R over `focusBody` (or Earth) the boot pose starts at; `null` skips
   * seeding a pose — the fixture seeds its own via `seedPose`. */
  readonly bootHR?: number | null;
  /** Distance (Mpc) of the neutral origin-centred pose used when `bootHR` is
   * `null` — no store commit, just what `cameraRuntime` starts holding. */
  readonly neutralDistance?: number;
  /** Wire the real `createClipPlayer` over the harness store instead of the
   * inert tick stub — for scripts whose legs include a clip. */
  readonly realClipPlayer?: boolean;
};
