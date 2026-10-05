/**
 * Read-only pass-name list for the DebugPanel's renderer-toggle section.
 * Toggle writes go to the store via `setPassDisabled`; the one-way override
 * semantics (can hide a passing pass, cannot force-enable a gated one) are
 * enforced in the encoder loop.
 */
export type PassOverridesHandle = {
  /** Every pass name across the HDR + UI registries, in draw order. */
  readonly allNames: readonly string[];
};
