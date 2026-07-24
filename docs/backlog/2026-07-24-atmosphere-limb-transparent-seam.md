# Transparent seam between a body's surface and its atmosphere shell

`needs-investigation`

## The symptom

Observed on Mars at close approach (2026-07-24): a thin ring of **fully
transparent** pixels between the planet's limb and the inner edge of its
atmosphere shell. Background shows straight through, so the gap is covered by
neither draw.

Reported as a nitpick, not a blocker. It is most conspicuous on a warm surface
against black sky with a thin shell; whether other bodies show it has not been
checked.

## Suspected mechanism (hypothesis, not verified)

The surface sphere and the atmosphere shell are separate draws with separate
meshes:

- surface — `src/services/gpu/renderers/bodies/texturedBodyRenderer.ts`
  (`uvSphereMesh`)
- shell — `src/services/gpu/renderers/atmosphere/atmosphereShellRenderer.ts`
  (shaders under `src/services/gpu/shaders/atmosphere/shell/`)

If the shell's inner radius sits at or fractionally above the surface radius,
the two silhouettes only coincide in the limit of infinite tessellation. At a
finite segment count the surface limb is a polygon inscribed in the true
circle, so it falls *inside* the shell's inner circle by up to the sagitta of
one segment. That sliver is outside the surface and inside the shell's hole:
nothing rasterises it.

This predicts the seam width scales with body screen size and falls as
tessellation rises — worth confirming before designing a fix, because a
different cause (depth/blend state, or the shell's near-clip) would point
somewhere else entirely.

## Candidate fixes (design decides)

- **Overlap the radii** — drop the shell's inner radius slightly *below* the
  surface radius so the shell always covers the faceted limb. Cheapest, and
  the overlap is hidden behind an opaque surface. Needs care that the shell's
  own shading does not visibly darken the surface edge.
- **Raise tessellation** — narrows the seam without closing it, and costs
  vertices on every textured body. Weak on its own; possibly right in
  combination.

## First step

Reproduce with a known camera distance and confirm the seam width responds to
segment count. Only then pick a fix — the two candidates diverge if the cause
is not geometric.
