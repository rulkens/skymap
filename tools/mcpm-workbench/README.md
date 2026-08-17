# MCPM Workbench

A WebGPU dev tool that will visualise the **MCPM cosmic-web simulation** —
the constrained-realisation dark-matter density field skymap's volume
renderers already consume, but driven live rather than baked offline. This
task (T1) scaffolds the empty shell only: a Vite + React + TS app with a
canvas that clears to a colour through the HDR-accumulate → tonemap render
graph. No MCPM data, compute, or UI yet — those land in later tasks of the
`mcpm-workbench` plan.

This is a sibling dev tool, like `tools/flow-workbench/` and
`tools/galaxy-renderer/` — its own self-contained Vite + React + TS app, not
part of the skymap runtime bundle.

## Launch

```bash
npm run mcpm-workbench
```

Then open <http://localhost:5500>. The port (5500) is deliberately clear of
the main app (5173), the curator (5200), flow-workbench (5300), and
galaxy-renderer (5400) so all can run side-by-side.

## Shaders

The tool links against the runtime's canonical shader tree
(`src/services/gpu/shaders`) via `wesl.toml`, the same arrangement
`tools/flow-workbench` uses — a future `package::mcpm::…` shader will resolve
identically in both apps. It keeps exactly one shader of its own,
`src/render/shaders/blit.wesl`, the HDR→swapchain tonemap resolve.
