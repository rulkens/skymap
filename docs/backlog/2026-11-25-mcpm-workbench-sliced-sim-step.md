# MCPM workbench: a sim step sliced over frames

Owner ask, 2026-11-25: a really large selection locks up the UI. Keep the page responsive
while the calculation stays exactly the same.

## Why it locks up (read from the code, not measured)

A step is one compute pass with three dispatches (propagate, decay, histogram) in
`tools/mcpm-workbench/src/sim/encodeStep.ts`, submitted once per frame. The GPU runs a
dispatch to completion and the browser's compositing waits behind it, so a dispatch longer
than a frame stops the page painting.

## Measure first

Take a GPU timing of the step against the raymarch on a large box. If the display is the
larger share, drawing the raymarch at lower resolution or less often while the sim runs is
the cheaper fix, and the slicing below may not be needed.

## The design to try

Cut each dispatch into slices and spread the slices over frames, under a per-frame budget
(about 8 ms), waiting for the GPU to finish between slices. Small boxes still run whole
steps per frame.

- Decay reads one deposit buffer and writes the other: slicing by Z slab is exact.
- Propagate slices by agent range. Check first that each agent's random numbers come from
  its index and the step number, not from execution order, and how agents add into the
  deposit grid (if those adds already race, runs are already not bit-exact).
- Histogram only reads: slice it freely or skip it on most steps.

## Costs

- The raymarch draws a half-updated trace mid-step, unless it draws only between steps.
- A step becomes a small state machine: pause, reset and parameter edits land on step
  boundaries only.
- Total throughput drops a little from the waits.
- The probe must count completed steps, not frames (the same fix its wall-time flakiness
  needs).
