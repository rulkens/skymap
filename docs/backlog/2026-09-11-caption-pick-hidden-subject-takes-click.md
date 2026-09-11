# A caption whose subject is hidden behind a body still takes the click over that disc

**Raised:** 2026-09-11, PR #678 fix round (caption pick over a body,
`.superpowers/sdd/2026-09-10-mesh-bodies-02-feature/caption-pick-over-body-report.md`).
User ruled: accepted for the PR, backlog.

## What happens

`pickProgram.ts` folds the overlay pick target (`pick:overlay`, every
`foregroundLabelsPass` caption stamp) ahead of the slab chain, so a body
caption drawn over another body's disc wins the click — the whale's name over
Earth. That set is wider than what is drawn: a NEAR0 caption whose own subject
is behind a body (`Label2D.occludeWeight === 1`, the Moon sinking behind
Earth's limb) is attenuated to nothing by `labels/fragmentOcclude.wesl` where
the disc covers it, yet its overlay stamp still claims the pixel there. Before
the overlay target the body won; now the invisible caption does. Pick wider
than draw is the safe direction for a click affordance (the direction
`labelsPass` and `bodyGlintsPass` already lean), which is why it was accepted.

## The faithful fix

Split the caption stamps by `occludeWeight`: weight-0 captions (subject in
front) stamp into `pick:overlay`; weight-1 captions stay on `pick:near0` and
fold at their slab's distance as before. One renderer cannot stamp into two
targets in one submit today — it needs either a second `LabelPickRenderer`
handle in `gpuHandleRegistry` or per-submit slot cursors on the existing one.
About the size of the overlay-target change itself; judged disproportionate
for a residual nobody has hit.

## Test that would pin it

`pickProgram.test.ts` already covers "overlay stamp beats a body row" and
"NEAR0 star hit loses to a body row". Add: a caption with `occludeWeight 1`
over a body row resolves to the body.
