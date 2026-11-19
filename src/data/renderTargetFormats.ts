/**
 * The GPU texture formats shared by the offscreen render-target rows
 * (`renderTargets.ts`) and every renderer pipeline that draws into them
 * (`gpuHandleRegistry.ts`'s `GPU_HANDLE_ROWS`) — one constant per format so
 * the two sides can't drift apart.
 */
export const HDR_TARGET_FORMAT: GPUTextureFormat = 'rgba16float';
export const FOREGROUND_DEPTH_FORMAT: GPUTextureFormat = 'depth32float';
// The occlusion mask's (coverage, distance km): km do not fit f16, and 32-bit float
// targets cannot be filtered, which suits a mask read by `textureLoad` alone.
export const OCCLUSION_MASK_FORMAT: GPUTextureFormat = 'rg32float';
