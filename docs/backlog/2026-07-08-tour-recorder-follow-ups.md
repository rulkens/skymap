# Tour-recorder follow-ups

Small improvements deferred from the tour-recorder branch's final review
(spec: `docs/superpowers/specs/completed/2026-07-07-tour-recorder-design.md`
once shipped). None affect the correctness of a take; all were triaged
backlog-not-blocking by the whole-branch review.

- **Observable-driven settle discard.** The windowed-take settle is a shared
  constant (`FOLD_SETTLE_MS`) with a positional assumption — the saga's delay
  must stay the first virtual-time consumer of a windowed run; documented at
  all three sites but not enforced. Replacing the precomputed discard count
  with an in-page "bridges settled / first beat entered" observable on the
  recorder status flag would delete the coupling. New hook surface — do it
  when the coupling first bites, not before. Related cosmetic off-by-one: the
  settle timer fires during the last discarded grant, so a windowed take's
  first captured frame is ~1 grant into the enter clip.
- **Make the App.cinema StatusBar assertion real.** The cinema test's
  `[role="alert"]/[role="status"]` absence check is tautological (StatusBar
  self-nulls at `initializing`); seed the store with an error status so the
  assertion would fail if StatusBar were wrongly mounted.
  (`tests/components/App/App.cinema.test.tsx`)
- **Spike `Math.max(...crossDiffs)` spread → reduce.** Stack-overflows only at
  ~100k+ `--frames`, far beyond diagnostic use; one-liner next time the file
  is touched. (`tools/record/virtualTimeSpike.ts`)
