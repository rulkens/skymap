# `glade-points` throws "Maximum update depth exceeded"

`needs-repro` — filed 2026-07-30 from an observation, not from a diagnosis.

## What was seen

During the Earth virtual-texture visual pass (branch
`feat/earth-surface-virtual-texture`, 2026-07-30), the console carried a React
"Maximum update depth exceeded" for the `glade-points` asset, logged with
`finalAttempt: 2`. That error is React's setState-in-render / effect-loop guard,
so the retry very likely never completed and the GLADE catalog failed to load
for that session.

Not reproduced deliberately, not bisected, and seen exactly once.

## Why it is filed here rather than fixed

The obvious suspect is the same session's heartbeat change — `LIVE_IDLE_TICK_MS`
went 3000 -> 500 in `runFrame.ts` (commit `d6fd725a`), so the live-clock wake
fires 6x more often. If a load-progress path dispatches per wake and a React
subscriber re-renders on that dispatch, a tighter loop is exactly what would
turn a survivable pattern into a runaway one.

Against that theory: **nothing on that branch touches the React loading path.**
The heartbeat drives the render loop, not asset demand, and the two meet only
through the store. So this is a plausible-but-unverified suspect, and the
[[feedback_multiple_sufficient_causes]] trap applies — the loop may predate the
branch entirely and simply have gone unnoticed at 3000 ms.

## How to settle it

Revert `LIVE_IDLE_TICK_MS` to 3000 locally and reload with a cold cache. If the
error goes, the heartbeat is causal and the fix belongs at whichever subscriber
re-renders per wake — not at the heartbeat, which is doing its job. If the error
stays, the suspect is cleared and the loop is pre-existing; bisect the
`glade-points` demand path instead.

Do this before spending anything on either side: the two outcomes have different
fixes in different files.

## Related

- The heartbeat's rationale lives in `runFrame.ts`'s `LIVE_IDLE_TICK_MS`
  docstring — 500 ms is what makes Earth's motion read as continuous rather than
  as a 4-second jump.
