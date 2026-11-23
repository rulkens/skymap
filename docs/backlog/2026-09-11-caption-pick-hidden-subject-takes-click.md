# A caption whose subject is hidden behind a body still takes the click over that disc

**Raised:** 2026-09-11, PR #678 fix round (caption pick over a body,
`.superpowers/sdd/2026-09-10-mesh-bodies-02-feature/caption-pick-over-body-report.md`).
User ruled: accepted for the PR, backlog.

## What happens

`pickProgram.ts` folds the overlay pick target (`pick:overlay`, every
`labelsNearPass` caption stamp) ahead of the slab chain, so a body
caption drawn over another body's disc wins the click — the whale's name over
Earth. That set is wider than what is drawn: a NEAR0 caption whose own subject
is hidden is attenuated to nothing by `labels/fragmentOcclude.wesl` where the
scene covers it, yet its overlay stamp still claims the pixel there.

**Half fixed (2026-11-17, label records):** a caption whose subject is behind a
body SPHERE gets zero target and `clickable = 0` in `targetAlpha.ts`, so it
neither draws nor stamps. What is left is a subject hidden only by the sampled
depth (a mesh body, terrain), which the shader hides and the pick does not. Before
the overlay target the body won; now the invisible caption does. Pick wider
than draw is the safe direction for a click affordance (the direction
`labelsCosmoPass` and `bodyGlintsPass` already lean), which is why it was accepted.

## The draw-side twin

The body-sphere verdict is decided per SUBJECT (`targetAlpha.ts`) but the
depth fade is applied per PIXEL, so the exemption is all-or-nothing across the caption: one
whose subject is unoccluded paints at full strength over any body NEARER than
that subject its lifted text happens to cross — which the per-pixel rule used to
hide. The same trade in the other direction (draw wider than truth), and the
same split below fixes both.

## The faithful fix

Split the caption stamps by the subject's depth verdict: captions whose subject
is in front stamp into `pick:overlay`; hidden ones stay on `pick:near0` and fold
at their slab's distance as before. One renderer cannot stamp into two
targets in one submit today — it needs either a second `LabelPickRenderer`
handle in `gpuHandleRegistry` or per-submit slot cursors on the existing one.
About the size of the overlay-target change itself; judged disproportionate
for a residual nobody has hit.

## Test that would pin it

`pickProgram.test.ts` already covers "overlay stamp beats a body row" and
"NEAR0 star hit loses to a body row". Add: a caption whose subject is
depth-hidden over a body row resolves to the body.
