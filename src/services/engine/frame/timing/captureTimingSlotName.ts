/**
 * captureTimingSlotName — the ONE GPU-timing slot a cubemap capture bills its whole bake to
 * (every face, pass and body row). Per-face slots would blow WebGPU's 4096-query cap; the
 * `·` separator (U+00B7) matches `groupKeyOf`.
 */

import type { CubemapCaptureKey } from '../../../../@types/rendering/CubemapCaptureKey';

export function captureTimingSlotName(key: CubemapCaptureKey): string {
  return `${key}·capture`;
}
