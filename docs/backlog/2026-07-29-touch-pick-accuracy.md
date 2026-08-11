# Touch picking selects the wrong galaxy

Reported on iOS (2026-07-29): tapping a galaxy selects a neighbour, not the one
under the finger. Not reproduced on desktop, where the same scene picks
correctly.

## The pick target shrinks on retina, in CSS terms

`PICK_PADDING_PX = 4` (`src/data/pickPaddingPx.ts`) and the `pointSizePx` dot
floor are both in **device pixels**, not CSS pixels. The billboard expansion
runs through `expandBillboardScreen(u.cam, center, sizePx, corner)`
(`shaders/galaxyCatalog/points/vertex.wesl:179`), whose `u.cam.viewportPx` is
`[ctx.canvasSize.width, ctx.canvasSize.height]` (`frame/slabs.ts:220`) — the
canvas backing store, i.e. CSS size × `min(devicePixelRatio, 2)`.

So the clickable disc a user can actually aim at is:

| display        | DPR used | pick disc in device px | pick disc in CSS px |
| -------------- | -------- | ---------------------- | ------------------- |
| 1× desktop     | 1        | ~9                     | ~9                  |
| retina / phone | 2        | ~9                     | **~4.5**            |

The target halves on exactly the device whose pointer is least precise. A
fingertip contact patch is tens of CSS pixels wide and the browser reports its
centroid, so on a dense field the centroid routinely lands on a neighbouring
galaxy's texel. Desktop hides this: a mouse hotspot is one pixel, and hover
feedback lets the user correct before clicking. Touch has neither.

## The coordinate path itself looks right

Checked and ruled out as the primary cause:

- `cssToTexPx` (`services/engine/helpers/cssToTexPx.ts:28`) caps DPR at 2, and
  `resizeCanvasToDisplay` (`services/gpu/device.ts:165`) caps it identically.
  The two agree, which is what the former's header requires.
- `pickProgram.pick` clamps the texel to `[0, w-1] × [0, h-1]`
  (`frame/pickProgram.ts:257`), so a stale-resize coordinate cannot read out of
  bounds.
- `Math.floor(clientWidth * dpr)` vs an unfloored `cssPx * dpr` can disagree by
  at most one texel at the far edge — real, but far too small to explain
  selecting a different galaxy.

Not yet checked: whether `clientX`/`clientY` need a `getBoundingClientRect()`
offset on iOS when the visual viewport is offset from the layout viewport
(pinch-zoom, the keyboard accessory bar, rubber-band overscroll). If the canvas
is not at the layout origin under those conditions, every pick is displaced by a
constant, which would look exactly like this. Worth confirming before designing
a fix — it is a different bug with a different remedy.

## Approach options

1. **Scale the pick padding by DPR.** `PICK_PADDING_PX * dpr` restores parity
   with the 1× desktop target. Smallest diff, and it only corrects the
   regression — it does not make touch _good_, since 9 CSS px is still under
   the ~44 px platform guidance for touch targets.
2. **A pointer-type-aware padding.** A coarse pointer
   (`matchMedia('(pointer: coarse)')`) gets a larger pad than a fine one. Keeps
   the desktop target unchanged while giving touch a real one. Needs a decision
   about where that lives — the constant is a pure data module today
   specifically so `pickUniformBytesOf` can read it without importing a
   renderer, and a media query is not pure data.
3. **Read a small neighbourhood and take the nearest hit.** Copy an N×N texel
   block instead of one texel and fold to the closest non-zero. Correct for any
   pointer type and independent of the padding constant, but it changes
   `copyTextureToBuffer`'s footprint, the 256-byte staging buffer, and the
   `frontmostPick` fold — the largest of the three.

Options 1 and 3 compose; 2 substitutes for 1.

## Files

- `src/data/pickPaddingPx.ts` — the constant, and the doc comment that three
  shaders point back to.
- `src/services/engine/helpers/pickUniformBytesOf.ts`,
  `src/utils/gpu/packPointUniforms.ts` — where the padding is applied.
- `src/services/gpu/shaders/structureMarker/ringPick.wesl`,
  `src/services/gpu/shaders/milkyWay/pick/{vertex,io}.wesl` — bake the same
  padding into their own floors; any change here has to reach them too.
- `src/services/engine/frame/pickProgram.ts:244-302` — the texel read, for
  option 3.
