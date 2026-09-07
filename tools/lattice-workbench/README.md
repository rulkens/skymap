# Gluon Field Workbench

A single-file WebGPU tool that runs a pure-gauge lattice simulation in compute
shaders and volume-renders the result live. A toggle switches between the
two-colour SU(2) toy and real three-colour SU(3). It is the interactive
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

- **Links**: SU(2) as unit quaternions, one `vec4f` per link; SU(3) as a
  pair of `mat3x3f` (real and imaginary parts), 96 bytes per link. The shader
  is generated per group from one lattice template; only the algebra block and
  the update kernels differ.
- **Thermalisation**: Kennedy–Pendleton heatbath plus overrelaxation, one
  checkerboard colour of one link direction per dispatch (8 dispatches per
  sweep). SU(3) updates cycle the three SU(2) subgroups (Cabibbo–Marinari).
  Random numbers come from a PCG hash of (site, sweep, direction), so the
  kernel is stateless. Links are re-unitarised every 32 frames against float
  drift.
- **Smoothing**: the hot configuration is copied each frame and cooled
  (link ← normalised staple) for the requested number of sweeps. The hot
  ensemble keeps evolving underneath; only the copy is smoothed.
- **Densities**, per site of the chosen time slice, into an `rgba16float`
  3-D texture: `r` = action density (six plaquettes), `g` = topological charge
  density (clover field strength), `ba` = complex Polyakov loop (`Tr / N` of
  the product of temporal links).
- **Readouts** via atomics: mean plaquette of the unsmoothed field (the
  thermalisation gauge — 0.63 at β = 2.4 for SU(2), 0.57 at β = 5.85 for
  SU(3)), total topological charge Q (integer-valued once well smoothed),
  |mean Polyakov loop| (≈0 confined, order 1 deconfined; complex for SU(3),
  coloured by its centre phase in the Polyakov view).

## Temperature

`T = 1 / (Nt · a)`. The `Nt` slider changes the box's time extent; `β` changes
the lattice spacing. `T / Tc` is estimated from the group's Wilson-action
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
