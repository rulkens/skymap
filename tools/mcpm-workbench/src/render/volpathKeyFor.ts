import type { ViewSlice } from '../../@types/ViewSlice';
import type { McpmCameraView } from './writeMcpmCamera';

/**
 * volpathKeyFor — Viewport.tsx's path-tracer accumulator reset key (see its own comment
 * on why camera/params/tokens belong here). `sampleCap` is excluded from the spread:
 * raising/lowering it must wake or idle the loop, never wipe the accumulator.
 */
export function volpathKeyFor(
  cam: McpmCameraView,
  pathTracer: ViewSlice['pathTracer'],
  clearTraceToken: number,
  resetToken: number,
): unknown[] {
  const { sampleCap: _sampleCap, ...pathTracerForKey } = pathTracer;
  return [cam, pathTracerForKey, clearTraceToken, resetToken];
}
