import type { Page } from '@playwright/test';
import { absoluteArm } from '../../../src/utils/camera/absoluteArm';
import {
  cancelCameraTween,
  commitCameraPose,
  setAutoRotate,
} from '../../../src/state/camera/cameraSlice';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { SkymapWindow } from '../../../src/@types/automation/SkymapWindow';
import { dispatchActions } from './dispatchActions';

export async function applyPose(page: Page, pose: CameraPose): Promise<void> {
  const arm = absoluteArm({
    target: pose.target,
    yaw: pose.yaw,
    pitch: pose.pitch,
    distance: pose.distance,
  });
  // The page callback closes over nothing, so the actions are built here and
  // cross as a serialized argument.
  await dispatchActions(page, [
    cancelCameraTween(),
    commitCameraPose(arm),
    setAutoRotate({ active: false, rate: 0 }),
  ]);
  await page.evaluate(() => (window as unknown as SkymapWindow).__skymap!.nextFrame());
}
