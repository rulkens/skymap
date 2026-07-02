# Galaxy Renderer

A WebGPU dev tool that draws a single **procedural, parametric
Hubble-sequence galaxy** — hundreds of thousands of instanced star sprites
behind an HDR bloom pipeline — tunable to match real astrophotography. It
ports a proven spike into the repo as a first-class instrument for judging
whether that richer representation is "up to par" to eventually replace the
main renderer's per-galaxy point billboard on close approach.

This is a sibling dev tool, like `tools/flow-workbench/` and
`tools/famous-curator/` — its own self-contained Vite + React + TS app, not
part of the skymap runtime bundle.

## Launch

```bash
npm run galaxy-renderer
```

Then open <http://localhost:5400>. The port (5400) is deliberately clear of
the main app (5173), the curator (5200), and the flow-workbench (5300), so
all four can run side-by-side.

## Controls

- **Drag** — orbit the camera around the galaxy.
- **Right-drag / middle-drag** — pan the orbit target.
- **Wheel** — zoom in/out (damped, clamped range).
- **Idle** — after 2.5 s without input, auto-rotate resumes.

## Rendering

Each frame draws in five passes: additive stars, then absorptive dust
(multiplicative transmittance, so it darkens and reddens whatever's behind
it), then a bright-pass extracts the HDR highlights, which feed a 5-level
dual-filter bloom pyramid (Karis firefly-suppressed averaging on level 0
only, plain box averaging on the deeper levels), and a final composite pass
adds the bloom back onto the scene, tone-maps, grades, and gamma-encodes to
the canvas.

Every constant in the pass chain — screen-size clamps, LOD hashes, blend
weights, tonemap curves — is a verbatim, cited port of the spike's
`galaxy-engine.js` (camera, uniforms, pipelines, frame loop) and
`galaxy-shaders.js` (the WGSL shipped inline in the spike, now split into
the seven WESL files under `src/engine/shaders/`); see the shader/engine
source comments and
[`docs/superpowers/plans/2026-07-02-galaxy-renderer-02-engine-and-shaders.md`](../../docs/superpowers/plans/2026-07-02-galaxy-renderer-02-engine-and-shaders.md)
for the full line-cited port map.

## Status

Model, engine, and shaders are live; the control panel, compare/auto-fit
panel, and JSON presets land with plan 03. See
[`docs/superpowers/specs/2026-07-02-galaxy-renderer-tool-design.md`](../../docs/superpowers/specs/2026-07-02-galaxy-renderer-tool-design.md)
for the full design.
