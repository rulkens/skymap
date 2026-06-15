/**
 * ReseedLatch — a one-shot "seed exactly once after each arm" flag used by
 * the flow renderer to gate its dedicated `seed` compute pass.
 *
 * `arm()` records "a seed is needed"; `consume()` returns `true` at most
 * ONCE per arm, then clears itself so the next steady frame returns
 * `false` and does NOT re-seed. Re-arming before consuming is idempotent.
 * See `createReseedLatch` for the construction and the rationale.
 */
export type ReseedLatch = {
  /** Record that a seed pass is needed before the next integrate. Idempotent. */
  arm(): void;
  /** Return whether a seed is pending, clearing the flag. True at most once per arm. */
  consume(): boolean;
};
