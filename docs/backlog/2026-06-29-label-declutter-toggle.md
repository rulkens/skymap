# Label declutter flickers under camera motion (make it a toggle)

> **Backlog item** · `needs-design` · area: UI & UX
> **Promote to:** a spec when picked up.

## Problem

The label director's greedy screen-space overlap cull (`labelDirectorSubsystem.ts` `declutter`, `DECLUTTER_MARGIN_PX = 48`) suppresses the lower-`prominencePx` of any two anchors landing within 48 px in both x and y. Under a slow orbit (or any sustained camera move) labels repeatedly cross that margin and get suppressed-then-released frame-to-frame, which reads as flicker — distracting on a screen recording, and arguably during normal navigation.

## Current state (verified 2026-06-29)

No setting exists. `declutter(...)` runs unconditionally every frame inside `runFrame` (line 230); there is no `settings.labels.declutter`, and not even the mentioned throwaway `?nodeclutter` URL gate is present. (Consistent with the memory note that `labels.declutterEnabled` is the _next_ feature.)

## Two threads

1. **User setting** to disable declutter — under **Settings → Labels → Advanced** (the Labels section exists; this is a new per-section Advanced toggle, plumbed `settings.labels.declutter` → `labelDirectorSubsystem`).
2. **Stabilise the cull** so on/off decisions hysteresis-damp rather than toggle per-frame (a release margin wider than the suppress margin, or a short cooldown before a suppressed label can re-show) — the proper fix if labels are wanted _on_ during the cosmic-web clip and the tour.
