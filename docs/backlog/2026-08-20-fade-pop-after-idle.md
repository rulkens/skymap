# Volume/layer fades pop instead of ramping after the render loop idles

**Area:** engine / animation · **Readiness:** ready

Any `applyIntent`-driven fade (volume fields, and every other layer routed
through the same call) pops straight to its target opacity instead of
ramping, if the toggle happens after the render-on-demand loop has been
asleep for at least one fade-duration (~600 ms for fade-in).

Mechanism: `fadeRegistry.fadeTo` (`src/services/animation/fadeRegistry.ts:125-133`)
stamps `transitionStartMs` from `nowMs ?? lastTickNowMs` — no caller passes
`nowMs`, and `lastTickNowMs` is a subsystem field only updated inside
`tick(nowMs)` (`fadeRegistry.ts:155-161`), called once per *rendered* frame
from `runFrame.ts:708`. While the loop is idle (`shouldKeepTicking` false,
scheduler stopped self-rescheduling), `lastTickNowMs` freezes at the last
real frame's timestamp. The toggle's wake schedules a fresh `rAF`, which
runs at the real current time and evaluates `smoothstep(transitionStartMs,
transitionStartMs+600, real_now)` (`volumeLiveness.ts:104`) against a window
that's already `Δ` ms stale — if `Δ ≥ 600`, `t` clamps to 1 on the very
first drawn frame, with no intermediate frame ever observing a partial
value.

Reproduction: let the scene sit motionless a few seconds (no camera
drag/orbit, no other panel toggle), then toggle a volume overlay (e.g. mcpm)
ON — pops instantly. Nudge the camera (or toggle a different layer)
immediately beforehand, so the loop is mid-frame, then toggle again — fades
visibly over ~600 ms.

Diagnosed while investigating a suspected regression on `refactor/wake-vote-fold`
(deleted `requestRender()` calls in `uploadVolumeField`/`unloadVolumeField`);
traced and ruled pre-existing — see
`.superpowers/sdd/2026-08-19-wake-vote-fold/smoke-mcpm-pop-investigation.md`.

## Fix sketch

Stamp fades from a real clock rather than the stale last-tick time — either
have `applyIntent` pass an explicit `nowMs` (e.g. `performance.now()`) into
`fadeTo`, or have `fadeTo` fall back to a live clock read instead of
`lastTickNowMs` when no `nowMs` is supplied.
