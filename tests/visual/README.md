# Visual baseline tests

These tests pin the per-frame SEQUENCE of renderer-`draw` calls — not GPU
pixels.  The galaxy-impostor subsystem split (2026-05-12) needs byte-
identical visual output before/after, but standing up a real WebGPU
pixel-readback harness costs more than the refactor it would gate.

Instead each `*.baseline.test.ts` file:

  1. Constructs a deterministic fixture (cameras at fixed positions,
     synthetic PointClouds with hand-picked diameters and orientations).
  2. Drives the engine subsystems through their `runFrame` step exactly
     as the production frame body would.
  3. Records `(rendererName, instanceCount, hashOfPackedInstances)` for
     every renderer.draw() call in order.
  4. Asserts that recording against a checked-in fixture.

Failure means "your refactor changed what the GPU was told to draw".
Pass means "it didn't".

Floating-point determinism: instance fields are rounded to 6 decimal
places before hashing to absorb the occasional ULP wobble from `Math.tan`,
`Math.sqrt`, etc.  6 dp is finer than any per-pixel difference the
shader could produce at typical viewport sizes.
