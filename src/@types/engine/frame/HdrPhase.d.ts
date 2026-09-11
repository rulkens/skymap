/**
 * HdrPhase — when in the frame's HDR accumulation a `(hdr, NEAR0)` layer
 * draws; a render step states the SET of phases it admits
 * (`FrameStep.hdrPhases`). The one `(hdr, NEAR0)` roster is
 * split around two things that must land BETWEEN its layers: the black-hole
 * lens's own `(hdr, BODY[k])` step (`'pre-lens'` / `'post-lens'`, emitted only
 * while the lens fires) and the `foreground:0 → hdr` body composite
 * (`'post-foreground'`, emitted every frame — the step trails opaque bodies
 * so its layers can draw OVER them). `slabs.ts`'s `matchesHdrPhase` is the
 * single predicate that tests a layer's phase against a step's admitted set.
 */
export type HdrPhase = 'pre-lens' | 'post-lens' | 'post-foreground';
