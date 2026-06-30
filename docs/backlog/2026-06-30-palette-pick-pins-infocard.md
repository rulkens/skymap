# Palette pick (and deep-link) should pin the InfoCard

> **Backlog item** · `ready` · area: UI & UX
> **Promote to:** straight to a small implementation — design is settled (below).

## Problem

Selecting an object from the command palette flies the camera to it but does
**not** show the pinned InfoCard. A scene click pins the card; a palette pick
does not. Same gap for URL deep-links (`#focus=<id>`).

## Root cause (verified 2026-06-30)

Selection has three independent slots — `hover`, `select`, `focus`:

| Slot     | Means                          | Set by                                                |
| -------- | ------------------------------ | ----------------------------------------------------- |
| `select` | what's pinned in the InfoCard  | scene click → `updateSelectionSelect`                 |
| `focus`  | what the camera frames         | "Focus" pill, deep-link, palette → `updateSelectionFocus` |

The InfoCard's pinned card reads `selectSelectedFocusable` (the `select` slot).
The palette goes through `requestFocus(focusId)` → `watchRequestFocusSaga` →
`updateSelectionFocus(ref)`, which sets only `focus`. So it navigates but never
pins. `requestFocus` has exactly two callers: the palette
(`CommandPaletteContainer`) and the deep-link drain (`useUrlSync`).

## Direction (settled)

Add a `requestSelect` command mirroring `requestFocus` — a reducer-less
`createAction<string>('selection/requestSelect')` whose saga resolves the
durable id to a ref (deferring on `catalogLoaded`) and dispatches
`updateSelectionSelect(ref)`. Each command stays single-purpose (one command,
one slot); the **caller composes** when it wants both. This mirrors the
existing per-slot symmetry in `selectionWriteBySlot`.

- **Share the resolution loop.** `watchRequestFocusSaga` and
  `watchRequestSelectSaga` differ only in the final `put`. Extract the
  resolve-and-defer-on-`catalogLoaded` loop into one saga helper
  (`resolveDeferring(id)`) both call, so the command→ref bridge stays in one
  place.
- **Palette composes both** in `CommandPaletteContainer.onSelect`:
  `dispatch(requestSelect(focusId))` (pin) + `dispatch(requestFocus(focusId))`
  (fly). The palette's `onSelect(focusId)` interface is unchanged.
- **Deep-links also pin.** `useUrlSync` dispatches both too, so arriving at an
  object by URL looks the same as arriving by palette. (Open to revisiting if a
  camera-only deep-link is ever wanted — the split commands make that trivial.)

Rejected alternatives: making `requestFocus` set both slots (a command that
secretly does two things); having the palette resolve the ref itself (violates
"React never resolves ids" + can't defer on `catalogLoaded`).
