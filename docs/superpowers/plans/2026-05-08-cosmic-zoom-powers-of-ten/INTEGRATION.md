# Integration — How the Pieces Fit

This document is the **whole-system view** of the cosmic zoom. The other docs in this plan each cover one slice in depth; this one steps back and shows how the slices interlock at the level of code, data, and runtime behavior.

Read it after you've skimmed `SUMMARY.md`, `vision/00-product-vision.md`, and `rendering/00-scale-architecture.md`. It will not introduce new concepts — its job is to assemble the concepts the other docs introduced.

## Module map

What new code modules exist after the cosmic zoom is built, and how they relate. (Existing modules in italics; new modules in bold.)

```
                                          ┌──────────────────────────────────┐
                                          │ React UI shell (existing)        │
                                          │  ├─ App.tsx                      │
                                          │  ├─ SettingsPanel.tsx            │
                                          │  └─ NEW: TourOverlay.tsx         │ ← cinematic overlay text
                                          │       NEW: TourLauncher.tsx      │ ← "Take the tour" button
                                          └────────┬─────────────────────────┘
                                                   │
                                                   │ talks to engine through public API
                                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ services/engine (existing, post-Spec-B)                                      │
│                                                                              │
│  ├─ engine.ts (existing — public createEngine, ~1500 lines)                  │
│  ├─ runFrame.ts (existing — per-frame body)                                  │
│  ├─ phases/ (existing)                                                       │
│  │                                                                           │
│  ├─ NEW: scale/                                                              │
│  │    ├─ cameraScale.ts          ← CameraScale type, shellRelative()        │
│  │    ├─ shellTransitions.ts     ← fadeAlphaAt() per boundary               │
│  │    ├─ shellRendererRegistry.ts                                            │
│  │    └─ perShellProjection.ts   ← per-shell near/far + reverse-Z matrix    │
│  │                                                                           │
│  ├─ NEW: tour/                                                               │
│  │    ├─ tourEngine.ts           ← state machine                             │
│  │    ├─ tourScript.ts           ← the canonical tour as data                │
│  │    └─ tourLeg.ts              ← one leg of camera animation              │
│  │                                                                           │
│  └─ assetSlots/ (existing — Spec from 2026-05-07-asset-loading-design.md)   │
│       NEW slots: solarSystem, gaiaStars, milkyWayModel, localGroup,         │
│                  tullyGroups, clusters, cf4Density, cf4Flow, cmb            │
└──────────────────┬───────────────────────────────────────────────────────────┘
                   │ each ShellRenderer's render() called once per frame in shell order
                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ services/gpu (existing renderers + new shell-specific renderers)             │
│                                                                              │
│  Existing (consumed by various shells):                                      │
│  ├─ pointRenderer.ts          (shells 5, 6, 7, 8)                           │
│  ├─ filamentRenderer.ts       (shell 8)                                     │
│  ├─ quadRenderer.ts           (shells 4-8 thumbnails)                       │
│  ├─ labelRenderer.ts          (all shells, MSDF)                            │
│  ├─ markerLineRenderer.ts     (Sun marker shell 3, "you are here" indicator) │
│  ├─ milkyWayImpostorRenderer.ts (shell 3 — separate plan)                   │
│                                                                              │
│  NEW per-shell:                                                              │
│  ├─ sunRenderer.ts                  shell 1 — ray-marched photosphere       │
│  ├─ planetBillboardRenderer.ts      shell 1                                 │
│  ├─ orbitLineRenderer.ts            shell 1                                 │
│  ├─ starRenderer.ts                 shell 2 — Gaia points with BP-RP        │
│  ├─ globularRenderer.ts             shell 3 — small point pass              │
│  ├─ dwarfFuzzyRenderer.ts           shell 4 — soft point sprite             │
│  ├─ groupColorPass.ts               shell 5 — palette extension to point    │
│  ├─ xrayHaloRenderer.ts             shell 6 — sphere imposter / Gaussian   │
│  ├─ flowVectorRenderer.ts           shell 7 — instanced arrow glyphs       │
│  ├─ darkMatterVolumeRenderer.ts     shell 7 — raymarched 3D texture        │
│  ├─ cmbSphereRenderer.ts            shell 9 — equirectangular inside-sphere │
│                                                                              │
│  NEW shared:                                                                 │
│  ├─ raymarcher.ts             shared raymarch utilities (used by sun, halo, │
│  │                            volume) — covered in rendering/03-volumetric  │
│  └─ shellComposer.ts          composites per-shell color attachments        │
└──────────────────┬───────────────────────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ tools/ (build-time)                                                          │
│                                                                              │
│  Existing:                                                                   │
│  ├─ buildAllBins.ts       (existing — galaxy catalogs)                      │
│  ├─ buildFilaments.ts     (existing)                                         │
│  ├─ syncR2.ts             (existing — must add new files to ALLOW filter)   │
│                                                                              │
│  NEW:                                                                        │
│  ├─ buildSolarSystem.ts        produces solarsystem.bin                     │
│  ├─ buildGaiaStars.ts          produces stars.bin                           │
│  ├─ buildMilkyWayAssets.ts     produces globulars.bin + impostor textures   │
│  ├─ buildLocalGroup.ts         produces localgroup.bin                      │
│  ├─ buildTullyGroups.ts        produces tully-groups.bin                    │
│  ├─ buildClusters.ts           produces clusters.bin (incl. X-ray sidecar)  │
│  ├─ buildCosmicflows.ts        produces cf4-density.bin + cf4-flow.bin      │
│  ├─ buildCmbTexture.ts         produces cmb.png/jpeg                        │
│  └─ buildShellData.ts          orchestrator that calls all of the above     │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Per-frame execution sequence (cosmic zoom in tour mode)

When the user has clicked "Take the tour" and the camera is mid-flight from shell 6 to shell 7 (a transition):

```
Frame n begins
  │
  ├─ React: TourOverlay component reads tourEngine state, may transition CSS opacity
  │
  ├─ Engine: runFrame(state, deps, nowMs) called
  │    │
  │    ├─ tourEngine.tick(nowMs)
  │    │    └─ updates CameraScale (interpolates between shell 6 and shell 7 origins)
  │    │       updates camera position/orientation along leg path
  │    │       computes fadeAlpha for shell 6 (fading out, e.g. 0.4)
  │    │       computes fadeAlpha for shell 7 (fading in, e.g. 0.6)
  │    │       triggers asset prefetch for shell 8 if not already requested
  │    │
  │    ├─ shellRendererRegistry: identify active shells (shells 6 + 7 in this frame)
  │    │
  │    ├─ For each active shell, in outer-to-inner order (6 first, 7 second):
  │    │    │
  │    │    ├─ Bind that shell's depth attachment (cleared to far-z)
  │    │    ├─ Bind that shell's projection matrix (per-shell near/far + reverse-Z)
  │    │    ├─ Compute shell-relative camera position (shellRelative())
  │    │    ├─ For each ShellRenderer in that shell's pipeline:
  │    │    │     pass.upload(shellRelativeCoords)
  │    │    │     pass.render(commandEncoder, shell6's-fade=0.4)
  │    │    │
  │    │    └─ Composite shell's color attachment onto shared backbuffer with alpha
  │    │
  │    ├─ labelRenderer pass (after all shells, before tone-map; uses per-shell projection per label)
  │    │
  │    ├─ post-process pass (tonemap, bloom)
  │    │
  │    └─ scheduleFrameTail() — tour active means always re-schedule next frame
  │
  ├─ React: state propagation continues; if overlay copy changed, CSS transition fires
  │
Frame n complete
```

## Data flow at runtime

```
USER CLICKS "TAKE THE TOUR"
   │
   ├─→ TourLauncher dispatches tourEngine.start()
   │
   ├─→ tourEngine triggers prefetch on EVERY shell's assetSlot
   │      slot 1 (solarsystem): fetch solarsystem.bin (<1MB; arrives in <1s)
   │      slot 2 (gaiaStars): fetch stars.bin (~30MB)
   │      ... etc
   │
   ├─→ Tour begins playing. As camera enters each shell, that shell's
   │   slot must be READY. If not, tour pauses on the previous shell with
   │   a brief "loading next" indicator.
   │
   ├─→ User watches tour for 90 s. Each shell's renderers consume their
   │   loaded data. The point cloud from existing skymap data is always
   │   loaded; new shell data joins the scene as the camera enters that shell.
   │
   ├─→ Tour completes. Camera returns to default view. Slots remain READY/IDLE
   │   for at least N minutes (configurable) so a quick replay is instant.
   │
   └─→ After M minutes of inactivity, slots drop to UNLOADED to reclaim VRAM.
       Existing tier-based loading is unchanged.
```

## Coordinate-system pipeline

```
Build time (Python or Node):
  raw catalog row (RA, Dec, distance in upstream units)
    │
    ├─ apply unit conversion (e.g. light-years → parsecs)
    ├─ apply coordinate-system rotation (e.g. galactic → equatorial J2000)
    ├─ project to Cartesian: x = d cos(Dec)cos(RA), y = d cos(Dec)sin(RA), z = d sin(Dec)
    │
    └─→ output as per-record absolute heliocentric position in the dataset's native unit
         (AU for solar system, pc for stars, kpc for MW, Mpc for everything else)

Runtime (JavaScript):
  the per-record position is stored in f64 in JS (arrays of Float64Array? or just regular Number — both are f64)
    │
    ├─ when shell N becomes active:
    │     compute shellOrigin (e.g. M87 heliocentric position) in this dataset's unit
    │
    ├─ for each render submission:
    │     shellRelativePos = (absolutePos - shellOrigin) [f64 subtract]
    │     normalizedPos = Math.fround(shellRelativePos)  [narrow to f32 only at the GPU boundary]
    │     uploaded to GPU
    │
    └─→ shader reads f32 positions in a coordinate range comfortably within precision

GPU (WGSL):
  vertex shader:
    pos_camera_local = pos - camera_local_pos   [both f32; camera_local_pos = camera - shellOrigin]
    pos_clip = projection * view * vec4(pos_camera_local, 1)
```

## Where the seams are (and why they're stable)

The cosmic zoom is layered so that any one layer can be replaced without rewriting the others:

| Layer | Stable interface | Replaceable thing |
|-------|-----------------|-------------------|
| Build pipeline | `.bin` files at versioned paths | The upstream catalog source |
| Asset slots | `slot.load() / slot.current` | The fetch/decode strategy |
| Shell renderer | `ShellRenderer` trait | The actual shader / technique |
| Tour engine | `TourEngine.start/stop/tick` | The TourScript array |
| Cinematic overlay | `<TourOverlay beat={} />` | The copy / styling / animation |

A future change like "swap ROSAT for eROSITA" touches only the build pipeline. A future change like "redesign the X-ray halo to be raymarched" touches only the shell renderer. A future change like "make the tour shorter on mobile" touches only the TourScript.

This stratification is what lets the plan grow over time without re-architecting.

## What stays exactly the same

The existing skymap experience is **not changed** by the cosmic zoom:

- The wide-view rendering of 2.5M galaxies still works identically.
- Free-fly with mouse + SpaceMouse still works identically.
- The settings panel still controls every existing setting.
- The browser-nav `#target=` flow is untouched.
- All existing tests still pass.

The cosmic zoom is **opt-in** through the "Take the tour" button (or `?tour=` URL flag). A user who never clicks the button sees a slightly cleaner first-frame UI (with the "Take the tour" affordance) but is otherwise in the same product.

## What the user sees vs what runs underneath

- **What the user sees:** A button. Click it. Watch a 90-second cinematic. Done. Maybe replay.
- **What runs underneath:** A scale-aware coordinate system spanning 17 orders of magnitude. Nine independent render pipelines. Ten new datasets. A camera state machine driving per-shell rendering. A React component synchronized with the GPU.

The product's value is in how **invisible** all of that is. The plan's job is to keep it invisible while making it real.
