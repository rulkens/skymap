import type { FetchGalaxyBitmapInput } from '../../loading/FetchGalaxyBitmapInput';
import type { HiResFamousTexture } from '../../rendering/HiResFamousTexture';

/** Construction options for `createHiResFamousSubsystem`. */
export type HiResFamousDeps = {
  readonly texture: HiResFamousTexture;
  readonly requestRender: () => void;
  /** For tests — defaults to fetchGalaxyBitmap. */
  readonly fetcher?: (args: FetchGalaxyBitmapInput) => Promise<ImageBitmap | null>;
  /** For tests — defaults to performance.now. Unused by the planner
   *  today (no time-based fades live here) but kept on the deps so a
   *  future timing tweak doesn't require widening the contract. */
  readonly now?: () => number;
};
