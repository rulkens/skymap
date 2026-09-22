/** `GPUExtent3D` is a dict OR a `[width, height?, depth?]` array; textures
 *  (unlike buffers) need width/height/depth as three plain numbers to walk
 *  mips, so every other GPU-memory helper normalizes through here first. */
export function normalizeGpuExtent3D(size: GPUExtent3D): readonly [number, number, number] {
  if (Array.isArray(size)) {
    return [size[0] ?? 1, size[1] ?? 1, size[2] ?? 1];
  }
  return [size.width, size.height ?? 1, size.depthOrArrayLayers ?? 1];
}
