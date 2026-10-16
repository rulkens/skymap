/**
 * GPU texture atlas: one atlasSide×atlasSide texture sliced into a square grid
 * of slotSide×slotSide slots. Fixed-size because WebGPU caps simultaneously
 * bound textures at ~16 and a per-item GPUTexture would thrash the allocator;
 * one atlas + one bind group = one draw call for thousands of textured items.
 *
 * Geometry and format are per-instance config (galaxy thumbnails and surface
 * tiles differ); `slotsPerRow` derives from `atlasSide / slotSide`. The key →
 * slot LRU and the slot-index rule live in `SlotPool`, which this composes.
 */

import type { Vec4 } from '../../../@types/math/Vec4';
import type { SlotEvictHandler } from '../../../@types/cache/SlotEvictHandler';
import type { SlotStore } from '../../../@types/cache/SlotStore';
import type { TextureAtlasConfig } from '../../../@types/rendering/TextureAtlasConfig';
import { SlotPool } from '../../../utils/cache/slotPool';

export class TextureAtlas implements SlotStore {
  private readonly device: GPUDevice;
  private readonly atlasSide: number;
  private readonly slotSide: number;
  private readonly label: string;
  private readonly slotsPerRow: number;
  private readonly pool: SlotPool;
  private readonly texture: GPUTexture;

  constructor(device: GPUDevice, config: TextureAtlasConfig) {
    this.device = device;
    this.atlasSide = config.atlasSide;
    this.slotSide = config.slotSide;
    this.label = config.label;
    this.slotsPerRow = this.atlasSide / this.slotSide;
    this.pool = new SlotPool(this.slotsPerRow * this.slotsPerRow);
    this.texture = device.createTexture({
      label: this.label,
      size: [this.atlasSide, this.atlasSide, 1],
      format: config.format,
      // RENDER_ATTACHMENT is unused today; kept so a "loading…" placeholder
      // pass would not need the texture recreated.
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  setEvictHandler(handler: SlotEvictHandler | undefined): void {
    this.pool.setEvictHandler(handler);
  }

  allocate(key: string, frame: number): number | null {
    return this.pool.allocate(key, frame);
  }

  touch(key: string, frame: number): number | null {
    return this.pool.touch(key, frame);
  }

  slotOf(key: string): number | undefined {
    return this.pool.slotOf(key);
  }

  occupiedCount(): number {
    return this.pool.occupiedCount();
  }

  /**
   * The bitmap must be exactly slotSide × slotSide (the fetcher resizes during
   * decode). The slot is taken on trust: a caller holding a KEY resolves it
   * through `slotOf` immediately before calling this. `flipY: false` because
   * the quad shader's v=0 is the top of the atlas, the bitmap's own orientation.
   */
  uploadBitmap(slotIdx: number, bitmap: ImageBitmap): void {
    const col = slotIdx % this.slotsPerRow;
    const row = Math.floor(slotIdx / this.slotsPerRow);
    this.device.queue.copyExternalImageToTexture(
      { source: bitmap, flipY: false },
      { texture: this.texture, origin: [col * this.slotSide, row * this.slotSide, 0] },
      [this.slotSide, this.slotSide, 1],
    );
  }

  /** A fresh view per call (cheap), so callers never track view lifetime. */
  getTextureView(): GPUTextureView {
    return this.texture.createView({ label: `${this.label}-view` });
  }

  /** WebGPU frees a texture only on `destroy()`, never on GC. */
  destroy(): void {
    this.texture.destroy();
  }

  /** UV rectangle [u0, v0, u1, v1] in [0,1] texture coords; slots are row-major. */
  slotUv(slotIdx: number): Vec4 {
    const col = slotIdx % this.slotsPerRow;
    const row = Math.floor(slotIdx / this.slotsPerRow);
    const slotNorm = this.slotSide / this.atlasSide;
    const u0 = col * slotNorm;
    const v0 = row * slotNorm;
    return [u0, v0, u0 + slotNorm, v0 + slotNorm];
  }
}
