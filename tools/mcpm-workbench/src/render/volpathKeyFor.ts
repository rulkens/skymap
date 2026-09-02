import type { ViewSlice } from '../../@types/ViewSlice';
import type { McpmCameraView } from './writeMcpmCamera';

/**
 * volpathKeyFor — Viewport.tsx's path-tracer accumulator reset key (see its own comment
 * on why camera/params belong here). `sampleCap` is excluded from the spread:
 * raising/lowering it must wake or idle the loop, never wipe the accumulator. Explicit
 * reset/clear-trace commands no longer feed this key — Task 7's saga calls
 * `graph.resetVolpath()` directly when it handles those actions.
 */
export function volpathKeyFor(cam: McpmCameraView, pathTracer: ViewSlice['pathTracer']): unknown[] {
  const { sampleCap: _sampleCap, ...pathTracerForKey } = pathTracer;
  return [cam, pathTracerForKey];
}
