# Cap GPU frames in flight

When a frame's GPU work runs over the vsync budget, nothing stops the main thread from submitting the
next frame, so the queue backs up. Measured 2026-11-10 at the `milky-way` pose with the v2 field on
(GPU 10 ms against an 8.3 ms budget): frames queued about 7 deep, and submit-to-done latency went from
8.7 ms to 69 ms. That shows up as lag on input, not as dropped frames. Any heavy scene does the same.
The v2 field only exposed it.

## Tried and parked, 2026-11-22

A fence in `renderScheduler.ts` was built and measured, then dropped: it stalls the offline recorder,
and the gain did not justify a recorder special case. Nothing landed.

**The build.** The scheduler counted frames whose `queue.onSubmittedWorkDone()` had not settled. At
the cap, `requestRender` held the frame and queued its rAF when one settled. About 30 lines plus a
`frameFence` option wired from `engine.ts`.

**Why it was parked.**

- **It stalls the recorder.** `npm run record-tour -- demo --beats 0..0 --frames 300 --size 1280x720`
  finished uncapped. At cap 3 it crawled at under 2 frames a second and hung at frame 184, twice at
  the same frame. Cause not traced. Best guess: the settle callback that releases a held frame does
  not arrive while the recorder holds virtual time paused.
- **The gain is small to the eye.** The owner felt "a little less laggy" on desktop and no difference
  on the phone.
- **It costs the phone frame rate.** About 4% at cap 3 and 10% at cap 2.

**Measurements.** Lag is submit-to-done, median.

Desktop, visible window, 120 Hz, `milky-way` pose, v2 field:

| Window | Uncapped | Cap 3 | Cap 2 |
|---|---|---|---|
| 1400×900 dpr 2 | 94 fps, 71 ms | 103 fps, 22 ms | 92 fps, 15 ms |
| 1.3× larger | 68 fps, 98 ms | 70 fps, 35 ms | 69 fps, 21 ms |

- The GPU finishes the same number of frames capped and uncapped. The cap turns the shortfall from
  lag into skipped refreshes (35% of refreshes idle in the larger window). Uncapped, Chrome slows
  rAF itself to the GPU's pace, so a DevTools recording looks even while every frame is late.
- v1 at the same pose is untouched by cap 2 (8.5 ms, full rate).
- Cap 1 halves the frame rate of a healthy scene (171 frames in 360 refreshes).

OnePlus 7T, Chrome 157:

| Scene | Uncapped | Cap 3 | Cap 2 |
|---|---|---|---|
| 500 km over Copenhagen, clock at 10 s/s | 30 fps, 99 ms | 29 fps, 78 ms | 26 fps, 58 ms |
| `milky-way`, v1 | 36–43 fps, 62–78 ms | 34–38 fps, 51–66 ms | 31–39 fps, 41–50 ms |
| `milky-way`, v2 | 13–19 fps, 154–247 ms | 12–18 fps, 135–198 ms | 11–17 fps, 94–146 ms |

The phone queues about 4 deep uncapped, against 7 on desktop.

## Before trying again

- Decide how the recorder is kept out of it first: trace the stall, or drive the fence from
  something that still advances under paused virtual time.
- Headless numbers flatter the change. Measure in a visible window on a 120 Hz display, and compare
  frames finished per second, not only lag.
- Check the at-rest sleep (render-wake) is unchanged. With the fence it was: only the 500 ms
  live-clock heartbeat submitted.

**The probe.** Patch `GPUQueue.prototype.submit` in an init script: stamp each submit, count it as
in flight, and on `onSubmittedWorkDone()` record the elapsed time. Boot `?perf`, dispatch
`settings/milkyWay/setMilkyWayRenderer` with `'v2'`, `setPose` to the scenario, skip 240 rAFs, then
sample 360. On the phone, register the same script with `Page.addScriptToEvaluateOnNewDocument`,
have it `console.log` a summary every 5 s and read `Runtime.consoleAPICalled`. Auto-rotate does
nothing near a body, so run the clock at 10 s/s (`time/setRate`, `rateIndex: 1`) to keep frames
coming.
