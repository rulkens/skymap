/**
 * The two GPU texture formats shared by the offscreen render-target rows
 * (`renderTargets.ts`) and every renderer pipeline that draws into them
 * (`gpuHandleRegistry.ts`'s `GPU_HANDLE_ROWS`) — one constant per format so
 * the two sides can't drift apart.
 */
export const HDR_TARGET_FORMAT: GPUTextureFormat = 'rgba16float';
export const FOREGROUND_DEPTH_FORMAT: GPUTextureFormat = 'depth32float';
