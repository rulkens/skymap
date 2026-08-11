import type { Vec2 } from '../../@types/math/Vec2';

/**
 * Pixel size of a reduced-resolution render target: `floor(size / scale)`,
 * clamped to 1 px per axis. Must match `renderTargets.ts`'s `allocate` —
 * same formula, same clamp — since both compute the size of textures the
 * same upsample pass reads. `floor` (not `round`) is deliberate: the
 * upsample shader's sample-at-uv semantics assume it. The clamp guards a
 * tiny canvas, where `floor` alone could ask for an illegal 0-dimension
 * texture.
 */
export function reducedTargetSize(width: number, height: number, scale: number): Vec2 {
  return [Math.max(1, Math.floor(width / scale)), Math.max(1, Math.floor(height / scale))];
}
