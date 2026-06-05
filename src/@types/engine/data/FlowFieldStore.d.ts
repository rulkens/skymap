/**
 * FlowFieldStore — per-type store for the flow-field layer's load status.
 *
 * Status-only, exactly like `FilamentStore`. It holds the one thing the CPU
 * owns about flow that isn't user state: whether the velocity cube has been
 * committed to the renderer. The GPU resources — the velocity `texture_3d`,
 * the particle/trail/accumulator buffers, the compute pipelines — live on
 * `flowFieldRenderer`, never here.
 *
 * Flow is a singleton overlay layer (see
 * `docs/superpowers/conventions/singleton-overlay-layers.md`): its master
 * `enabled` gate and every look/motion knob live in `settings.flow`, NOT here,
 * matching `filaments` / `milkyWay`. The asset-demand predicate reads
 * `settings.flow.enabled`; the renderer reads the rest of `settings.flow` each
 * frame; and the flow asset slot flips `loaded` via `setLoaded()` on commit.
 */
export type FlowFieldStore = {
  /** True once the velocity cube has been committed to the renderer. */
  readonly loaded: boolean;
  /** Record that the cube has been committed to the renderer. */
  setLoaded(): void;
};
