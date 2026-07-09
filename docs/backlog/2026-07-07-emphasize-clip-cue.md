# `emphasize()` / `deemphasize()` clip cues — per-structure spotlight lift

`ready` · designed 2026-07-07 while planning the staggered group highlights for
the grand tour's neighbourhood-reveal beat (design settled in-conversation;
this file is the record).

## Problem

The tour wants a staggered spotlight over the Local Volume groups: dim all
group rings/labels, then pop them to full one at a time (and back), with
authorable overlap. No current primitive reaches ONE structure:

- `fade(...)` cues drive the clip-opacity channel per `VisibilityLayerKey` —
  whole-layer grain (`'structureRing'` = every ring at once).
- `FadeId`'s structure grain is per-_category_ (`{kind:'structure', id:'group'}`
  is one controller for all groups), not per-structure.
- Serial `focus()` staggers natively but (a) the recession exemption is a
  boolean per id, so an A→B handoff _snaps_ ring/label alphas (blend stays 1,
  only the exempt id flips — the label-director envelope can't help because the
  labels stay emitted, only their factor changes), and (b) focusing a group
  fires the member-isolation galaxy fade, strobing the survey field on every
  handoff.

## Design (settled)

**Dim = the existing `fade` cue. Lift = a new per-structure `emphasize`
channel. They compose by lerp-toward-1, never multiply.**

- `emphasize(id, over?)` / `deemphasize(id, over?)` — `FocusId`-addressed like
  `focus()`, resolved to the structure id string. New `SceneEffect` arm
  (`{ kind: 'emphasize', structureId, to: 0 | 1, over }`), constructed only in
  `effectHelpers.ts`. Default ramp 0.4 s.
- Channel: per-structure-id fade controllers, clip-scoped, `reset()` at clip
  end/stop — exactly `clipOpacityChannel`'s shape keyed by structure id with
  rest value 0. Extract ONE generic keyed-fade channel and instantiate both
  (second identical channel = the consolidation trigger). Closed-form ramps
  from the frame clock (`ctx.nowMs` / last-tick default) — deterministic under
  the stepped recorder clock.
- Producers (`produceStructureMarkers`, `produceStructureLabels`) compose the
  lift over the DIMMING factors only, never the visibility gate:

  ```
  final = catOpacity × lerp(recession × clipFactor, 1, factorOf(p.id))
  ```

  So `emphasize` undoes any scene dimming (clip fade, focus recession) but a
  structure in a hidden/toggled-off category stays hidden — emphasize can undo
  dimming, never reveal.

- No `ctx.focusBlend` change, no `focusRecession` change, no member-isolation
  interaction — emphasize doesn't know why the scene is dim.

Authoring shape for the beat (rides the dwell's `all`):

```ts
seq([
  fade(['structureRing', 'structureLabel'], 0.25, 1),
  wait(1),
  emphasize(M81),
  wait(3),
  deemphasize(M81),
  emphasize(CEN_A),
  wait(3),
  deemphasize(CEN_A),
  emphasize(SCULPTOR),
  wait(3),
  deemphasize(SCULPTOR),
  fade(['structureRing', 'structureLabel'], 1, 1),
]);
```

Accumulating reveals (skip the deemphasize) and overlapped envelopes (one
`seq` per group) fall out of the same two verbs — staggering lives in the
timeline, not the channel.

## Rejected alternatives (and why)

1. **Single-subject `set(id)` channel** (spotlight handoff owned by the
   channel) — kills authored overlap/accumulation; multi-subject impossible.
2. **Blend-driving emphasize** (channel feeds `ctx.focusBlend` so emphasis
   dims siblings itself) — self-contained but braids dim+lift into one verb,
   drags filaments/volumes recession along, and duplicates what `fade`
   already does.
3. **Per-structure `fade` (a "fadeId version of fade")** — fade multiplies and
   multiplication only dims: a per-structure fade-to-1 under a 0.25 layer fade
   still renders 0.25. Spotlighting via pure fades means enumerate-and-dim
   every sibling individually — brittle (a new group in the seed arrives
   undimmed and silently breaks the shot). Giving `fade` override semantics
   for scoped keys = two composition rules in one verb.

## Pointers

- `src/services/animation/clipOpacityChannel.ts` — the channel shape to
  generalize (keyed controllers, `lastTickNowMs` default, reset-on-clip-end).
- `src/services/engine/subsystems/clipPlayer.ts` — `fireCue` 'fade' branch is
  the wiring precedent; reset sites in `resetState`/`stop`/`destroy`.
- `src/@types/animation/SceneEffect.ts` — the cue union; `effectHelpers.ts`
  `focus()` for the `FocusId` addressing + resolution pattern.
- `src/services/engine/presentation/produceStructureMarkers.ts` (~line 140)
  and `produceStructureLabels.ts` (~line 165) — the recession composition the
  lerp slots into.
- First consumer: staggered group highlights in
  `src/data/animation/tours/grandTour/neighbourhoodReveal.ts` (beat 04).
