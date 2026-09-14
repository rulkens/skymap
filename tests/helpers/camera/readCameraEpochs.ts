/**
 * readCameraEpochs — the five camera epochs as the `{ startMs, refNull }` cells
 * the driver golden fixture pins. The fixture's cell shape is frozen; how the
 * runtime stores an epoch is not, so that mapping lives here and nowhere else.
 */

import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { Epoch } from '../../../src/@types/engine/camera/Epoch';

export type EpochCell = { readonly startMs: number | null; readonly refNull: boolean };

export function readCameraEpochs(
  state: EngineState,
): Readonly<Record<keyof EngineState['cameraRuntime']['epochs'], EpochCell>> {
  const cell = (epoch: Epoch<unknown>): EpochCell => ({
    startMs: epoch.startMs,
    refNull: epoch.ref === null,
  });
  const { tween, frameTween, autoRotate, follow, clip } = state.cameraRuntime.epochs;
  return {
    tween: cell(tween),
    frameTween: cell(frameTween),
    autoRotate: cell(autoRotate),
    follow: cell(follow),
    clip: cell(clip),
  };
}
