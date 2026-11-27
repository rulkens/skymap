/**
 * createBrickTextureStore — a toroidal `SlotStore` over one 3D texture of (K · 48)³ texels (spec
 * §6.4). A brick's slot is fixed by its coordinates mod K, so a shift rewrites only the entering
 * slab; `SlotPool` (LRU picks the slot) and `TextureAtlas` (2D) do not fit. The fade's slot lock is
 * the contract's own `liveSince`: the region touches every shown brick before it allocates.
 */
import type { VolumePyramidFormatRow } from '../../../../@types/data/volume/VolumePyramidFormatRow';
import type { SlotEvictHandler } from '../../../../@types/cache/SlotEvictHandler';
import type { Vec3 } from '../../../../../packages/shared/src/@types/math/Vec3';
import { TEXTURE_BYTES_PER_TEXEL } from '../../../../data/gpu/textureBytesPerTexel';
import { VOLUME_BRICK_EDGE } from '../../../../data/volume/volumeBrickEdge';
import { levelByteLength } from '../../../../utils/gpu/memory/levelByteLength';
import { brickCoordsOf } from '../../../../utils/volume/brickCoordsOf';
import type { BrickTextureStore } from '../@types/BrickTextureStore';

export function createBrickTextureStore(
  device: GPUDevice,
  binBaseName: string,
  format: VolumePyramidFormatRow,
  grid: Vec3,
  bricksPerAxis: number,
): BrickTextureStore {
  const k = bricksPerAxis;
  const edge = k * VOLUME_BRICK_EDGE;
  const texture = device.createTexture({
    label: `density-region-${binBaseName}`,
    size: { width: edge, height: edge, depthOrArrayLayers: edge },
    format: format.gpuFormat,
    dimension: '3d',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  // A compressed copy counts in blocks: a row is one row of blocks, an image 48 / blockEdge rows.
  const layout = {
    bytesPerRow: levelByteLength(
      VOLUME_BRICK_EDGE,
      format.blockEdge,
      1,
      TEXTURE_BYTES_PER_TEXEL[format.gpuFormat]!,
    ),
    rowsPerImage: VOLUME_BRICK_EDGE / format.blockEdge,
  };
  const occupant: Array<string | undefined> = new Array(k ** 3).fill(undefined);
  const lastSeen: number[] = new Array(k ** 3).fill(-Infinity);
  let occupied = 0;
  let onEvict: SlotEvictHandler | undefined;

  const slotFor = (key: string): number => {
    const [x, y, z] = brickCoordsOf(Number(key), grid);
    return (x % k) + k * ((y % k) + k * (z % k));
  };

  return {
    texture,
    allocate(key, frame, liveSince = frame) {
      const slot = slotFor(key);
      const old = occupant[slot];
      if (old === undefined) occupied++;
      else if (old !== key) {
        if (lastSeen[slot]! >= liveSince) return null;
        // As SlotPool: the old key has left and the slot is not yet rewritten, so the stream clears
        // the old brick's loaded and failed marks.
        occupant[slot] = undefined;
        onEvict?.(old);
      }
      occupant[slot] = key;
      lastSeen[slot] = frame;
      return slot;
    },
    touch(key, frame) {
      const slot = slotFor(key);
      if (occupant[slot] !== key) return null;
      lastSeen[slot] = frame;
      return slot;
    },
    slotOf(key) {
      const slot = slotFor(key);
      return occupant[slot] === key ? slot : undefined;
    },
    occupiedCount: () => occupied,
    setEvictHandler(handler) {
      onEvict = handler;
    },
    write(slot, bytes) {
      const x = slot % k;
      const y = Math.floor(slot / k) % k;
      const z = Math.floor(slot / (k * k));
      device.queue.writeTexture(
        {
          texture,
          origin: { x: x * VOLUME_BRICK_EDGE, y: y * VOLUME_BRICK_EDGE, z: z * VOLUME_BRICK_EDGE },
        },
        bytes,
        layout,
        {
          width: VOLUME_BRICK_EDGE,
          height: VOLUME_BRICK_EDGE,
          depthOrArrayLayers: VOLUME_BRICK_EDGE,
        },
      );
    },
    destroy() {
      texture.destroy();
    },
  };
}
