import type { SlotStore } from '../../../../@types/cache/SlotStore';

/**
 * A detail region's bricks in one 3D texture (spec §6.4): a `SlotStore` whose slot per brick is
 * fixed by its coordinates mod K, so a world voxel never moves inside the texture. The slot index is
 * `sx + K · (sy + K · sz)`.
 */
export type BrickTextureStore = SlotStore & {
  readonly texture: GPUTexture;
  /** One brick (spec §4.3 layout) into its slot's 48³ box: one writeTexture at origin 48 · slot. */
  write(slot: number, bytes: Uint8Array): void;
};
