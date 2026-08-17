# earthFlyout stalls the recorder's virtual-time pipeline

`npm run record-clip -- earthFlyout` fails intermittently with:

```
Error: virtualTimeBudgetExpired never fired within 15000 ms (frame 0)
       — the virtual-time pipeline is stalled
```

Not a regression: `grantAndAwaitExpiry` is unchanged. The clip path shipped in
#534 simply made `earthFlyout` reachable by the recorder for the first time, and
that surfaced pre-existing fragility. Tours never hit it.

## It is intermittent

`earthFlyout` recorded cleanly three times on 2026-07-31 ~03:50–04:05 (841
frames each, 640×360 @ 12 fps) — those takes are what verified the sim-clock pin
(PSNR 47.7 dB between two same-pin takes vs 26.1 dB at a pin six months apart).
From ~12:30 the same command failed on eight consecutive attempts, while an
instrumented single-grant run of the same clip succeeded once in between.

## Measured facts

Collected with a throwaway Playwright diagnostic that mirrors `record.ts`'s
choreography and reports in-flight requests, rAF production and the page clock.

| observation                               | `flyout` (records fine) | `earthFlyout` (stalls) |
| ----------------------------------------- | ----------------------- | ---------------------- |
| budget expired                            | true                    | false                  |
| rAF callbacks during a 166 ms grant       | 32                      | 2400                   |
| in-flight requests at the moment measured | 2                       | 0                      |

1. **Network is not the cause.** `flyout` expired its budget with two fetches
   pending; `earthFlyout` stalled with zero in-flight. The
   `pauseIfNetworkFetchesPending` policy (`grantAndAwaitExpiry.ts:43`) is not
   what blocks.
2. **Wedged, not slow.** Raising `BUDGET_EXPIRED_TIMEOUT_MS` to 90 s changed
   nothing.
3. **The page is alive and running on REAL time during a stall.** 2400 rAF
   callbacks in ~20 s (≈120/s) while 166 ms of virtual time never elapsed. On a
   successful grant, page `Date.now()` and `performance.now()` both advance
   exactly the granted 166 ms. **This is the sharpest lead**: in failing runs the
   virtual-time policy appears not to govern the page.
4. Excluded by direct test: in-clip scene cues, `--sim-time` (pinned or not),
   output resolution (270×480 through 960×540), dev-server age (fresh server
   still stalls), leaked browsers (none), Earth tiles (10912 `.webp` present and
   served locally in ms).

## Where to resume

Make the diagnostic mirror `record.ts` byte-for-byte — viewport `size/dpr` (the
recorder's viewport is half what a naive reading suggests), the pre-grant
`__recorderTakeStatus` poll, ffmpeg spawned — then bisect which step turns a
passing run into a stalling one. Finding (3) says look for what makes Chrome drop
the virtual-time policy, not for what blocks a fetch.

`npm run spike-virtual-time` is the standing diagnostic and its run 1 passes, so
the pipeline is healthy for deep-space content; its run 2 fails on a
`networkidle` wait that this app never satisfies, which is a separate defect in
the spike.

## Two gotchas found while investigating

- A `page.evaluate(() => …)` in a `tsx`-run script dies with
  `ReferenceError: __name is not defined` — esbuild's `keepNames` injects a
  helper that does not exist in the page realm. Pass evaluates as strings.
- Piping a long-running recorder command through `tail` hides all output until
  EOF, which reads exactly like a hang. Redirect to a file instead.

## Blocked work

A vertical (9:16) YouTube Short of `earthFlyout`. Composition was proven good at
540×960; the take cannot be completed. The dressing needed to make it publishable
was written and gated (tsc clean, 6048 tests green, cue verified at `atSec: 0`)
but deliberately not committed, since it could never be seen on screen — one
instant cue as the FIRST timeline entry of `earthFlyout.ts`, ahead of any lead-in
`wait`:

```ts
hide(['starCatalogLabel', 'surveyLabel', 'structureLabel', 'milkyWayLabel'], 0),
```

`bodyLabel` stays visible on purpose — Earth/Mercury/Mars are the clip's
narrative anchor and the closing shot's single "Earth" label is the payoff.
