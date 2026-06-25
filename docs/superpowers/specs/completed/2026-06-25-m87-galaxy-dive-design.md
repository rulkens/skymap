# M87 galaxy dive — durable focus-id clips for tours

**Date:** 2026-06-25
**Status:** Design — awaiting plan
**Builds on:** the clip/tour registries (PR #373), the animation Layer-1 model
(`ClipData`, `compileClip`, `evaluateClip`, `clipPlayer`), and the guided-tour
saga (`guidedTourSaga` → `visitBeatSaga` → `flyToClip`).

## Problem

The `webShowcaseDriver` recording spike ended on a dive: from Virgo's ring the
camera fell to **M87** (Virgo A) while the **Virgo cluster stayed focused**, so
M87 — a member — rode bright against the dimmed sky. When the spike was
converted to a `Tour`, that finale was dropped. The deferral comment named the
two blockers:

1. **No durable galaxy handle.** A galaxy `SelectionRef` is positional
   (`source + index`); it drifts on a tier swap, so a beat could not name M87
   the way it named Virgo (`cluster-virgo-m87`).
2. **No camera-vs-focus decoupling.** Structure-member isolation keys off the
   *focused* slot, and a galaxy focus would cancel it (a galaxy has no radius).
   The dive must move the camera to M87 while the focus stays Virgo.

This design closes both by making tour beats carry **clips authored over durable
focus-ids**, and by expressing the dive as **clip composition** — "fly with
focus" then "fly without focus" — rather than a new per-beat field.

## The interface

### `FocusId` — a branded durable identifier

```ts
// src/@types/animation/FocusId.ts
export type FocusId = string & { readonly __focusId: unique symbol };
```

```ts
// src/utils/animation/focusId.ts  (one function per file)
export function focusId(raw: string): FocusId {
  return raw as FocusId;
}
```

`FocusId` is exactly the string `resolveFocusId()` consumes — `'m87'`,
`'cluster-virgo-m87'`, `'milkyWay'`, `'pgc-…'`, `'sdss-…'`, `'pos@ra,dec'`. The
brand earns its keep only at the authoring surface: `flyToClip(focusId('m87'))`
type-checks; `flyToClip('m87')` is a compile error. `resolveFocusId(id: string,
…)` keeps its plain-`string` parameter — a `FocusId` is assignable to `string`,
and the URL `#focus=` path still hands it raw strings.

### `BeatData` — carries a clip

```ts
export type BeatData = {
  readonly caption: string | null;
  readonly dwellSec: number;
  readonly clip: ClipData;
};
```

A beat is a caption, a dwell time, and a clip. Per-beat `focus`/`frame`/`effects`
are gone: focus lives inside the clip (a `focus()` cue), and scene changes are
either tour-level `setup` (once) or in-clip `scene()` cues (timed).

### `Tour` — gains `setup`

```ts
export type Tour = {
  readonly id: TourId;
  readonly label: string;
  readonly setup?: TourSetup;
  readonly beats: readonly BeatData[];
};
```

```ts
// src/@types/animation/tour/TourSetup.ts
export type TourSetup = { readonly effects: readonly Action[] };
```

`setup.effects` fire once before beat 1 — the establishing scene strip. Broad
`Action[]`. `guidedTourSaga`'s existing snapshot/restore winds them back at tour
end.

### Clip builders

```ts
// src/state/tour/flyToClip.ts
export function flyToClip(id: FocusId): ClipData {
  return {
    start: 'live',
    timeline: [all([moveTargetId(id, FLY_SEC, 'inOut'), dollyToId(id, FLY_SEC, 'inOut')])],
  };
}

// src/state/tour/flyAndFocusOnClip.ts
export function flyAndFocusOnClip(id: FocusId): ClipData {
  return {
    start: 'live',
    timeline: [
      focus(id),
      all([moveTargetId(id, FLY_SEC, 'inOut'), dollyToId(id, FLY_SEC, 'inOut')]),
    ],
  };
}
```

`flyToClip` moves the camera and leaves the selection focus untouched.
`flyAndFocusOnClip` additionally emits a `focus()` cue, so the isolation rides
the clip's own cue stream.

### New effect-helper vocabulary

```ts
// id-bearing camera helpers — resolve target/distance from the FocusId at play time.
export function moveTargetId(id: FocusId, over: number, ease?: Ease): CameraAction;
export function dollyToId(id: FocusId, over: number, ease?: Ease): CameraAction;

// focus cue now speaks FocusId (resolved at play time before updateSelectionFocus).
export function focus(id: FocusId | null): SceneEffect & { kind: 'focus' };
```

`moveTargetId` / `dollyToId` are the id-based counterparts of `moveTarget` /
`dollyTo`. They carry a `FocusId` instead of a concrete `Vec3` / distance; the
value is resolved at play time. `focus()` changes from `SelectionRef | null` to
`FocusId | null`; `focus(null)` clears the focus.

### `resolveFocusId` learns `'milkyWay'`

`resolveFocusId` gains one branch returning `{ type: 'milkyWay' }` for the literal
`'milkyWay'` (today that string falls through to the famous branch and returns
null). `extractSelectionRow` and `focusFraming` already handle the milkyWay ref,
so the camera can frame it. The inverse `focusIdOf` stays null for milkyWay —
deep-linking the Milky Way is a separate, still-deferred concern.

## The dive via composition

No `frame` field. The dive is two beats:

```ts
// webShowcase beats
{ caption: 'The named cosmic web', dwellSec: 4, clip: flyToClip(focusId('milkyWay')) },
{ caption: 'The Virgo Cluster',    dwellSec: 6, clip: flyAndFocusOnClip(focusId('cluster-virgo-m87')) },
{ caption: 'The M87 Galaxy',       dwellSec: 6, clip: flyToClip(focusId('m87')) },
```

Beat 2 sets the isolation focus to Virgo. Beat 3 moves only the camera to M87,
so Virgo's focus **persists** and M87 (a member) stays bright while the rest of
the sky stays dimmed. The scene strip moves to `tour.setup.effects`.

Focus is persistent tour state: a beat changes it only with a `focus()` cue
(`flyAndFocusOnClip` sets it; `flyToClip` leaves it; `focus(null)` clears it).

## The resolution seam

`moveTargetId` / `dollyToId` / `focus(id)` carry a `FocusId`, but a clip's world
position is only known once the data is loaded. Resolution mirrors the existing
`'live'`-start seam (`resolveClipStart`): a **play-time resolve pass** rewrites
the id-bearing actions into concrete `moveTarget` / `dollyTo` / `focus(ref)`
before evaluation, via `resolveFocusId → extractSelectionRow → focusFraming`.
`evaluateClip` stays pure over fully-resolved clips. The `clipPlayer` runs this
pass at play start, where it already has `resolveDeps`.

Because the isolation `focus()` cue fires **inside** the clip, `suspendDuringClip`
parks `watchFocusTweenSaga` (no competing camera tween pulls the camera off the
frame target) while `watchSelectionRowsSaga` still raises the isolation dim —
the path the spike used and the suspend guard's doc already describes.

## `visitBeatSaga` simplification

The beat now carries its clip, so the saga no longer resolves focus or builds a
fly clip. It becomes:

1. `waitUntil` the clip's referenced focus-ids resolve (the readiness gate now
   polls the resolve pass, not `focusReady(beat.focus)`).
2. `playClip(beat.clip)` — awaited, so a mid-flight `advanceTour` doesn't cut it.
3. Show caption.
4. Race dwell timer vs `advanceTour` vs perpetual `dwellDrift`.
5. Clear caption.

## Out of scope

- **The full spike finale choreography** (pan → approach → click → dwell → dive
  → hold → auto-clear, tuned to the spike). This design delivers the *mechanism*
  — durable galaxy framing + camera-vs-focus decoupling — proven on screen via
  the three-beat webShowcase. Finale polish is a follow-up.
- **Milky-Way deep-linking** (`focusIdOf` round-trip). Unchanged; still deferred.
- **Non-settings mid-tour actions.** `scene()` takes the narrow `SettingsAction`
  union; that union widens if a tour ever needs a non-settings cue.

## Testing

- `focusId('m87')` resolves durably to the FamousGalaxy row; `flyToClip('m87')`'s
  resolved clip frames M87 via `focusFraming`.
- A `flyToClip` clip leaves the selection focus untouched; `flyAndFocusOnClip`
  sets it. After beat 2 + beat 3, `selectionRows.focus` is Virgo throughout the
  dive (isolation holds) and the camera ends on M87, not Virgo.
- No `camera.tween` is planted during the dive (the in-clip `focus()` cue is
  suspend-guarded).
- `resolveFocusId('milkyWay', deps)` returns `{ type: 'milkyWay' }`.
- The play-time resolve pass turns id-bearing actions into concrete
  `moveTarget` / `dollyTo` / `focus(ref)`; `evaluateClip` is unchanged.
