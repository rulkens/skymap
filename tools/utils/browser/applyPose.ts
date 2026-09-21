import type { Page } from '@playwright/test';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { SkymapPerfHook } from '../../../src/state/perf/@types/SkymapPerfHook';

export async function applyPose(page: Page, pose: CameraPose): Promise<void> {
  await page.evaluate((p) => {
    const h = (window as unknown as { __skymapPerf: SkymapPerfHook }).__skymapPerf;
    return h.setPose({
      target: p.target,
      yaw: p.yaw,
      pitch: p.pitch,
      distance: p.distance,
      rate: 0,
    });
  }, pose);
}
