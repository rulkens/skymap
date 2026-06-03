/**
 * makeShaderFactory — binds a device to the shared iOS-safe shader compiler.
 *
 * The spike compiled WGSL with a raw `device.createShaderModule` plus a manual
 * `getCompilationInfo()` loop. The main app already has that logic, hardened
 * for the case that bit us repeatedly: iOS WebKit rejects WGSL Chrome's Tint
 * accepts, and because passes share one command encoder, a silently-invalid
 * module drops the WHOLE frame with no thrown error. `createShaderModuleWithDevLog`
 * prints the real compiler message + offending line in dev.
 *
 * This factory closes over the device so a `Visualization` can compile with
 * just `(code, label)` — which is exactly the `EngineContext.createShaderModule`
 * shape. One line of glue, but it keeps the reuse honest (the tool shares the
 * runtime's shader-error discipline rather than re-deriving a weaker version).
 */
import { createShaderModuleWithDevLog } from '../../../../../src/services/gpu/shaderCompileLogger';

export function makeShaderFactory(
  device: GPUDevice,
): (code: string, label: string) => GPUShaderModule {
  return (code, label) => createShaderModuleWithDevLog(device, code, label);
}
