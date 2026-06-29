# Reusable structure-visit tour clip

> **Backlog item** · `needs-design` · area: UI & UX (tour/animation)
> **Promote to:** a spec when picked up (memory `project_debug_panel_clip_triggers`).

## Problem

The guided tour shipped through the animation clips + saga system (clip data model + `playClip` seam + tour saga, #364/#366/#367; clip/tour registries + M87 dive, #373; caption + nav overlay + keyboard saga, #375). What remains is a **reusable per-structure visit clip**: today the tour beats are hardcoded to specific structures (Virgo/M87). Generalize them into a parameterized `structureVisitClip` so any featured structure can be visited.

## Current state (verified 2026-06-29)

The **focus-isolation primitive already shipped**:

- `SceneEffect` `focus` arm drives structure-isolation dim (the `focusRecession` channel) — `src/@types/animation/SceneEffect.ts`.
- `FocusBoundEffect` + `focusId()` resolve durable structure ids at playback — `src/@types/animation/FocusBoundEffect.ts`, `src/utils/animation/focusId.ts`.
- The `webShowcase` tour already isolates the Virgo Cluster (`flyAndFocusOnClip(focusId(...))`, `suspendDuringClip`) — `src/data/animation/tours/webShowcase.ts`.

But `ClipId` is a closed union of three hand-authored clips (`'cosmicFlows' | 'flyout' | 'flowOrbit'`, `src/@types/animation/ClipId.ts:13`; `clipRegistry.ts`), and `webShowcase.ts` hardcodes the Virgo/M87 beats. There is **no** generic "visit any featured structure" clip factory.

## Direction

A `structureVisitClip(structureId)` factory that composes the existing focus-isolation + fly-and-focus primitives into a parameterized clip — so a tour (or a debug trigger) can visit any cluster/SC/void/group by id.

## Related

The capture/restore → ephemeral-Intent-overlay rebuild (under the intent-migration item) is the deeper substrate change that tours will eventually ride on.
