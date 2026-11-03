# View centre avoids resting UI (lens shift): design spec

**Status:** design approved in brainstorming 2026-11-02; ground check signed off the same day.
**Origin:** backlog item "View centre avoids the UI (lens shift)" (rulings 2026-10-10), extended by
the 2026-11-02 rulings below. The `100vh` → `100dvh` canvas fix it surfaced shipped separately (#995).

## 1. Intent

On a phone, the focused subject (Earth, say) sits at the middle of the full canvas, and the bottom of the
screen is UI: the tab bar and the collapsed InfoCard sheet. The subject therefore sits low, and its lower
edge runs into the UI. In a desktop exhibit, the subject sits behind the right-hand notes column's edge.
The orbit pivot, the thing you rotate around, should appear in the middle of the sky you can actually see.

## 2. Goals, non-goals, anti-goals

**Goals**

- The subject at the orbit pivot is drawn at the centre of the canvas minus the **resting** UI:
  - phone (non-exhibit): the dock (tab bar) and the collapsed sheet strip;
  - desktop exhibit: the notes sidebar only (the bottom-left title block does not count);
  - phone exhibit: the caption block (title, lede) and the Exit button at the bottom.
- Framing (focus fly-to, exhibit fit, mission camera, home, tours/clips, the follow driver) keeps its
  whole-canvas size, and the subject is centred in the uncovered area (§6: the earlier "fit the uncovered
  area" and "narrower side" rulings were reversed after an eye check).
- When the covered area changes (rotate the phone, enter or leave an exhibit, hide the UI), the shift eases.

**Non-goals**

- **Transient UI does not count** (2026-11-02 ruling): a pulled-open sheet, the Search/Layers/Time sheets,
  the command palette. They may cover the subject; the subject does not move for them. The sheet claims
  its collapsed height even while pulled open.
- Desktop outside exhibits registers no covers in this work (the user's scope was phone and exhibits).
  Adding one later is one hook call on that panel.
- No change to the camera, its target, the orbit pivot, or the canvas size (2026-10-10 ruling).

**Anti-goals** (failure even if it "works")

- A view that stays shifted while the UI is hidden. Faded UI (Tab, the exhibit's eye toggle, splash,
  tour) keeps its DOM size, so a cover must come from "is it showing", not from "does it have a rect".
- Any picture that disagrees with the shift: a ray-marched shell, a pick, a label, or a cursor-anchored
  zoom that still assumes a centred view.
- The shift reaching the dome faces, probe captures, the recorder or the cinema captures (`shot --hide-ui`,
  `capture-*`, `record-*`; all `?cinema`, which mounts no covering UI). A plain `shot` with the UI visible
  should show the shift: that is how the eye checks see it.

## 3. The shift

The main view's frustum keeps its **size** in tangent space (`tanRight − tanLeft` and `tanUp − tanDown` are
those of the symmetric lens) and slides its window so the optical axis passes through the centre of the
uncovered rect. With insets `L, R, T, B` in CSS px on a `W × H` canvas, the axis sits at
`cx = (L − R) / W`, `cy = (B − T) / H` in NDC, and the frustum shifts by `−c · half-extent` on each axis.

Consequences, by construction:

- Navigation rates (radians or world units per pixel) are unchanged: the extents are unchanged.
- Everything that draws or picks through the view-projection (geometry, culling, labels, overlays, GPU
  pick) follows the shift with no change of its own.

The camera runtime builds the main-view frustum once per step (`FrameOutputs.frustum`), and every consumer
reads that one value: `mainViewSpec(sizePx, frustum)` for drawing and picking, and the surface
gesture contexts for cursor rays. Dome faces, cube/probe faces and any future rig build their own
frustums, so the shift cannot reach them. In a non-mono view rig the runtime treats insets as zero.

Per axis, the covered fraction is clamped to ≤ 0.6 (my call), so a sidebar wider than a narrow window
can't push the pivot off-screen.

## 4. Covers: UI → store

- `useViewCover(ref, edge, active, onCover)` measures one element with a ResizeObserver: its reach in CSS px
  from the given canvas edge to the element's inner edge, handed to `onCover`, and `null` when `active`
  turns false or on unmount. The hook is DOM-only; the panel's container dispatches
  `viewCoverSet({ id, cover })` into a small `viewCover` slice (`Record<CoverId, { edge, reachPx }>`; a
  null cover deletes the row). The slice's route is a render-wake route, so a cover change wakes the
  passive scheduler.
- **The phone's bottom cover is one invisible probe, not the sheet itself** (builder check): the sheet
  peeks by a transform, which a ResizeObserver can't see, and opening Layers unmounts the InfoCard sheet.
  BottomStack renders a fixed, empty probe element at the bottom edge, `var(--dock-height)` tall, plus
  `var(--mobile-sheet-peek)` while a selection sheet rests (`restingSheet`, which is
  `selectionKey !== null`). That stays true while Layers is open or the sheet is pulled up. Opening the
  Time row does not change it.
- "Showing" is decided by the panel's owner:
  - phone dock and sheet: not `selectUiStackHidden` (prep 4);
  - exhibit sidebar and caption: not the exhibit's own eye-toggle `hidden`.
  Cinema mode never mounts the HUD or the exhibit overlay, so it registers nothing.
- `selectViewCoverPx` combines the rows into insets `{ top, right, bottom, left }` in CSS px, taking the
  **maximum per edge**. Reaches are measured from the edge, so the stacked dock plus sheet combine without
  double-counting.
- Covers in this work: `phoneBottom` (the probe), `exhibitNotes` (the desktop notes column, right edge) and
  `exhibitCaption` (the phone caption block, bottom edge, which reaches past the Exit pill to the screen
  edge).

## 5. Store → camera runtime → views

- `stepCameraRuntime` takes `coverPx` (from the frame's one store snapshot) beside `canvasPx`.
- The runtime keeps the eased shift as its own memory (current `shiftNdc`) and steps it toward the target
  each frame: an exponential approach, τ = 80 ms (about 95% in 250 ms; my call). It requests renders until
  settled. It eases in NDC, so a resize mid-ease stays smooth, and the step is a pure function, which keeps
  the recorder deterministic.
- `FrameOutputs` carries `frustum`, shifted by the eased value.
- `runFrame` and `pickFrameContext` both pass `outputs.frustum` to `mainViewSpec`, so draw and pick always
  agree.

## 6. Size from the whole canvas; covers only shift

Framing sizes every subject against the **whole canvas** (the lens `fovYRad`/`aspect`, as before this
work), never the covers, and the
covers only move where the subject sits (owner, 2026-11-02, option A). Covers register after boot
framing and deep links run, so a covered fit gave the same subject a different size depending on timing:
boot home at the old size, a later Home press about 7% smaller. That was ruled not acceptable. A re-fit when
covers arrive (option B) would make Earth visibly zoom after load, and would need a covers-settled
signal. With the 0.4 body fill, a whole-canvas fit still sits well inside the uncovered sky (about 48% of
it on a phone).

## 7. Ground preparation

Ran `refactor-ground` 2026-11-02, with a greenfield cross-check by a fresh subagent. There is no
compatibility tension: nothing involved is persisted, baked or read externally. All four prep commits leave
every number unchanged on today's symmetric view. They ship as **one prep PR, before the feature PR**
(ruling).

1. **Shell renderers read the view's four tangents.** `horizonShellRenderer.ts:154`,
   `zoneOfAvoidanceRenderer.ts:166` (and its pick packing) and `lightTimeSpheresRenderer.ts:105` stop
   rebuilding a centred ray from `tan(cam.fovYRad / 2)` and the aspect. Their uniforms keep their
   size: the forward slot becomes `rayAxis` (forward tilted to the window centre, `frustumRayAxis`) and the
   two scalars become `tanHalfY`/`tanHalfX`. `sphereNdcBounds` takes the tangent window `(tanLo, tanHi)`. This closes backlog item
   `2026-09-22-off-axis-fovy-reconstruction`: the greenfield shape (the camera keeps fovY as its lens, and
   ray builders read the view's frustum) replaces that item's "four tangents on `OrbitCamera`" fix, which
   would have touched 39 readers in 31 files.
2. **The camera runtime owns the main-view frustum, and the cursor ray reads it.** `FrameOutputs.frustum`
   (symmetric in prep) feeds `mainViewSpec(sizePx, frustum)` and the surface gesture contexts.
   `cursorRayBodyLocal(pose, pixel, viewportPx, frustum)` maps NDC through the frustum, for 5 callers.
   `surfaceZoomStep.ts:53`'s cursorless anchor becomes the optical-centre pixel of that frustum.
3. ~~**Framing takes one framing window.**~~ Built, then reverted on the prep branch once framing was ruled
   to size from the whole canvas (§6): the window would only ever carry the lens.
4. **The HUD-stack hidden rule becomes a selector.** `App.tsx:90`'s inline
   `uiHidden || splashVisible || tourActive || exhibitId !== null` becomes `selectUiStackHidden`, so the
   phone covers share it instead of copying it.

After the prep, the feature is growth: the `viewCover` slice, its selector and one `WAKE_ROUTES` row; the
`useViewCover` hook at four panels; and `coverPx` in, plus a shifted `frustum` out, of the camera runtime.

## 8. Testing and checks

- Prep: each commit's existing tests stay green unchanged. One new test per joint pins the identity on a
  symmetric frustum (shell uniforms, cursor ray).
- Feature: unit tests for the shift maths (insets → `shiftNdc`; per-edge max; zero when no rows) and the
  easing step. An interaction test shows a hidden panel clears its cover.
- Eye checks (before/after per link, on the phone via `npm run phone` for the phone rows):
  `#focus=body-earth` on a phone; `#exhibit=solarSystem` on desktop 1600×900 and on a phone;
  `#focus=body-earth` with the sheet pulled open (Earth stays put); Tab-hidden UI (re-centred);
  a cosmic-horizon or zone-of-avoidance view on a phone (shell aligned with the grid and labels);
  a pinch on Earth's surface (anchors under the fingers).

## 9. Risks and what's left to the builder

- **Risk: hidden-but-measured UI.** Covered by "showing" being owned by each panel (§4). The interaction
  test pins it.
- **Risk: first-frame jump** while ResizeObservers report. The runtime starts at the first target with no
  ease, then eases.
- **Decided while the owner was away, then reviewed one by one (2026-11-02):** the probe and the clamp
  were kept; the late-cover call became moot under §6.
  - **No re-fit when covers arrive late** (builder check Q1), now moot: sizing ignores covers (§6).
  - **The 0.6 covered-fraction clamp** (Q2): the landscape phone exhibit caption can cover about half the
    height. The clamp bounds the worst case with one constant.
  - **The phone probe** (§4) replaces measuring the sheet.
- **Builder's call:** the exact damping constant; the `CoverId` names; where `useViewCover` lives
  (`src/hooks/`); the test split.
