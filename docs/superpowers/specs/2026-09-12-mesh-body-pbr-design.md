# Mesh-body PBR — design (DRAFT: ground pass done, rulings T1–T4 + packaging pending)

Lands inside PR #693 (Voyager 1/2 + Mars rovers) by user ruling 2026-09-12. Plan:
`docs/superpowers/plans/2026-09-12-mesh-body-pbr.md` (not yet written — gated on the
rulings below). Ledger: `.superpowers/sdd/2026-09-11-voyager-rovers/progress.md`.

## Problem

The four NASA models arrive as diffuse-only atlases: the Blender prebake bakes one
`DIFFUSE/COLOR` pass and writes metallic 0 / roughness 0.7 into the exported GLB, so
`buildMeshes` substitutes 1×1 constants for normal and metallic-roughness. The mesh
fragment shader reads roughness only (`DIELECTRIC_F0`, metallic unread) and has no
environment term, so even a correctly baked metal would render black except for the
Sun highlight. Solar panels and metal surfaces cannot read as such.

## Decisions already ruled (user, 2026-09-12)

- Proper PBR ships in #693, not as a follow-on.
- Material inputs: bake metallic, roughness and tangent-space normals from the NASA
  materials (metallic via the Metallic→Emission swap, Blender has no metallic bake type).
- Shading: Cook–Torrance GGX with a metal/dielectric blend; environment specular via
  split-sum with a **pre-baked 2D BRDF LUT** (N·V × roughness → F0 scale/bias) and a
  **GGX-prefiltered** probe mip chain (one roughness level per mip), not box mips.
- Environment: a **per-body local reflection probe** captured from the body's position
  (host planet + its atmosphere + nearby bodies) over a **once-baked solar-system sky
  cubemap** (star field; parallax across the solar system is sub-texel at probe
  resolution). Small float faces (64–128 px), refreshed at low cadence only while the
  body is drawn near, at most one refresh in flight.
- The **Sun stays analytic**, as a sphere light of its true angular radius. Reason is
  sampling, not dynamic range: at probe resolution the Sun is sub-pixel, so its energy
  would smear through the prefilter into a resolution-shaped highlight; the direct term
  also has to track the per-frame Sun/eye geometry and the existing umbra/penumbra.
- Finding: the existing "static sky cubemap" is the **Sgr A* lens capture only**
  (`renderFrame.ts` keys it on distance to the galactic-centre anchor, allocates its row
  only inside the lensing band, 0.1 au near plane). No sky cubemap exists at Earth, Mars
  or a Voyager; the solar-system sky bake is a second static bake.
- Interim (landed 9fa9b3167): the mesh shader carries the planets' 0.08 ambient floor so
  night-side rovers and a shadowed Voyager bus read as shapes. The probe supersedes it.

## Ground preparation (refactor-ground checkpoint, 2026-09-12)

Inputs: seam trace over the mesh pipeline, cubemap capture, build artifacts, sun light
and per-body state; an independent greenfield derivation from requirements only.

### Ideal shape (data delta first)

```ts
// tools/meshes/prebake/meshPrebake.py — a pass table; today's script is the first row
BAKE_PASSES = [
  ('albedo',    dict(type='DIFFUSE', pass_filter={'COLOR'})),
  ('normal',    dict(type='NORMAL',  normal_space='TANGENT')),
  ('roughness', dict(type='ROUGHNESS')),
  ('metallic',  dict(type='EMIT')),   # Metallic→Emission swap, restored after
]
# flatten_materials links the baked images; it no longer writes Metallic 0 / Roughness 0.7

// src/data/bodies/meshAssets.generated.ts
type MeshAssetRow = { …, substituted: readonly ('normal' | 'metallicRoughness')[] }
// runtime keeps ONE path: a substituted channel is a 1×1 texture (settled in #678)

// public/lut/envBrdf.{bin,json} — committed build artifact (font-atlas precedent)
// tools/lut/buildEnvBrdfLut.ts

// src/data/rendering/cubemapCaptures.ts — probes and sky bakes as rows of one table
type CubemapCapture =
  | { kind: 'sky';   id: 'sgrAStar' | 'solarSystem'; band; anchor; faceSizePx; target: RenderTargetId }
  | { kind: 'probe'; bodyId: string }        // target = that body's MeshResources.probe
type CaptureRuntime = Map<string, { baked: RefreshKey | null; pending: RefreshKey | null; facesDone: number }>
// EngineState.skyCubemapCapture (singleton) → EngineState.cubemapCaptures

// shaders/bodies/meshBody/io.wesl — MeshBodyUniforms + sunAngularRadius, hostAngularRadius,
//   probeMipCount, probeIntensity (two ride the free _pad0/_pad1)
// shaders/lib/pbr.wesl — pbrDirect(f0: vec3) + pbrDirectSphere(l, angularRadius, …) + envSplitSum
// src/@types/rendering/MeshResources.d.ts — + probe: { cube: GPUTexture; mipLevelCount } | null
// src/services/gpu/lib/prefilterCubeGgx.ts — NEW (generateMipChain stays 2D)
```

The feature DELETES the host-shine fill (colour, strength, `hostSkyFraction`, `dirToHost`
Lambert term): the host planet is in the probe.

### Shape options under compatibility tension (priced; rulings pending)

- **T1 material channels** — greenfield `texture | constant` union per channel vs the
  #678 shape (always four textures, 1×1 substitutes, one runtime path). Recommend #678
  shape: the union buys nothing at runtime and adds a shader/loader branch. Cost carried:
  a provenance-only `substituted` list.
- **T2 LUT shipping** — committed asset like the font atlas (~256 KB in git, zero
  manifest/R2/generated-table edits) vs manifest + R2. Recommend committed.
- **T3 diffuse environment** — SH9 buffer vs sampling the probe's coarsest prefiltered
  mip. Recommend the mip: no reduction pass, no second resource.
- **T4 Sun irradiance** — constant `SUN_IRRADIANCE` (expose for the subject) vs true
  1/r² (Voyager at 170 au is 30,000× dimmer; needs frame exposure). Recommend the
  constant, shared by probe and direct term so metal reflects the host in the same units.

### Missing joints (bolt-on verdicts, blockers)

- **J1** Capture is one anchor, one target, one singleton: `renderFrame.ts:114-201`,
  `SkyCubemapCaptureRuntime` (scalars), `frameProgram.ts:174-176` (`'sky-cubemap'`
  literals), `executeFrame.ts:312-320` (touched set by target id),
  `skyCubemapFaceContext.ts:115` (view slots 1..6 claimed). A solar-system sky bake is
  the second static bake (special-case trigger); probes the third. → P1.
- **J2** Probes are not render-target rows: the target table stays static; a probe
  texture lives in the body's `MeshResources`, so a capture step must address a cube
  view by capture key, not by `RenderTargetId` (`frameProgram.ts:175`). → P1.
- **J3** The mesh bind group is minted only in `setMesh` (`meshBodyRenderer.ts:181`);
  no home for a global LUT or a rebindable probe. → P2.
- **J4** `pbrDirect` takes a scalar `f0` (`lib/pbr.wesl:288`); the fragment header's
  "build the blend HERE" is inherited shape, not a seam. → P3.
- **J5** Prebake single-output lifecycle (`meshPrebake.py:249-263`, `:349-355`) and
  constants written into the GLB (`:272-273`). → P4.
- **J6** `meshFetcher.ts:41-45` hardcodes three suffixes; `MeshAssetRow` is serialized
  by hand in two places (`buildMeshes.ts:540-549`, `:558-572`). → P5.
- Growth, no prep: `MESH_TEXTURE_SLOTS` rows; a second 6-layer target row for the
  solar-system sky (`renderTargets.ts` mints cube/layer views on `layers === 6`);
  `MeshResources` + `releaseResources` as the probe owner; the sun angular radius already
  computed and discarded in `sunVisibleFraction.ts:39-52`; `_pad0`/`_pad1`;
  `ContentPass.skyCapture` boolean → value (`'sky' | 'probe'`) for roster selection.

### Prep list (each its own commit, sequenced before the feature commits)

- **P1** Keyed cubemap captures: `CubemapCapture` table + `cubemapCaptures` runtime map
  replace the Sgr A* singleton; capture `FrameStep`s carry the capture key; the
  `executeFrame` touched set keys the same; `cubemapFaceContext(eye, face, size, near,
  viewSlotBase)`. Behaviour-identical for the lens (the only row at that point).
- **P2** `meshBodyRenderer`: a global group(1) (sampler + LUT slot, LUT initially absent)
  and a `bindProbe(bodyId, view | null)` entry that re-mints only the per-body group.
- **P3** `pbr.wesl` `pbrDirect` f0 → `vec3`; Earth ocean-glint parity test.
- **P4** `meshPrebake.py`: `BAKE_PASSES` table + per-pass image lifecycle;
  `flatten_materials` links images; with only the albedo row the four atlases are
  byte-identical (`meshes.sha256`).
- **P5** `meshFetcher` reads `MESH_TEXTURE_SLOTS`; `buildMeshes` serializes
  `MeshAssetRow` from one descriptor; `substituted` list replaces `normalMapSubstituted`.

### Adjacent findings

- `generateMipChain` rebuilds its pipeline per call (by design; note only).
- `SUN_IRRADIANCE`'s parity test breaks deliberately if T4 goes 1/r².
- `sceneMeshBodies.ts` header still says `radiusM`; `rotationElements.ts` is
  prettier-dirty on main (fold into the feature commits).

### Open at the checkpoint

Sign-off on the shape and T1–T4; packaging: prep P1–P5 as separate PR(s) — P1 is
independently valuable, it un-braids the lens bake — or everything on #693. No default.
