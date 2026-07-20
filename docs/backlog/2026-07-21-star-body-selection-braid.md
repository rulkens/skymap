# Field-star body presence is braided to the `select` slot

**Surfaced:** 2026-07-21, smoke-testing PR #468 (star-cut perf) — but pre-existing:
shipped with star+body picking (#45770799, 2026-07-18); none of the involved files
are touched by that PR. Reproduces on production.

## Symptoms (both user-observed)

1. **`#focus=star-<recordIdx>` arrives at an invisible star.** The camera tween is
   correct, but nothing renders where the star is.
2. **Deselecting at close range blinks the star out of existence.** Navigate to a
   star (sphere resolves), deselect → the body disappears, leaving empty space at
   solar-radius distance from a star that is physically still there.

## Root cause — one braid, verified with `file:line`

- `focusedFieldStarSphereLayer.enabled` gates on **`state.selectionRows.select`**
  (`src/services/engine/frame/passes/focusedFieldStarSphereLayer.ts:146-148`) —
  despite its own docblock saying "the currently-**focused** field star".
- The URL-restore saga fills only the **`focus`** slot: `watchRequestFocusSaga`
  dispatches `updateSelectionFocus` (`src/state/selection/selectionSlice.ts:32`);
  `select` stays null → symptom 1.
- `clearSelection` nulls both slots (`selectionSlice.ts:33-36`) → sphere gone on
  deselect → symptom 2.
- In both cases nothing falls back to the point sprite, because the Gaia sprite is
  **distance-retired in-shader** (selection-independent, deliberate — its f32
  `originRelCam + offset·cellScale` reconstruction swims at AU range; see the
  sphere layer's module header, "spec constraint 3").

The knot: _the star's physical presence is complected with selection state_, when
it should depend only on proximity/resolvedness. Selection should decide halos and
InfoCards, never whether a body exists.

## Options

1. **Quick patch (symptom 1 only):** gate the sphere on `select ?? focus`. One
   line + a test; URL-restored stars render. Deselect still blinks the star out.
2. **Real un-braid (both symptoms): presence-by-proximity.** The sphere layer
   derives its row from "the resolved star near the camera" instead of selection —
   e.g. a per-frame nearest-leaf-record query against the octree (cheap: the walk's
   load-time index has `boxOriginPc`; or reuse `resolveStarRecord` on the nearest
   record within `STAR_RESOLVE_PX` range). Selection then only _decorates_ (halo,
   InfoCard). Needs a small design pass: which star wins when two resolve (nearest),
   and hysteresis so the sphere doesn't flicker at the resolve threshold.
3. Do 1 now, 2 as follow-up — the patch is not throwaway (the `?? focus` fallback
   stays correct under option 2's decoration model).

Recommend option 3, with the entanglement-radar note that this is the same
"presence ⇐ selection" class the opacity-0-⇒-no-render rule already guards
against elsewhere.
