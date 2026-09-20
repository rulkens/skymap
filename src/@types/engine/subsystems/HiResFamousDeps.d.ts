import type { FetchGalaxyBitmapInput } from '../../loading/FetchGalaxyBitmapInput';
import type { HiResFamousTexture } from '../../rendering/hiResFamousTexture/HiResFamousTexture';

/** Construction options for `createHiResFamousSubsystem`. */
export type HiResFamousDeps = {
  readonly texture: HiResFamousTexture;
  readonly requestRender: () => void;
  /** For tests — defaults to fetchGalaxyBitmap. */
  readonly fetcher?: (args: FetchGalaxyBitmapInput) => Promise<ImageBitmap | null>;
};
