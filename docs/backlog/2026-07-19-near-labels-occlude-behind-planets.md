# Near labels should disappear behind planets (like cosmo labels do)

**Priority: HIGH** (user-flagged 2026-07-19).

## Problem

At solar-system zoom, the NEAR0 captions (Sun/planet/star labels + leader lines)
draw on top of foreground bodies: a label whose anchor is behind a planet stays
fully visible, floating over the disc. The cosmological labels behave correctly —
they vanish when a planet covers them — and the near labels should match.

## Verified current state

Neither label path uses a depth test; the difference is pure frame-program draw
order relative to the opaque-body composite:

- Both paths share the same depthless renderers — `labelRenderer.ts:304-305` and
  `markerLineRenderer.ts:215-216` explicitly omit `depthStencil` ("labels are a
  pure UI overlay") — and both draw into the depthless `swap` target
  (`src/services/gpu/renderTargets.ts:152`, `depth: null`). The only depth-bearing
  target is `foreground:0` (`renderTargets.ts:151`), where the opaque bodies draw
  (`src/services/engine/frame/executeFrame.ts:52,124-132`).
- Frame order (`src/services/engine/frame/frameProgram.ts:59-99`):
  1. `render swap · COSMO` (line 87) — cosmo labels/connectors drawn here.
  2. `render foreground:0 · NEAR0` (line 96) — bodies drawn with real depth.
  3. `composite foreground:0 → swap` (line 97) — bodies paint OVER the swap
     chain, covering the already-drawn cosmo labels. This is the whole "cosmo
     labels occlude" mechanism — paint-over, not depth.
  4. `render swap · NEAR0` (line 98) — near captions drawn AFTER the composite,
     so they land on top of the bodies.
- The ordering is deliberate: `frameProgram.ts:21-31` ("captions over bodies,
  bodies over cosmological labels") — a planet's own caption must not be
  swallowed by its own disc. The layers: `passes/labelsLayer.ts:46` +
  `passes/markerLinesLayer.ts:45` (COSMO) vs `passes/foregroundLabelsLayer.ts:273`
  (NEAR0, second instance of the same renderers).

## Why the naive fix is wrong

Moving step 4 before step 3 makes near labels occlude — but then a caption
anchored on/near a body's disc (the common case: the planet's own label) is
painted over by its own body, and every caption for a body in front of another
body vanishes entirely. The current order exists precisely to avoid that.

## Options

1. **Per-label CPU visibility cull (likely simplest).** In the label
   director / foregroundLabelsLayer per-frame prep, test each caption's 3D anchor
   against the scene bodies' sphere discs along the camera ray (anchor behind a
   nearer body's disc → drop or fade the label). Whole-label semantics match how
   cosmo labels read visually ("the label disappears"), avoids per-pixel slicing
   of screen-space quads, and touches no pipelines. Bodies are few (~10), labels
   are few — cost is trivial. A label for the occluding body itself stays visible
   (its anchor is on the near surface / not behind its own disc — needs the
   anchor-radius care).
2. **Real depth test against `foreground:0`.** Draw the NEAR0 captions inside the
   `foreground:0` pass with `depthCompare` on (write off), anchor depth per label.
   Per-pixel correct (partial occlusion at the limb), but slices quads mid-glyph,
   requires the label pipelines to gain a depthStencil variant + a pass move, and
   reopens the clip-z-clamp coupling documented at
   `passes/foregroundLabelsLayer.ts:117-132` and the star-slab item
   (`docs/backlog.md` "Star field → own slab").
3. **Reorder + carve-out** — draw near captions pre-composite except the focused
   body's. Fragile special-casing; listed for completeness.

Option 1 composes cleanly with the existing declutter/fade machinery (fade the
label out via its opacity rather than a hard pop). Option 2 is the "proper"
renderer answer if partial occlusion ever matters (a label peeking out from
behind a limb).

## Related

- `docs/backlog/2026-07-13-star-field-own-slab.md` — the STARS-slab restructure
  touches the same clip-z clamps; option 2 would want to land after it.
