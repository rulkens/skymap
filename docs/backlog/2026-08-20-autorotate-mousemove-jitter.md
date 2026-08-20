# Autorotate + mouse-move jitter

**Status:** needs-repro · low priority
**Reported:** 2026-08-20, during `refactor/debug-derivation` (rung 6) smoke — slight
frame jitter with autorotate on while wiggling the mouse. Intermittent: not
reliably reproducible on that branch, and the user could not reliably
reproduce it on `main` either on a follow-up check.

## Investigation verdict (diff-clean)

A read-only investigation (`.superpowers/sdd/2026-08-20-debug-derivation/smoke-jitter-investigation.md`,
branch HEAD `a05e7d875` vs base `0b4ce84c0`) found **no mechanism in the
diff**. Key exclusions:

- `selectDebugOverlays` is a plain passthrough selector (same reference-stable
  shape as the three booleans it replaced) — no per-call allocation.
- Nothing on the mouse-move/autorotate path dispatches Redux at all; camera
  orbit state bypasses the store entirely, so `overlays` never churns from
  pointer input.
- The three re-keyed per-frame read sites are control-flow-identical to base
  (one extra property hop, no new branch/allocation).

Verdict: pre-existing-or-environmental, not caused by this branch. Not a
blocker — merge unhalted.

## Falsification recipe

Chrome DevTools Performance trace of the same wiggle-with-autorotate gesture,
**DevTools closed** on a fresh reload, run against base commit `0b4ce84c0`
served from a second worktree. If the jitter reproduces there too, it's
environmental (two dev servers/GPU contexts, HMR backlog, or a `public/data`
symlink mismatch between checkouts) rather than a code regression.
