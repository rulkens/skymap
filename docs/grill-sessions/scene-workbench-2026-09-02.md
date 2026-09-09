# Grill Session: Scene Workbench (real-3D Søndermarken → Powers-of-Ten asset lab) — 2026-09-02

Source: conversation, 2026-09-01/02 — started as "can we get a 3D scene out of the
GeoDanmark API?", converged on a new standalone dev tool. Companion research:
`docs/research/2026-08-20-powers-of-ten-to-the-eye.md` (the ladder this tool serves).

Goal: a `tools/scene-workbench` sibling dev tool (flow-workbench pattern) for building
and judging real-3D reconstructions — Danish open geodata (LiDAR, DHM, skråfoto) for
Søndermarken rungs 1–2, and own photogrammetric captures (drone patch, person, head,
iris) for rungs 3–6 — as comparable LiDAR / Gaussian-splat / MVS-mesh layers in one
WebGPU viewer. Explicitly NOT a heightfield: true 3D with facades, overhangs, canopy.

Pre-grill decisions (from the brainstorm before grilling started):

- **Tool purpose**: full 3D scene workbench (fetch → reconstruct → view), not a
  data-explorer-only or splat-only tool.
- **Recon placement**: viewer + offline recon — the workbench renders baked artifacts;
  reconstruction runs as separate node/CLI steps wrapping open-source tools
  (DisPerSE-wrapper precedent). In-tool training rejected as a much bigger build
  before first pixels.
- **AOI**: Søndermarken preset from a registry, no bbox-picker UI in v1.
- **Layers**: LiDAR points, Gaussian splats, AND MVS textured mesh — the tool's
  identity is side-by-side judgment of reconstruction methods (user widened this from
  the initial LiDAR+splats recommendation).
- **UI stack**: React + RTK + sagas + CSS modules, repo conventions.
- **Approach**: standalone sibling tool (galaxy-renderer state shape + sagas), NOT
  dev layers inside the main app (couples exploratory code to the engine), NOT the
  hand-rolled store (flow/mcpm precedent) — user explicitly wants the RTK+saga shape.

---

## Q1: Reconstruction toolchain (Apple Silicon constraint)

**The question:** Which open-source reconstruction stack, given bakes run on a Mac
with no CUDA? The default answers (COLMAP dense MVS, gsplat/nerfstudio) both want
CUDA, so this constrains everything downstream.

**Considerations:**

- **Option A (Mac-native trio):** PDAL for LAZ processing; COLMAP for sparse model
  only — skråfoto ships full interior/exterior orientation so poses are injected, not
  solved (captures do run SfM); OpenMVS for densify → mesh → texture (CPU-only works,
  slow but the AOI is one park); Brush (Apache-2.0, Rust/wgpu, WGSL kernels) for
  Gaussian-splat training — trains natively on a Mac, same substrate as skymap's
  renderer. OpenSplat (Metal backend) is the noted fallback trainer.
- **Option B (CUDA stack, remote):** nerfstudio/gsplat + COLMAP dense on rented/cloud
  CUDA hardware. Better-trodden research tooling, but moves every bake off-machine
  and adds an infrastructure dependency for an art project.

**Decision:** Option A, the Mac-native trio. Matches the research writeup's own
survey (Brush "no CUDA, same substrate"; original Inria 3DGS repo is
research-licensed, avoid). Thin CLI wrappers per tool, DisPerSE-wrapper style.

## Q2: Data layout — asset registry + two-layer storage

**The question:** Where do raw inputs and baked artifacts live, and what is the unit
of organization? Mid-grill the user widened scope: the tool also ingests
photogrammetry of a person (Chris — the Powers-of-Ten picnic endpoint), so the layout
must host capture sessions, not just one fetched AOI.

**Considerations:**

- **Option A (asset registry + standard two-layer):** the unit is a scene asset, not
  an AOI. Raw inputs under `data/raw/` (`dhm/`, `skraafoto/` for fetched;
  `captures/<session>/` for shot material) with `rawDataRegistry` keys and resume
  caches; baked outputs in gitignored `public/data/geo3d/<asset>/` loaded via
  `dataUrl()` through the shared dev `publicDir` (flow-workbench/mcpm pattern), kept
  out of R2 sync until anything is promoted (mcpm "promote later, maybe never" model).
- **Option B (Søndermarken-shaped v1):** single-AOI layout, captures bolted on later.
  Smaller, but the registry would be designed against one input kind and retrofitted.
- **Option C (vite API plugin serving from data/raw):** famous-curator style; adds a
  server layer the static-file pattern doesn't need.

**Decision:** Option A. The writeup's rungs 3–6 are "one georeferenced local asset
stack" — assets are the point; "asset with a transform" costs little now.

## Q3–Q4: Coordinate frames — per-asset local frames in asset groups

**The question:** One shared scene frame or per-asset frames — and then how does the
viewer line up the LiDAR vs splat vs mesh of the same spot for comparison?

**Considerations:**

- **Option A (single ENU frame, origin at the picnic spot):** simplest for
  cross-asset comparison; assets carry transforms into the one frame. Recommended
  initially — rejected by user because the trick will repeat at other places on
  Earth (and off it).
- **Option B (per-asset local frames + per-asset geo-anchor):** each asset anchors
  itself to Earth; viewer composes by anchor differences. Survives multiple sites but
  every asset carries georeferencing duty.
- **Option C (asset groups — user's structure):** a **group** is the placeable
  container with a typed anchor mapping its local metre frame to the world; **assets
  carry rigid transform + scale within their group's frame**. v1 implements one
  anchor variant, `geodetic` (lat/lon + DVR90 height + heading → ENU); a `scene`
  variant (position in skymap's universe frame — Hubble, Voyager) is a later union
  member, no orbit machinery now. Viewer opens one group at a time; comparing three
  reconstructions of one spot = three assets in one group. Hand-placed capture assets
  get nudge controls in the UI that persist the corrected transform to the asset's
  sidecar (`writeMetaSidecar` precedent). Graduating a group into skymap = anchor +
  transforms, pure data.

**Decision:** Option C, asset groups. `sondermarken` is the first group; Chris's
scans are assets in it (or a nearby group); `hubble`/`voyager`/other-people-elsewhere
are future groups.

## Q5: V1 scope — capture ingestion included

**The question:** Does capture ingestion (the Chris path) ship in v1, or is v1
fetched-data only? No capture material exists yet ("must shoot").

**Considerations:**

- **Option A (fetched + capture-ingest CLI):** v1 = Søndermarken group end-to-end
  (fetch → convert → three layers on screen) **plus** the capture-ingest CLI
  (photos/video dir → ffmpeg frames → COLMAP SfM → same downstream), validated on a
  throwaway phone capture of any object (a mug becomes a test asset in a test group).
  Proves the Chris path before the real shoot; mostly shared wrapper code.
- **Option B (fetched-only v1):** smaller, but the group/asset registry would be
  designed against one input kind — same retrofit risk as Q2's Option B.

**Decision:** Option A. Capture ingest in v1, tested on a throwaway object.

## Q6: Sagas — firm

**The question:** Saga middleware from day 1, or RTK-first with sagas where earned?
No existing tool uses sagas (flow/mcpm: hand-rolled 30-line store; galaxy-renderer:
RTK + react-redux, plain-closure effects).

**Considerations:**

- **Option A (one earned saga):** saga middleware from day 1 with exactly one watcher
  (asset load/reload orchestration — takeLatest per group, cancel-on-switch,
  hot-reload on re-bake); everything else plain slices/selectors.
- **Option B (full main-app structure):** rootSaga forking per-feature watchers —
  faithful to `src/` but scaffolding when one feature needs async.

**Decision:** Sagas are firm — the mcpm tool is being rewritten with RTK+sagas in a
parallel effort (polyphorm-look-port, "mechanism A"), and this tool follows that same
structure for consistency. Start from Option A's restraint (sagas where they pull
weight) within that shape; mirror the mcpm rewrite's layout.

## Q7: Artifact formats

**The question:** On-disk formats for the three baked layers.

**Considerations:**

- **Option A (bake to GPU-ready formats):** splats: Brush's 3DGS `.ply` packed by the
  bake step into a compact quantized binary (SH degree 0–1 in v1); mesh: OpenMVS
  OBJ/PLY + atlas baked to glTF `.glb` (standard, externally inspectable, small
  hand-rolled parser for the subset we emit); LiDAR: PDAL crop/filter/colorize → own
  packed binary (pos + color + class byte), sibling of the galaxy `.bin` style; plus
  per-asset `meta.json` sidecar (anchor/transform, counts, provenance, vintages).
- **Option B (render tool-native formats directly):** fewer bake steps but two extra
  browser parsers and no quantization; the bake CLI exists anyway.

**Decision:** Option A.

## Q8: Gaussian-splat renderer

**The question:** The biggest new GPU piece — 3DGS alpha-blending needs depth
sorting, which skymap's additive galaxy splats never did. Build how?

**Considerations:**

- **Option A (own WESL renderer, staged sorting):** instanced quads in skymap
  conventions (shared camera-uniform prefix), covariance-projection and sort math
  cribbed from Brush's Apache-2.0 WGSL kernels (same substrate, licence-compatible).
  Sorting v0 = CPU sort, throttled (re-sort on camera-rest; 1–2M splats in tens of ms
  off the render path — correct pixels fast, popping only mid-orbit); v1 = GPU radix
  sort ported from Brush/reference impls if popping annoys.
- **Option B (adopt an OSS WebGPU splat viewer wholesale):** faster to first pixels
  but foreign structure to maintain inside the tool, idiom mismatch with WESL setup.

**Decision:** Option A, CPU-sort first.

## Q9: Skråfoto in the viewer

**The question:** Is skråfoto purely offline recon input, or does it appear in the
viewer?

**Considerations:**

- **Option A (camera-poses overlay):** wireframe frusta at each pose (from STAC
  `pers:` metadata baked into the group); click a frustum to show that photo (COG
  crop) on a quad at its image plane with an opacity slider. The key
  reprojection-alignment diagnostic when recon goes wrong; cheap (lines + textured
  quad); works identically for capture sessions since COLMAP emits the same pose
  structure.
- **Option B (offline only):** leaner viewer; loses the alignment diagnostic and
  would be rebuilt the first time the mesh comes out skewed.

**Decision:** Option A.

## Q10: Viewer camera

**The question:** Reuse the app's OrbitCamera/OrbitControls or a tool-local rig?

**Considerations:**

- **Option A (tool-local rig on shared math):** the app's camera is Mpc-scaled and
  entangled with engine focus/clamp behavior (surface standoff, tiers) meaningless in
  a 100 m park scene. Small metre-native orbit + dolly + pan built on
  `src/utils/camera/*`.
- **Option B (reuse OrbitCamera):** buys baggage, not leverage.

**Decision:** Option A, with the user's rider: **implement nicely for reuse** — pure
orbit math as one-symbol-per-file `utils/` functions, thin input binding local to the
tool.

## Q11: Name and port

**The question:** Tool name and dev port.

**Considerations:** `geo-workbench` undersells space groups (Hubble/Voyager);
`asset-workbench` bland; `photogrammetry-workbench` excludes LiDAR/fetched data;
`picnic` memorable but opaque. Port 5600 is next in the registry
(5173/5200/5300/5400/5500 taken).

**Decision:** **`tools/scene-workbench`**, `npm run scene-workbench`, port 5600.
Local-only (no `toolPages` deploy entry) until it earns one.

---

## Deferred / noted, not grilled

- Datafordeler account + API key (DHM/GeoDanmark) is a **user-side prerequisite** —
  heavier onboarding than Dataforsyningen's self-service 24 h skråfoto token.
- Datafordeler WCS retires end-2026, WMTS 2027-01-15 — prefer Fildownload/REST APIs.
- Søndermarken group bounds derive from the existing z14–19 ortho patch bounds
  (explore during spec, don't re-decide).
- LiDAR colorization source (ortho projection at bake time) folded into the PDAL
  bake step design.
- Registry storage: TS registry in-tool + per-asset `meta.json` sidecars — consistent
  with `rawDataRegistry`/famous patterns; settle exact shape in the spec.
  **Superseded by the refactor-ground checkpoint (below).**

---

## Refactor-ground checkpoint (post-grill, same session)

Greenfield cross-check overturned two grill-time storage picks (user approved):

- **Single group `manifest.json`**, not per-asset `meta.json` sidecars — binaries are
  separate files already, so metadata edits never touch them; sidecars would add a
  reconciliation layer for tens of assets. Nudge persistence = read-modify-write of
  the manifest via a dev-server endpoint.
- **`scenes.json` data registry**, not a TS registry — the group list must be
  CLI-appendable and lives beside gitignored data. Raw _inputs_ still get proper
  `rawDataRegistry.ts` rows.

Joint verdicts: camera math, WESL, rawDataRegistry, vite/tsconfig wiring all growth
(pure orbit math already exists unit-agnostic in `src/utils/camera/*`; only
`clampDistance.ts`'s Mpc constants are non-reusable). One bolt-on: the dev-API plugin
would copy famous-curator's hand-rolled HTTP plumbing — second special case.

Prep (user rulings): extract `readJsonBody`/`readBinaryBody`/error→status shape to
`tools/utils/http/` as a **separate prep PR** before the feature; centralize the
dev-port comment registry (scattered across five vite configs) as its **own tiny
cleanup diff** (adjacent finding, user-promoted).
