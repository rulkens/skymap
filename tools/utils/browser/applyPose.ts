import type { Page } from '@playwright/test';
import { absoluteArm } from '../../../src/utils/camera/absoluteArm';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { PerfPose } from '../../../src/@types/perf/PerfPose';
import type { SkymapPerfHook } from '../../../src/state/perf/@types/SkymapPerfHook';

export async function applyPose(page: Page, pose: CameraPose): Promise<void> {
  // The arm is built here, not inside `evaluate`: the page callback closes over
  // nothing, so anything it needs has to cross as a serialized argument.
  const perfPose: PerfPose = {
    framed: absoluteArm({
      target: pose.target,
      yaw: pose.yaw,
      pitch: pose.pitch,
      distance: pose.distance,
    }),
    rate: 0,
  };
  await page.evaluate((p) => {
    const h = (window as unknown as { __skymapPerf: SkymapPerfHook }).__skymapPerf;
    return h.setPose(p);
  }, perfPose);
}
