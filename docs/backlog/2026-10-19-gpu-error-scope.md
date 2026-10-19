# Dev builds install a GPU error scope

**Readiness:** `ready`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

`grep -rE 'pushErrorScope|uncapturederror' src` returns nothing. A pass whose pipeline formats disagree with its step's target, or a Layer pass on a swap line after an HDR toggle, invalidates the command buffer. WebGPU reports that as a console warning; the frame is black or stale and nothing in the app notices.

## Direction

In dev builds (`import.meta.env.DEV`), register `device.addEventListener('uncapturederror', …)` at `initGpu` and route it into the engine status so the overlay shows it, and wrap `executeFrame` in `pushErrorScope('validation')` / `popErrorScope()` per program run. Keep both out of production builds (the scope has a cost). A boot test with the mock device asserts the listener is installed.
