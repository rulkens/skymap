# The star Detail slider is angular and looked dead

**Readiness:** `needs-design` (measure first). **Surfaced:** 2026-10-11, eye checks on #885; the user asked where it looked dead and it was not answered.

## Problem

`refineThreshold` (Debug panel "Detail", 0.01 to 0.3) bounds the proxy `edge^2 / distanceToBox^2` in
`src/services/gpu/shaders/octree/cut.wesl`. That is an angle, so the same value draws boxes of different
pixel size at different fields of view: a narrow field of view makes a box covering the same angle look coarser.

Where the slider looked dead, the likely cause is a limit hit first: `drawBudget` (1.5 M on every tier) or the
pool `slots` stop the refinement before the threshold does. Unverified.

## Options

1. Scale the threshold by the field of view so Detail means a pixel size.
2. Leave it angular and document that the budget and the pool bound it first.

## First step

At one pose, sweep Detail and log drawn instances against `drawBudget`; the slider is dead wherever the count is flat.
