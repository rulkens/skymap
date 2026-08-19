/**
 * createReseedLatch — a one-shot "seed exactly once after each arm" flag.
 *
 * The flow renderer encodes a dedicated `seed` compute pass into the frame
 * encoder only when a reseed is pending: on first field load, mode switch, or
 * particle-count change. The latch models that intent precisely. `arm()`
 * records "a seed is needed"; `consume()` returns `true` at most ONCE per arm,
 * then clears itself so the next steady frame returns `false` and does NOT
 * re-seed. Re-arming before consuming is idempotent — two `arm()` calls still
 * yield a single `true`.
 *
 * Why a tiny pure helper rather than a raw `boolean` flipped inline: pulling
 * the state machine out of the renderer makes the "consumed at most once"
 * contract unit-testable without a GPU, and keeps the renderer's `encodeCompute`
 * reading as `if (reseed.consume()) { ...seed pass... }` — the intent is legible
 * at the call site, and the off-by-one (re-seeding every frame, or never
 * seeding) lives behind one tested boundary instead of scattered booleans.
 *
 * `MilkyWayCloud.reconcile` answers the same question with a self-healing
 * compare; this stays a one-shot latch because the reseed can't be recorded
 * at compare time — it's encoded only when the render path runs (D4).
 */

import type { ReseedLatch } from '../@types/rendering/ReseedLatch';

export function createReseedLatch(): ReseedLatch {
  let armed = false;
  return {
    arm() {
      armed = true;
    },
    consume() {
      const pending = armed;
      armed = false;
      return pending;
    },
  };
}
