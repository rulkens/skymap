/**
 * Paste-ready `exhibitRegistry.ts` pose field, full JS precision like
 * `copyTextOf` — an exhibit's framing is Mpc-scale, and a rounded target reads
 * as a different galaxy than the one the curator actually stood at.
 */

import type { CameraPose } from '../../@types/camera/CameraPose';
import { num } from '../../utils/format/num';

export function poseSnippetOf(pose: CameraPose): string {
  const [x, y, z] = pose.target;
  return (
    `pose: { target: [${num(x)}, ${num(y)}, ${num(z)}], ` +
    `yaw: ${num(pose.yaw)}, pitch: ${num(pose.pitch)}, distance: ${num(pose.distance)} }`
  );
}
