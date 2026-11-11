# Cap GPU frames in flight

When a frame's GPU work runs over the vsync budget, nothing stops the main thread from submitting the
next frame, so the queue backs up. Measured 2026-11-10 at the `milky-way` pose with the v2 field on
(GPU 10 ms against an 8.3 ms budget): frames queued about 7 deep, and submit-to-done latency went from
8.7 ms to 69 ms. That shows up as lag on input, not as dropped frames. Any heavy scene does the same.
The v2 field only exposed it.

Shape: before encoding the next frame, wait until at most 1–2 earlier submits are outstanding (an
`onSubmittedWorkDone` fence per frame, or a counter). It belongs in the frame loop
(`src/services/engine/subsystems/renderScheduler.ts`, where the frame is driven), not in any Layer.
Measure lag before and after with the saturated-GPU probe described in
`2026-11-11-milky-way-v2-field-perf.md`, and check that the at-rest sleep (render-wake) is unchanged.
