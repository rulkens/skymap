/** destroy — releasing the slots aborts a fetch in flight and drops the decoded catalog. */
import type { AsteroidsRuntime } from './@types/AsteroidsRuntime';

export function destroy(runtime: AsteroidsRuntime): void {
  runtime.slot.release();
  runtime.namesSlot.release();
}
