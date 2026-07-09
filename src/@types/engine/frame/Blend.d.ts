/**
 * Blend — how a content layer's fragments combine with what's already in
 * its render target.
 *
 * This is the third of the three independent axes a `ContentLayer` is
 * positioned on (alongside `slab` and `target` — see the renderer
 * unification design's "essential / accidental split"). Emissive point
 * clouds accumulate additively with no depth test; solid near-field bodies
 * are opaque and depth-tested; screen-space overlays (rings, labels) draw
 * Porter-Duff OVER on top of whatever is already composited. Those three
 * physics are essential and stay distinct — a layer's `blend` must match
 * the profile baked into the renderer pipeline its `draw` calls. Today
 * that match holds by construction (every layer sharing a `target` also
 * shares a `blend`), so the field is consumed only as a human-readable
 * contract; nothing checks it against the pipeline at runtime. A
 * layer↔pipeline parity check is the intended guardrail once a target's
 * layers stop agreeing on blend — see `ContentLayer.d.ts`'s `blend` field
 * for when that first happens.
 *
 * Distinct from `CompositeBlend` (`src/@types/rendering/CompositeBlend.d.ts`):
 * `Blend` describes how a content layer draws its own fragments into a
 * render target; `CompositeBlend` describes how the Compositor merges one
 * whole offscreen texture into another. The two enumerations look similar
 * because both model "how do fragments combine", but they parameterize
 * different operations and are not interchangeable.
 */

export type Blend = 'additive' | 'opaque' | 'over';
