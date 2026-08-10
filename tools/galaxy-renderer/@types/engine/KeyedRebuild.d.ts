/**
 * KeyedRebuild — a rebuild gated on two axes that vary independently: whether
 * a consumer currently wants the value (`wanted`), and whether the inputs have
 * moved since the last build. Setters raise the second and never reason about
 * the first; the frame loop asks for both at once.
 */

export type KeyedRebuild = {
  /** The inputs moved. Cheap and order-free — safe to call from any setter. */
  invalidate(): void;
  /**
   * Build iff a consumer wants the value AND the inputs moved. Returns
   * whether a consumer wants it, for the caller to use as its draw gate.
   */
  ensureFresh(): boolean;
};
