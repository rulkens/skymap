# Famous-galaxy thumbnail calibration — Plan 3: curator UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a disk-geometry overlay to the curator's crop canvas — centre / major-axis edge / minor-axis handles — plus a per-galaxy deproject toggle and an as-shot ⇄ deprojected preview, so the maintainer captures `RecipeDisk` and ships it via export.

**Architecture:** A new interaction layer drawn over the existing `CropCanvas`, decoupled from the crop (its handles live in source-image pixel space, independent of the crop rect). Reducer state gains a `disk` slice. The deproject preview reuses the existing process/preview round-trip. Export sends `disk` (Plan 2 Task 1 already accepts it).

**Tech Stack:** React + useReducer, the existing curator UI (`tools/famous-curator/ui`), vitest + the reducer's no-mount test pattern.

**Depends on:** Plan 1 (`RecipeDisk`, `DEPROJECT_MIN_AXIS_RATIO`), Plan 2 (export accepts `disk`).

---

## Reality reconciliation (the plan's file map was partly stale — corrections below override the task bodies)

The curator UI was mapped before execution. Corrections, applied across all tasks:

- **Pure-geometry precedent is `tools/famous-curator/ui/cropMath.ts`** (not the nonexistent `cropGeometry.ts`). The new pure module is `tools/famous-curator/ui/diskOverlay.ts`, mirroring `cropMath.ts` (no React/DOM imports).
- **No curator reducer test exists yet.** Task 1 **creates** `tests/tools/famous-curator/ui/state.test.ts` (curator UI tests live under `tests/tools/famous-curator/ui/`), it does not "extend" one. The `diskOverlay` test is `tests/tools/famous-curator/ui/diskOverlay.test.ts`.
- **Component split (honours the component skill — overrides "modify CropCanvas"):** the overlay is a NEW `components/DiskOverlay.tsx` rendered by `CropCanvas.tsx` as a sibling layer inside its positioned container (CropCanvas grows by ~3 lines; all disk rendering + pointer handling lives in DiskOverlay). The deproject toggle is a NEW `components/DiskControls.tsx` fieldset, NOT added to `ParamSliders.tsx`. Crop and disk stay independent via separate hit-target DOM elements (each handle `stopPropagation`s its own pointerdown).
- **Coordinate transform to reuse:** `CropCanvas.tsx` renders an `<img>` with the crop as a CSS-positioned `<div>`; the screen→source transform is `canvasScale = imgRect.width / source.width` (see CropCanvas `startDrag`). DiskOverlay reuses exactly this.
- **State gains a `disk` dirty flag** (`DirtyFlags.disk`), set on `setDisk`/`clearDisk`, cleared on `markProcessed`/`selectGalaxy`/`setSource`, and included in `App.tsx` `onCommit`'s `needsProcess`. Without it a disk/deproject change after a Process wouldn't re-bake the webp before export → stale output. (Intentional extension beyond Task 1's literal contract.)
- **Deproject-preview gap (Task 4):** Plan 2 added deprojection to the EXPORT route only (`routes/export.ts`), NOT the process route. So a server-rendered deprojected PREVIEW requires `routes/process.ts` to also deproject when `disk.deproject` (reusing `willDeproject` + `deprojectDisk`, same frame logic as export), plus `disk` threaded onto `ProcessParams` (`api.ts`) and the process body. Task 4 owns this.

---

## Task 1: Disk slice in the reducer

**Files:**
- Modify: `tools/famous-curator/ui/state.ts`
- Test: `tests/tools/famous-curator/state.test.ts` (existing — extend)

**Contract:** add to `State`:

```ts
disk: RecipeDisk | undefined;   // source-px disk geometry; undefined = not drawn
```

New actions: `{ type: 'setDisk'; disk: RecipeDisk }` and `{ type: 'clearDisk' }`. `selectGalaxy` resets `disk` to `undefined` (mirrors how it wipes crop at `state.ts:83-95`). A curated galaxy's `disk` is re-hydrated from its recipe in App.tsx's resume flow (same place crop is restored). Seed `deproject` from the catalog b/a vs `DEPROJECT_MIN_AXIS_RATIO` when a disk is first created.

- [x] **Step 1: Write the failing tests** — `setDisk stores the disk geometry`; `clearDisk resets disk to undefined`; `selectGalaxy clears disk`. _(extended existing `tests/tools/famous-curator/ui/state.test.ts`; added `markProcessed clears disk dirty`)_
- [x] **Step 2:** `npm test -- state` → FAIL.
- [x] **Step 3:** Add the field (default `undefined` in `initialState`), the two action variants, and the reducer cases. Follow the existing crop-action shape at `state.ts:115-121`. _(also added `DirtyFlags.disk` so a disk change re-Processes before export)_
- [x] **Step 4:** `npm test -- state` → PASS (12 tests).
- [x] **Step 5: Commit** `4814e9c8`

```bash
git add tools/famous-curator/ui/state.ts tests/tools/famous-curator/state.test.ts
git commit -m "feat(curator): disk-geometry slice in reducer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Disk-overlay interaction helper (pure geometry)

**Files:**
- Create: `tools/famous-curator/ui/diskOverlay.ts`
- Test: `tests/tools/famous-curator/diskOverlay.test.ts`

**Contract:** pure helpers the canvas component uses, kept separate so they unit-test without mounting (mirrors `cropMath.ts`):

```ts
// Build/update a RecipeDisk from a centre->edge drag, all in source px.
export function diskFromDrag(centerPx: Vec2, edgePx: Vec2): { centerPx: Vec2; radiusPx: number; paDeg: number };
// Minor-axis handle endpoint in source px for a given disk + axisRatio (for rendering the pre-filled perpendicular handle).
export function minorAxisHandle(disk: RecipeDisk, axisRatio: number): Vec2;
// axisRatio implied by dragging the minor handle to a point.
export function axisRatioFromMinorDrag(disk: RecipeDisk, pointPx: Vec2): number;
```

- [x] **Step 1: Write the failing tests** — `diskFromDrag computes radius and PA from a horizontal drag` (PA = 0 in this convention); `diskFromDrag PA is in [0,180)`; `minorAxisHandle is perpendicular to the major axis`; `axisRatioFromMinorDrag inverts minorAxisHandle` (round-trip within tolerance). _(5 tests)_
- [x] **Step 2:** `npm test -- diskOverlay` → FAIL.
- [x] **Step 3:** Implement with `Vec2` math. PA convention documented in the file header + spot-checked against `deprojectDisk` (the load-bearing anchor): `paDeg` = major-axis angle from +X toward +Y, [0,180); `majorUnit=[cos,sin]`, `minorUnit=[-sin,cos]`. Pure (no DOM).
- [x] **Step 4:** `npm test -- diskOverlay` → PASS.
- [x] **Step 5: Commit** `b295aa96`

```bash
git add tools/famous-curator/ui/diskOverlay.ts tests/tools/famous-curator/diskOverlay.test.ts
git commit -m "feat(curator): pure disk-overlay geometry helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Render the disk overlay on CropCanvas

**Files:**
- Modify: `tools/famous-curator/ui/components/CropCanvas.tsx`
- Test: covered by Task 2 (pure geometry) + manual visual check (curator is a dev tool)

**Behaviour:** draw the disk overlay (centre dot, major-axis line to the edge handle, perpendicular minor-axis handle pre-filled from catalog b/a) on top of the existing crop rect, using the source→canvas transform the crop already uses. Dragging the centre moves `centerPx`; dragging the edge updates radius+PA via `diskFromDrag`; dragging the minor handle updates `axisRatio` via `axisRatioFromMinorDrag`. Each drag dispatches `setDisk`. The crop handles remain fully independent — editing one must not move the other (spec decision 1).

- [x] **Step 1:** Add the overlay rendering + pointer handlers, reusing `CropCanvas.tsx`'s existing pointer-capture drag pattern and source↔canvas coordinate transform. Dispatch `setDisk` on change. _(own `components/DiskOverlay.tsx`; mode toggle locks crop in disk mode; catalog b/a pre-fill threaded through `/api/galaxies`)_
- [x] **Step 2:** `npm run typecheck` → PASS (rc=0).
- [ ] **Step 3:** Manual check (curator dev server): drawing/adjusting the disk does not move the crop, and vice versa. _(VISUAL — pending user)_
- [x] **Step 4: Commit** `047c9675`

```bash
git add tools/famous-curator/ui/components/CropCanvas.tsx
git commit -m "feat(curator): disk-geometry overlay on crop canvas

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Deproject toggle + as-shot/deprojected preview

**Files:**
- Modify: `tools/famous-curator/ui/components/MetadataForm.tsx` or `ParamSliders.tsx` (place the toggle next to the existing param controls)
- Modify: `tools/famous-curator/ui/components/PreviewPane.tsx`
- Modify: `tools/famous-curator/ui/api.ts` (process/preview already round-trips; ensure `disk` is included so the server can render the deprojected preview)
- Test: reducer toggle covered by Task 1; preview is a visual check

**Behaviour:** a "Deproject to face-on" checkbox bound to `disk.deproject`, seeded from b/a but user-overridable. The preview pane shows the deprojected result (when on) so the maintainer compares against as-shot before commit — including at the export/commit step (spec scope). Toggling re-requests the preview with the current `disk`.

- [x] **Step 1:** Add the toggle (dispatches `setDisk` with flipped `deproject`). Disable/annotate it when `axisRatio < DEPROJECT_MIN_AXIS_RATIO` (too edge-on — show "as-shot only"). _(own `components/DiskControls.tsx`)_
- [x] **Step 2:** Thread `disk` into the preview request so the server-rendered preview reflects deprojection. Show the deprojected image in `PreviewPane`. _(process.ts deprojects `cropped.png` mirroring export.ts; `disk`/`catalogAxisRatio` on `ProcessParams`; `needsProcess` includes `dirty.disk`)_
- [x] **Step 3:** `npm run typecheck` → PASS (rc=0).
- [ ] **Step 4:** Manual check: toggling shows as-shot vs deprojected; edge-on galaxies lock to as-shot. _(VISUAL — pending user)_
- [x] **Step 5: Commit** `5f9a1a31`

```bash
git add tools/famous-curator/ui/components/PreviewPane.tsx tools/famous-curator/ui/api.ts tools/famous-curator/ui/components/MetadataForm.tsx
git commit -m "feat(curator): deproject toggle + face-on preview

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Send `disk` on export + re-hydrate on resume

**Files:**
- Modify: `tools/famous-curator/ui/App.tsx` (export call + resume flow)
- Test: existing App/export integration tests if present; otherwise manual

**Behaviour:** the Commit/export handler includes `state.disk` in `ExportParams` (Plan 2 Task 1 accepts it). The resume flow (re-clicking a curated galaxy) reads `recipe.disk` via `getRecipe` and dispatches `setDisk` so the overlay reconstructs.

- [x] **Step 1:** Include `disk` in the export params object. _(plus `catalogAxisRatio`; api.ts unchanged — ExportParams inherits both from ProcessParams)_
- [x] **Step 2:** In the resume path (where crop/sliders are restored from the recipe), dispatch `setDisk(recipe.disk)` when present. _(accepts spurious dirty.disk on resume — resume already re-Processes via setCrop; documented)_
- [x] **Step 3:** `npm run typecheck` → PASS (rc=0).
- [ ] **Step 4:** Manual round-trip: curate a galaxy with a disk → commit → re-select it → overlay reappears. _(VISUAL — pending user)_
- [x] **Step 5: Commit** `7448423d`

```bash
git add tools/famous-curator/ui/App.tsx
git commit -m "feat(curator): export + re-hydrate disk geometry

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes

- Spec coverage: overlay handles (decision 1), source-px storage (decision 2), deproject toggle + preview incl. export step (scope), edge-on lockout (decision 3 / edge cases).
- Decoupling (decision 1) is explicitly tested by the manual check in Task 3 — crop and disk never co-move.
- Pure geometry (Task 2) is the only unit-tested part; the React wiring is verified by typecheck + manual, consistent with this being a maintainer-only dev tool.
