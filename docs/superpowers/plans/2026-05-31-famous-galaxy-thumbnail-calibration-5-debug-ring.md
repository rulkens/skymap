# Famous-galaxy thumbnail calibration — Plan 5: procedural-disk debug ring

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A developer overlay that draws a world-space ring at the **selected** famous galaxy's procedural-disk radius, toggled next to the pick-buffer debug view, so the calibrated textured disk can be visually checked to cover the catalog disk's area.

**Architecture:** A small world-space line-loop pass under `services/gpu/passes/`, following the `pickDebugOverlay` / `markerLines` factory shape (shares `CameraUniforms`, premultiplied-OVER blend). Toggle plumbing mirrors the existing `debug.showPickBuffer` setting end-to-end. Radius is `paddedRadiusMpc(diameterKpc)` — the same value the textured quad derives its size from.

**Tech Stack:** TypeScript, WGSL/WESL, the existing debug-panel + settings plumbing.

**Depends on:** nothing in plans 1–4 (independent dev aid); most useful alongside Plan 4.

---

## Task 1: Add the `debug.showDiskRadiusRing` setting + toggle

**Files:**
- Modify: `src/data/defaults.ts` (default `false`)
- Modify: the debug settings type + table (`src/@types/settings/UseEngineSettingsState.d.ts`, `src/services/engine/wiring/settingsTable.ts`, `src/services/engine/wiring/seedSettingsCallbacks.ts` — follow `showPickBuffer`)
- Modify: `src/components/DebugPanel/DebugPanel.tsx` (checkbox next to "Show pick buffer", `DebugPanel.tsx:87-94`)
- Modify: `src/components/App/App.tsx` (pass the new prop, mirroring `showPickBuffer`)
- Test: `tests/` settings table test if present; otherwise typecheck

**Behaviour:** a "Show disk radius ring" checkbox, off by default, wired exactly like `showPickBuffer` (find every `showPickBuffer` reference and add the parallel `showDiskRadiusRing`).

- [x] **Step 1:** Add the setting + default + toggle + prop threading, mirroring `showPickBuffer` at each site.
- [x] **Step 2:** `npm run typecheck` → PASS.
- [ ] **Step 3:** Manual: the checkbox appears and toggles state (no overlay yet).
- [x] **Step 4: Commit**

```bash
git add src/data/defaults.ts src/@types/settings/UseEngineSettingsState.d.ts src/services/engine/wiring/settingsTable.ts src/services/engine/wiring/seedSettingsCallbacks.ts src/components/DebugPanel/DebugPanel.tsx src/components/App/App.tsx
git commit -m "feat(debug): showDiskRadiusRing setting + toggle

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: World-space ring overlay pass

**Files:**
- Create: `src/services/gpu/passes/diskRadiusRing.ts`
- Create: `src/services/gpu/shaders/diskRadiusRing/{vertex,fragment,io}.wesl`
- Type: `src/@types/rendering/DiskRadiusRing.d.ts`
- Test: shader compile is verified at runtime via `createShaderModuleWithDevLog`; logic is thin

**Contract:**

```ts
export type DiskRadiusRing = {
  // Draw a ring of `radiusWorld` (Mpc) centred at `center` (world Mpc), oriented
  // in the disk plane (paDeg + axisRatio) so it matches the textured quad.
  draw(pass: GPURenderPassEncoder, args: {
    center: Vec3; radiusWorld: number; axisRatioForTilt: number; paDeg: number;
  }): void;
  destroy(): void;
};
export function createDiskRadiusRing(device: GPUDevice, swapChainFormat: GPUTextureFormat): DiskRadiusRing;
```

Notes: generate a unit circle line-loop in the vertex stage (or a small vertex buffer); scale by `radiusWorld`; place via the same disk-axes basis as `texturedDisks/vertex.wesl` so the ring lies in the disk plane. Use the premultiplied-OVER blend and `CameraUniforms` prefix exactly as `pickDebugOverlay.ts` / the marker passes do. Read the WESL skill for `?static` import + struct-layout rules before writing the shader.

- [x] **Step 1:** Write the pass factory + WESL, following `pickDebugOverlay.ts` for factory shape and a marker/line pass for the line-loop + camera binding.
- [x] **Step 2:** `npm run typecheck` → PASS; load the app and confirm no "Invalid ShaderModule" in the console (use `createShaderModuleWithDevLog`). _(typecheck PASS; shader-compile confirmed once Task 3 wires the pass into the frame)_
- [x] **Step 3: Commit**

```bash
git add src/services/gpu/passes/diskRadiusRing.ts src/services/gpu/shaders/diskRadiusRing src/@types/rendering/DiskRadiusRing.d.ts
git commit -m "feat(debug): world-space disk-radius ring pass

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Drive the ring from the selected galaxy in the frame loop

**Files:**
- Modify: `src/services/engine/frame/runFrame.ts` (call the ring pass when `showDiskRadiusRing` is on)
- Modify: `src/services/engine/phases/initGpu.ts` (construct the pass, mirroring `pickDebugOverlay` construction)
- Test: manual visual check

**Behaviour:** when the toggle is on and a famous galaxy is selected, draw the ring at `paddedRadiusMpc(selected.diameterKpc)` centred on the selected galaxy's world position, with its catalog/calibration `paDeg` + `axisRatio` so the ring sits in the disk plane. Selection comes from the existing selection plumbing (`getFamousMeta` / selection subsystem). Off or nothing selected → no draw.

- [x] **Step 1:** Construct the pass in `initGpu` and invoke it in `runFrame` behind the toggle, reading the selected galaxy's diameter/position/orientation. _(invoked as a `diskRadiusRingPass` in `UI_PASSES` rather than an inline `runFrame` call — same gate, cleaner than a bespoke encoder; mirrors `selectionRingPass`.)_
- [x] **Step 2:** `npm run typecheck` → PASS. _(also `npm run build` — wesl-plugin compiles the ring shaders clean.)_
- [ ] **Step 3:** Manual: select a famous galaxy, toggle the ring on, confirm it draws at the procedural-disk radius and tracks the galaxy as the camera moves; compare against the textured disk (Plan 4).
- [x] **Step 4: Commit**

```bash
git add src/services/engine/frame/runFrame.ts src/services/engine/phases/initGpu.ts
git commit -m "feat(debug): draw disk-radius ring for selected galaxy

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes

- Spec coverage: "Debug ring overlay" section — selected-galaxy scope, procedural-disk radius, toggled next to pick-buffer, world-space tracking, off by default. All covered across Tasks 1–3.
- Reuses `paddedRadiusMpc` (same source as the textured quad's size) so "does the disk fill the ring" is a true apples-to-apples scale check.
- WESL gotchas (no backticks in comments, `?static` imports, 1D-texture trap, struct prefix) flagged via the WESL skill pointer in Task 2.
