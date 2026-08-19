# Grill Session: MCPM grid resolution — divisor → voxelSizeMpc — 2026-08-19

Source: live user feedback during the grid-box gizmo pipeline on the MCPM
workbench (PR #570). "I don't like the [grid divisor] implementation, it has a
couple of problems."

The workbench's grid resolution is set by `grid.divisor`, a `<select>` of 8
hand-picked notches feeding `longAxis = round(256 / divisor)` into
`autoFitGridBox`, which derives `voxelSizeMpc` from the box's longest extent.
This session redesigns what the control means.

---

## Q1: What are the actual problems?

**The question:** Codebase analysis surfaced four candidate defects; which ones
does the redesign need to fix?

**Considerations:**

- **Option A (wrong currency):** "divisor of 256" is a proxy for a proxy — the
  user thinks in voxel counts or physical voxel size, never in "divide the
  legacy baseline by 1.25."
- **Option B (resolution coupled to box size):** voxel size = extent/(256/d),
  so resizing the box silently changes physical resolution.
- **Option C (hand-picked options list):** `DIVISOR_OPTIONS` is an arbitrary
  8-notch list in the UI layer; `round(256/divisor)` lands on odd counts (205).
- **Option D (stale vs imported state):** a loaded preset's box short-circuits
  `deriveGridBox`, so the select can show a divisor unrelated to the box on
  screen.

**Decision:** A only — the currency is the disease; B/C/D are symptoms of it
(and the chosen currency in Q2 dissolves B outright and C/D largely for free).

## Q2: What currency should the control speak?

**The question:** What gets stored in state and presets? Everything else
(dims, derivations, UI) follows from this.

**Considerations:**

- **Option A (voxelSizeMpc directly):** physical resolution is stable under
  box resize/refit; runs across differently-sized boxes are comparable; it is
  the quantity every downstream consumer (deposit kernel, rhizome export,
  main-app volume) actually uses. Cost varies with box volume — but
  `planGridBudget` already preflights and refuses with `maxLongAxis`, and the
  HUD shows total bytes, so the blow-up case is guarded. Dims become
  `ceil8(extent / voxelSize)`; voxels exactly cubic by construction.
- **Option B (long-axis voxel count):** pure relabel of today's mechanism
  (divisor = 256/count); predictable cost; but physical resolution still
  silently shifts with box size — keeps the coupling.
- **Option C (both, voxel-size primary):** two entry points writing one stored
  value; more UI and a sync subtlety for marginal gain.

**Decision:** A — store `voxelSizeMpc`. Design wins that fall out: "Auto fit"
no longer changes resolution (it only moves/sizes the box), and the derived
box's `voxelSizeMpc` equals the requested value exactly (the box absorbs the
ceil8 rounding, as today).

## Q3: Control form in GridBoxPanel

**The question:** How is voxelSizeMpc set — the `<select>` pattern survives or
dies?

**Considerations:**

- **Option A (ParamSlider, log scale):** consistent with the panel's other
  rows; log scale over ~0.25–4 Mpc gives the fine end most of the travel; live
  dims + memory readout shows cost while dragging; continuous values, no
  hand-maintained notch list.
- **Option B (number input):** exact and diffable but no drag-to-explore.
- **Option C (discrete Mpc notches):** quick rung-flips but keeps the
  hand-picked list — the thing the divisor got wrong.

**Decision:** A — log-scale ParamSlider with a live `dims × dims × dims · MB`
readout beneath it.

## Q4: Boot default

**The question:** Today's boot grid is the 200 Mpc cube at divisor 1 →
voxelSize 0.78125 Mpc, dims exactly 256³. Keep it byte-identical or round?

**Considerations:**

- **Option A (0.78125):** byte-identical boot, no silent perf/memory baseline
  change; ugly number, invisible in a 2-decimal readout.
- **Option B (0.75):** clean readout; boot dims become 272³ (~19% more voxels
  and memory) — a deliberate small quality bump.

**Decision:** B — 0.75 Mpc. The quality bump is intended, not accidental.

## Q5: Packaging and timing

**The question:** The gizmo plan is implemented on PR #570 with the F2-GATE
visual check pending, and a path-tracer-reset hotfix is in flight. When does
this land?

**Considerations:**

- **Option A (now, on PR #570):** implementer dispatches after the hotfix
  (serial, shared index); one combined visual pass covers F2-GATE + the new
  slider.
- **Option B (after gizmo wrap-up, same PR):** cleaner sequencing, two visual
  passes.
- **Option C (separate PR later):** cleanest isolation, slowest.

**Decision:** A — now, on PR #570.

## Settled without grilling (codebase-derived, controller rulings)

- Slice field: `manualVoxelSizeMpc`, mirroring `manualCenterMpc`/
  `manualSizeMpc` under the V3 importedBox-override convention. `setDivisor` →
  `setVoxelSizeMpc` (still clears `importedBox`).
- `autoFitGridBox(bounds, voxelSizeMpc, paddingMpc)` — takes the voxel size,
  no `longAxisTarget`; `BASE_LONG_AXIS` and `longAxisFor` deleted.
- Preset migration is formula-free: importing any preset syncs
  `manualVoxelSizeMpc = importedBox.voxelSizeMpc` (S17-style slider sync,
  exact by construction). Old presets' `divisor` field is ignored on read; new
  presets store `manualVoxelSizeMpc`.
- `buildKey`/`gridShapeKeyFor` swap the `divisor` field for
  `manualVoxelSizeMpc`.
- Slider range 0.25–4 Mpc, log scale.
