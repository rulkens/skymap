/**
 * HdrPhase — where in the frame's HDR accumulation a `(hdr, NEAR0)` render
 * step sits, and which layers it admits. The one `(hdr, NEAR0)` roster is
 * split around two things that must land BETWEEN its layers: the black-hole
 * lens's own `(hdr, BODY[k])` step (`'pre-lens'` / `'post-lens'`, emitted only
 * while the lens fires) and the `foreground:0 → hdr` body composite
 * (`'post-foreground'`, emitted every frame — the step trails opaque bodies
 * so its layers can draw OVER them). `slabs.ts`'s `matchesHdrPhase` is the
 * single predicate that pairs a step's phase with a layer's.
 */
export type HdrPhase = 'pre-lens' | 'post-lens' | 'post-foreground';
