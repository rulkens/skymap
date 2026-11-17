/**
 * The .icns slots that hold PNG: each pixel size fills its 1x slot and the 2x slot of half its size.
 * 16 and 32 at 1x are left out: their PNG types (icp4, icp5) decode as noise, and macOS scales down
 * the 2x slots instead.
 */
export const ICNS_SLOTS: readonly (readonly [type: string, size: number])[] = [
  ['ic11', 32],
  ['ic12', 64],
  ['ic07', 128],
  ['ic13', 256],
  ['ic08', 256],
  ['ic14', 512],
  ['ic09', 512],
  ['ic10', 1024],
];
