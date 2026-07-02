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

## Status

This is scaffolding only — the engine, model, and shaders arrive in a later
plan. See
[`docs/superpowers/specs/2026-07-02-galaxy-renderer-tool-design.md`](../../docs/superpowers/specs/2026-07-02-galaxy-renderer-tool-design.md)
for the full design.
