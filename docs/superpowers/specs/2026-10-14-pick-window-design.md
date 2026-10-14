# Pick through a one-pixel window

`pickProgram.pick()` renders every pickable slab into a 1×1 target, through a
projection cropped to the cursor's pixel. The canvas-sized pick textures go.

## Goal

A hover or click pick costs one pixel of colour and depth per slab, not a
canvas-sized texture set, and gives the same answer it gives today.

After #899 every slab already shares one r32uint colour texture and one depth
per format, scissored to the cursor. That is 12 B/px, still 25 MB at 1080p and
100 MB at 4K, held for the session to read one texel per slab. This picks up
`docs/backlog/2026-10-13-pick-targets-canvas-sized.md` (its index line and
detail file are deleted in this change).

## Facts this rests on (verified 2026-10-14 on `187a26e5`)

- There are 17 pick draws: 16 `drawPick` implementations, and the structure-marker
  factory yields two passes.
- 15 of them project only through their `SlabView`:
  - They write `view.vp` or `view.slab.vp` into the shared `CameraUniforms` prefix
    (`writeCameraPrefix`), or compose a per-draw MVP from `view.slab.vp`
    (`composeBodyMvp`, `composeBodySlabMvp`).
  - They expand pixel sizes with `expandBillboardScreen`, which divides by
    `viewportPx` (`shaders/lib/billboard.wesl`).
  - Each packs its own pick-time uniform record from `(view, ctx)`; none reuses a
    frame record.
- **Labels (`labels-cosmo`, and `labels-near` on the overlay slab)** ignore `view`.
  They build canvas-px quads from `cosmoLabelProjection(ctx)` or
  `near0LabelProjection(ctx)`, and map px → NDC with the canvas size
  (`labels/pick.wesl`).
- **Zone of avoidance** has no matrix. It draws a fullscreen NDC quad, builds each
  ray from the `ndc` varying, `tanHalfFovY` and the canvas aspect, and jitters its
  march start with a hash of `@builtin(position)` (`zoneOfAvoidance/band.wesl:43`).
- **Pixel floors and pads are geometry**, in device px:
  - `PICK_PADDING_PX` 4
  - Milky Way minimum size 6.5
  - star minimum radius 3.5
  - famous-star and body radius 9
  - label grace 8

  The CPU gates that use `drawPxPerRad` (star sphere vs point split, glint
  brightness, label em clamp) read the canvas value. None of them needs the target
  to be bigger than the pixel it reads.
- No pick fragment uses derivatives. `spherePick`'s `frag_depth` comes from the MVP's
  z and w, which a crop of x and y leaves alone.
- The star catalog's pick draws last visual frame's GPU cut. The window is a
  subset of that frustum, so nothing it needs was culled.

## The idea

A `PickWindow` names the canvas-px rectangle a pick target covers. The visual
frame and `renderForDebug` use the whole canvas; `pick()` uses the cursor's pixel.
Everything a pick draw needs follows from it:

- **Projection.** `vp' = C · vp`, where C maps the window to clip space and
  touches only the x and y rows. C is composed in f64 on `slab.vp`, then narrowed;
  the f32 `view.vp` is never re-cropped.
- **Viewport.** `viewportPx` becomes the window's size, so a pixel offset added
  after projection lands the same distance away as on the canvas.
- **`pxPerRad` and every gate stay canvas-based.** A window changes what is
  rasterised, never what is pickable.

C for a window at `originPx` of size `sizePx` on a `canvasPx` canvas, with
`s = canvasPx / sizePx` and the window centre `c` in canvas NDC (y up):

```
x' = s.x · (x − c.x · w)
y' = s.y · (y − c.y · w)
```

## Contract

```ts
// src/@types/engine/frame/PickWindow.d.ts
export type PickWindow = {
  /** Top-left corner, canvas device px. */
  readonly originPx: Readonly<Vec2>;
  /** Window size in device px; also the pick target's size. */
  readonly sizePx: Readonly<Vec2>;
};

// src/@types/engine/frame/SlabView.d.ts: one new required field
export type SlabView = {
  // …existing fields: slab.vp and vp are now the windowed projection,
  //    viewportPx === window.sizePx
  /** The canvas rectangle this view rasterises; the whole canvas outside pick(). */
  readonly window: PickWindow;
};

// src/utils/gpu/pickWindowCrop.ts: C as a column-major 4×4, f64
export function pickWindowCrop(window: PickWindow, canvasPx: Readonly<Vec2>): Float64Array;

// src/services/engine/frame/windowedSlabView.ts: the one place a window is applied
export function windowedSlabView(view: SlabView, window: PickWindow, canvasPx: Readonly<Vec2>): SlabView;
```

`slabViewOf` sets `window` to the whole canvas, so visual draws see no change.

## Changes by site

| Site | Change |
|---|---|
| `pickProgram.pick()` | Builds the cursor's 1×1 window. Each group's view goes through `windowedSlabView`. Targets become 1×1, so the copy origin is (0, 0). The scissor from #899 goes away, since a 1×1 target needs none. |
| `pickProgram.renderForDebug()` | Unchanged: whole-canvas window, its own full-size targets. |
| The 15 view-only pick draws | No change. |
| Label pick passes ×2 | Quads stay in canvas px (the declutter layout is canvas-based). `labelPickRenderer.draw` takes `view.window`, translates each rect by `−originPx`, and maps px → NDC with `sizePx`. |
| Zone of avoidance pick | The vertex stage applies C to `out.pos` and keeps the `ndc` varying in canvas NDC. The fragment adds `window.originPx` to `@builtin(position)` before hashing, so the jitter matches the full-canvas pick. C and the origin travel in the ZoA pick uniforms; the visual draw passes the identity window. |

## Precision

`s` reaches 3840. The `x − c.x · w` cancellation happens once, in the f64
matrix. In the shader a vertex's error in target NDC is `s` times larger, but
the target is `s` times smaller, so the error in pixels is unchanged. Composing
C onto the f32 `view.vp` would lose that, which is why `windowedSlabView` starts
from `slab.vp`.

## Memory and cost

| | today (#899) | after |
|---|---|---|
| Pick textures, 1080p | 25 MB | 12 B total |
| Pick textures, 4K | 100 MB | 12 B total |
| Per-pick clears | 3 canvas-sized textures | 3 texels |
| Vertex work | unchanged | unchanged |

## Ground preparation

The audit finds one braid this design removes rather than works around. Labels
and ZoA reach the canvas size through `ctx` while the other 15 pick draws reach it
through their view, so a pick draw has two places to learn where it rasterises.
`SlabView.window` makes the view the one source.

That is the prep step:

- `labels-cosmo` and `labels-near` pick, and the ZoA pick, read the canvas
  rectangle from `view.window`.
- At this step `view.window` is always the whole canvas, so behaviour is
  identical.

It is its own first commit. Separate PR or riding this one is your call, per the
refactor-ground ruling.

## Tests

- `pickWindowCrop`:
  - the window's centre maps to clip (0, 0)
  - the window's corners map to (±w, ±w)
  - a point `k` canvas px from the window centre lands `k` target px from it, which
    is the billboard invariant
- `windowedSlabView`:
  - `viewportPx` equals the window size
  - `vp` is narrowed from the f64 product, not re-cropped f32
  - the whole-canvas window is the identity
- `pickProgram`:
  - `pick()` allocates only 1×1 textures and copies texel (0, 0)
  - every group's view carries the cursor window
  - `renderForDebug()` still gets whole-canvas views
- Label pick: a rect containing the cursor covers target texel (0, 0) after
  translation; a rect one px off does not.
- ZoA pick: the jitter hash input equals the canvas fragcoord.
- **Parity, on a WebGPU device.** A dev-only script samples cursor positions at a few
  poses: cosmic, Sun neighbourhood, Saturn system, Earth surface. At each it compares
  `pick()` against the same texel of `renderForDebug()`'s full rasters. Expected:
  identical, except ties on exact pixel-edge coverage.

## Out of scope

- Debug pick targets outliving the overlay (lazy-allocation backlog item).
- Changing any pick pad or floor value.
- Picking several pixels at once, such as a nearest-hit-within-radius pick.

## Open questions

1. **Packaging the prep.** Should the `view.window` prep step go as its own PR, or
   as the first commit of the feature PR? Recommended: same PR. It's small, and it
   only means something together with the window.
2. **ZoA jitter parity.** Add the window origin so the hash sees canvas fragcoords
   (recommended: exact parity, one uniform), or accept that picks within the
   density mask's noise edge can differ?
3. **Parity script.** Keep it as a committed dev tool (`npm run pick-parity`), or
   run it once by hand for this change? Recommended: once by hand. A standing tool
   is code to maintain for a check that only matters when pick plumbing changes.
