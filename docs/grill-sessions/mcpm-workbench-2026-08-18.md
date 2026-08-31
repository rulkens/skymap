# Grill Session: MCPM Workbench (Polyphorm → browser WebGPU) — 2026-08-18

Source: user request — "build a tool (in the tools folder) that ports the polyphorm
implementation from ~/Development/vendor/cpp/polyphorm to webgpu".

Goal: bring the MCPM (Monte Carlo Physarum Machine) cosmic-web fitting simulation into
skymap as an interactive browser tool, fitting on skymap's own catalogs and exporting
pipeline-compatible volumes.

Key survey finding that framed the whole session: the vendor checkout is
`rulkens/Polyphorm`, a fork in which a **native WebGPU port is already complete**
(tag `v1.0-macos-port`, Dawn + GLFW + ImGui). Every kernel already exists in WGSL with
the hard HLSL→WGSL problems solved and documented (`docs/superpowers/research/m2…m5/`
in that repo): OOB-load clamp-vs-zero guards, atomic-storage-texture → buffer
substitutions, r32float-only read-write storage, the 1000-thread workgroup limit bump,
preserved upstream quirks behind `override` flags. "Port to WebGPU" therefore means
porting the **host** to the browser (TypeScript/WESL/Vite instead of C++/Dawn/ImGui);
the kernels come across nearly verbatim.

---

## Q1: What is the tool for?

**The question:** Skymap already consumes MCPM output (rhizome importer, PRs #546/#550;
calibration in the PolyPhy fork's PR #114), and the Polyphorm fork already runs MCPM
natively. What role does a browser port play?

**Considerations:**
- **Option A (replace the native leg):** run fits on skymap catalogs in-browser, export
  what the rhizome importer eats; the fork retires. Most pipeline value, but commits to
  full fidelity immediately.
- **Option B (interactive workbench):** live tunable MCPM playground à la
  `tools/flow-workbench/`, export secondary. Fast to useful, but risks being a toy that
  never feeds the pipeline.
- **Option C (stepping stone to in-app):** the real goal is a live MCPM layer inside the
  skymap engine; the tool proves the kernels. Speculative — no committed in-app plan.

**Decision:** B with A's export as a **hard requirement** — a workbench whose "save"
produces pipeline-compatible output, so the tool must reproduce real results, not just
look right. C stays open for free since the kernels are WGSL either way.

## Q2: Input catalogs

**The question:** Fit on skymap's own binary catalogs, or on Polyphorm's packed
`[X,Y,Z,W]` `.bin` + metadata files (produced by offline Python packers)?

**Considerations:**
- **Option A (skymap catalogs directly):** load SDSS/2MRS/GLADE from `public/data` via
  the runtime boot path (`loadDataManifest()` + `dataUrl()`), as flow-workbench proves
  out. Zero offline steps; weight derivation becomes our own design decision.
- **Option B (Polyphorm packed files):** maximum parity with fork runs, but preserves
  the Python packer leg the port is meant to retire.
- **Option C (both).**

**Decision:** A, pure. The tool's value is fitting on skymap's actual data with no
offline steps. (Amended by Q10: a *dev-only* packed-catalog loader enters scope
strictly for validation.)

## Q3: Kernel fidelity

**The question:** Verbatim port of the fork's WGSL (quirks included) or a clean
reimplementation?

**Considerations:**
- **Option A (verbatim carry-over):** quirk flags included (`QUIRK_RNG_SEED_TYPO`,
  particle-count truncation to 100k multiples, asymmetric diffusion wrap). Gives a
  validation anchor against fork output.
- **Option B (clean rewrite):** nicer code, fixed warts — but no ground truth;
  "looks similar" becomes the only validation.
- **Option C (verbatim first, then clean):** port with quirks, validate statistically
  once, then strip quirk flags while watching the histogram/energy statistic stay
  stable.

**Decision:** C. The racy non-atomic float deposits stay forever (load-bearing Monte
Carlo noise; neither API has float atomics). Exact bit-parity is unreachable anyway
(Dawn-native vs browser Tint, scheduling differences), so validation is statistical:
trace histograms + energy curve, not byte-identical output.

## Q4: Grid resolution target

**The question:** The fork runs 712×1200×728 r32float grids (~7.5 GB total) — beyond a
browser tab at f32. Skymap ships only downsampled tiers (d8/d4/d2 → long-axis
150/300/600). What resolution does the browser tool target?

**Considerations:**
- **Option A (long-axis 600 default):** matches the shipped large tier directly,
  ~560 MB total at f32; smaller tiers by downsampling at export.
- **Option B (chase 1200):** full VAC-native resolution; sub-voxel detail that
  sim-then-average preserves. Needs the f16 storage answer (Q5) to be feasible.
- **Option C (free-form slider):** whatever the device allows.

**Decision:** B — chase 1200-class grids — plus the grid box (center/size/resolution)
must be **customizable**, because different survey shapes are coming. Multiple-of-8
axis rounding kept (decay kernel dispatches with no bounds tail). User also asked for
f16 grid storage behind a flag with f32 fallback for headroom (resolved in Q5).

## Q5: Grid storage — textures or buffers?

**The question:** WebGPU `read_write` storage textures are r32float-only; there is no
f16 storage texture. The only browser path to f16 grids is storage buffers as
`array<f16>` (`shader-f16` feature). Which storage do the deposit/trace grids use?

**Considerations:**
- **Option A (f32 storage textures, fork-port parity):** hardware trilinear filtering
  and swizzled-layout cache locality, but caps grids at ~800–900 long-axis (7.5 GB at
  1200 — dead in a tab). Kills the Q4 goal.
- **Option B (storage buffers only, element type as a flag):** f16 when `shader-f16`
  is present (halves memory: ~3.7 GB + ~240 MB agents at 1200-class — plausible on
  Apple Silicon with raised limits), f32 fallback, one code path. Costs: manual
  trilinear in the renderer (8 loads + lerp), linear-layout cache locality on
  Z-neighbors (27-tap diffusion, raymarch) — mitigable later (Z-order, tiling) if
  measured slow; needs `maxBufferSize`/`maxStorageBufferBindingSize` raised. Gains:
  simpler readback (no 256-byte bytesPerRow dance), atomics available where needed
  (splat, histogram — already buffers in the fork). Notably f16 is what upstream D3D11
  Polyphorm actually ran (`R16_FLOAT`), so f16 buffers are *closer* to upstream than
  the fork's own r32float port.
- **Option C (textures for f32 + buffers for f16):** two code paths per kernel; worst
  of both.

**Decision:** B. Only option that reaches 1200; the f16/f32 flag falls out for free.
Accepted cost: kernels become "verbatim algorithm, transformed addressing" (texture ops
→ buffer indexing) — quirk flags and RNG carry over untouched, statistical validation
anchor survives.

## Q6: Visualization

**The question:** What draws the live field? Polyphorm slice-stacks view-aligned quads
(a D3D11-era idiom) with trace/overdensity/highlights/particles/path-tracing modes;
skymap has a real raymarcher (`scalarVolume` family) but it eats packed SCFD textures,
not a live f16 buffer.

**Considerations:**
- **Option A (new lean raymarcher in the tool):** samples the sim buffer directly
  (manual trilinear, already committed by Q5), ports Polyphorm's trace transfer
  function (`1-exp(-t)` → 1D palette). Skymap-idiomatic; no per-frame copies.
- **Option B (port the slice-stack):** closest to the fork's look, but an idiom skymap
  has no other use for, and it wants a filterable texture we don't have.
- **Option C (pack to SCFD + reuse `volumeFieldRenderer` per frame):** exactly what
  the app will show, but per-frame packing is heavy and the runtime renderer doesn't
  swap volumes live.

**Decision:** A for the live view, plus (1) an **agent-splat mode** ported from
`cs_particles_transform/blit` (atomic u32 buffer, as the fork already restructured
it) — watching the swarm is half the diagnostic value; (2) option C reshaped as an
on-demand **"preview export" button**: pack the current trace through the real
`packLogTraceVoxels` and view it once, validating the export leg with pipeline code.
Overdensity/highlights deferred. (Path tracer initially deferred here — pulled back
into v1 at Q12.)

## Q7: Export contract

**The question:** What exactly does "Save" produce? The rhizome importer
(`buildRhizomeVolume.ts`) eats `.npy` + same-basename `polyphy-trace` v1 JSON sidecar.

**Considerations:**
- **Option A (`.npy` + sidecar only):** existing importer stays the single SCFD
  write-path; fork and browser tool become interchangeable producers; provenance
  (params, catalog, seed) rides the sidecar.
- **Option B (in-browser SCFD only):** `packLogTraceVoxels`/`encodeScalarField` are
  pure TS and run in a tab, but this bypasses importer validation and can't touch
  `public/data`/manifest anyway.
- **Option C (both).**

**Decision:** C — both. The user weighted full validation of the export against
already-shipped SCFDs (same packing code, diffable output) as really important, worth
the second path. Note: trace is f16; `.npy` carries float16 natively — worst case a
dtype-widening tweak to the importer, folded into this project.

## Q8: Where do the kernels live?

**The question:** Tool-local shader tree (galaxy-renderer pattern: own WESL root +
leaf symlinks) or a new runtime family under `src/services/gpu/shaders/mcpm/`
(flow-workbench pattern: tool's WESL root points at the runtime tree)?

**Considerations:**
- **Option A (tool-local):** nothing lands in `src/` until a runtime consumer exists;
  migration later is mechanical but touches every kernel path.
- **Option B (runtime family now):** pre-positions for live in-app MCPM (Q1's option
  C); the app's WESL include glob carries kernels with zero runtime consumers for now.

**Decision:** B. Kernels go in `src/services/gpu/shaders/mcpm/` from day one; the tool
reaches them flow-workbench-style. Accepted: the runtime glob carries them unused —
the in-app ambition is real enough to pre-position for.

## Q9: Data-point weights

**The question:** Polyphorm weights data points by log-mass from the packed catalog.
What plays that role from skymap bins?

**Considerations:**
- Initial options assumed no mass column (luminosity proxy / uniform / selectable) —
  **overturned by a fact-check**: v9 carries `log10StellarMass` as a real f32 column
  (`galaxyCatalogFormat.ts:94`), photometric colour-dependent M/L estimates
  (`estimateLog10StellarMass.ts`), NaN sentinel when absent. That is exactly
  Polyphorm's `W`.
- NaN-mass sub-decision: (i) exclude those points vs (ii) median-fill so they still
  anchor filaments.

**Decision:** `W = log10StellarMass` default with the fork's `log10(1+W)` transform +
mean renormalization verbatim; **uniform-weight toggle** kept as a sanity check; no
exponent knob. NaN masses get **median fill** (ii) — geometry is most of what MCPM
uses; silently dropping galaxies confuses later comparisons. **A HUD stat must show
the NaN count/fraction** so it's always visible what the fit stands on.

## Q10: Validation input

**The question:** Statistical validation (Q3) needs apples-to-apples input, but the
tool loads skymap catalogs (Q2) while the known-good anchor —
`data/raw/mcpm/trace.bin` (712×1200×728 f16) + `export_metadata.txt` — was produced
from the packed VAC catalog (324,901 points), which skymap's SDSS bin (970k,
different cuts) is not.

**Considerations:**
- **Option A (dev-only packed-catalog loader):** drag-drop the fork's `.bin`+metadata
  behind a dev flag; run with the metadata's params; compare against the VAC trace we
  already have. Zero native runs.
- **Option B (round-trip through the fork):** export a skymap catalog to packed
  format, run the native fork, compare. More moving parts, exercises the fork per run.
- **Option C (both).**

**Decision:** A — explicitly revising Q2's "no packed loader" (that deferral said
"until validation day"; this is validation day). Plus a **Node comparator CLI**
(`tools/mcpm-workbench/validate/`) taking two trace cubes and reporting the
statistical battery: log-trace histograms, the 17-bin energy statistic at data points,
per-axis marginals. B stays available manually; nothing built for it.

## Q11: Naming

**The question:** The data layer is "rhizome" (never "slime"); the source id is
`Mcpm`; flow-workbench is named for the layer it drives. What is this tool called?

**Considerations:**
- **Option A (`tools/rhizome-workbench`):** layer-named like flow-workbench; shaders
  stay `mcpm/`.
- **Option B (`tools/mcpm-workbench`):** algorithm-named, one term everywhere.
- **Option C (`tools/polyphorm`):** honours lineage but names a tool after an app it
  isn't, and splits naming from the rhizome layer.

**Decision:** B — `tools/mcpm-workbench`, npm script `mcpm-workbench`, port 5500,
shader family `src/services/gpu/shaders/mcpm/`. One term everywhere; Polyphorm gets
its due as provenance in READMEs and the sidecar, not as a folder name.

## Q12: Simulation feature scope for v1

**The question:** Which of the fork's optional passes/toggles ship in v1?

**Considerations & decision — carry:**
- Histogram/energy pass (`cs_density_histo`) — fit-quality signal + validation; energy
  plot in the UI.
- Agent-count selection (1M–10M), pause/resume/reset, trace-only clear.
- Auto-fit grid from catalog bbox (proportional split + multiple-of-8 rounding) plus
  the Q4 manual box override.
- Both agent-init modes (around-data / uniform).
- **Volumetric path tracer** — proposed as deferred, **pulled into v1 by the user**.
  The fork already ported it (`cs_volpath.wgsl` + blit, delta tracking, HG phase,
  vec4-buffer temporal accumulation); same texture→buffer transform as the rest, plus
  its parameter panel (sigma_t, albedo, anisotropy, bounces, exposure…).
- Parameter save/load as JSON (SDSS-VAC defaults as the starting preset); params also
  ride the export sidecar.

**Drop from v1:** agent sort pass (default-off, unused); center attraction (default 0,
commented out of the fork's own UI); halocolor/velocity analysis modes (unwired even
in the fork); named parameter regimes (FRB/TNG/Bolshoi… — skymap fits skymap data).

## Q13: Testing/verification

**The question:** What gets automated coverage, per the project's "test what can
break" convention?

**Decision (recommended trio accepted):**
- **Vitest (pure TS):** world↔grid mapping (affine + rounding), weight derivation
  incl. median-fill + NaN count, `.npy` writer + sidecar emitter (round-tripped
  through the existing `parsePolyphyTraceSidecar`), comparator statistics on known
  cubes. In-browser SCFD export reuses already-tested `packLogTraceVoxels` /
  `encodeScalarField` — no re-testing.
- **GPU probe:** `mcpm-workbench:probe` CLI on the galaxy-renderer pattern (headless
  Chromium, fails on GPU validation errors / shader compile logs) — the only
  automated gate that reaches the kernels.
- **Energy smoke (deferred to the validation milestone):** probe extension running N
  steps on a tiny synthetic catalog, asserting the energy statistic lands in a band
  (racy deposits ⇒ nondeterministic ⇒ band, not golden value). Built once Q10
  validation establishes normal bands.

No kernel unit tests beyond probe + smoke — kernels are validated statistically
against the VAC trace, which is stronger than mocks.
