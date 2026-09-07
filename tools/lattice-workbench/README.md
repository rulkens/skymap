# Gluon Field Workbench

A single-file WebGPU tool that runs an SU(2) pure-gauge lattice simulation in
compute shaders and volume-renders the result live. It is the interactive
counterpart to the "boiling vacuum" lattice-QCD animations (Leinweber / CSSM):
gluon energy density, topological charge density, and the Polyakov loop, with
temperature under the user's control.

## Launch

Open `tools/lattice-workbench/index.html` directly in a browser, or serve the
directory with any static server. There is deliberately no build step and no
dependency: the page must open on a phone from a shared link, so everything
(WGSL, CSS, JS) is inline.

WebGPU is required: Chrome / Edge on desktop and Android, Safari 26+ on iOS
and macOS.

## What it computes

- **Links** are SU(2) matrices stored as unit quaternions, one `vec4f` per
  link, `L³ × Nt × 4` of them in a storage buffer.
- **Thermalisation**: Kennedy–Pendleton heatbath plus overrelaxation, one
  checkerboard colour of one link direction per dispatch (8 dispatches per
  sweep). Random numbers come from a PCG hash of (site, sweep, direction), so
  the kernel is stateless.
- **Smoothing**: the hot configuration is copied each frame and cooled
  (link ← normalised staple) for the requested number of sweeps. The hot
  ensemble keeps evolving underneath; only the copy is smoothed.
- **Densities**, per site of the chosen time slice, into an `rgba16float`
  3-D texture: `r` = action density (six plaquettes), `g` = topological charge
  density (clover field strength), `b` = Polyakov loop (`½ Tr` of the product
  of temporal links).
- **Readouts** via atomics: mean plaquette of the unsmoothed field (the
  thermalisation gauge — it should settle at 0.63 for β = 2.4), total
  topological charge Q (integer-valued once well smoothed), mean Polyakov
  loop (≈0 confined, order 1 deconfined).

## Temperature

`T = 1 / (Nt · a)`. The `Nt` slider changes the box's time extent; `β` changes
the lattice spacing. `T / Tc` is estimated from the SU(2) Wilson-action
critical couplings `βc(Nt)` with one-loop scaling and is indicative only.

## Rendering

A fullscreen fragment shader ray-marches the unit cube against the 3-D
texture with a repeat sampler (the lattice is periodic, so trilinear wrap is
exact). Transfer functions per view mode; a threshold floor hides the
low-level noise so the lumps stand out. Cube edges are a 24-vertex line list.

## Provenance

The numpy prototype (heatbath, cooling, clover charge, offline ray-marcher)
that this port was validated against lives in the session scratchpad and is
not in the repo; the plaquette and integer-Q checks are what carried over.
