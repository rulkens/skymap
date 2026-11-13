/** destroy — releasing the slot aborts a fetch in flight and drops the catalog; then the GPU side. */
import type { AsteroidsRuntime } from './@types/AsteroidsRuntime';

export function destroy(runtime: AsteroidsRuntime): void {
  runtime.slot.release();
  runtime.renderer.destroy();
  runtime.orbitRenderer.destroy();
  runtime.solver.destroy();
}
