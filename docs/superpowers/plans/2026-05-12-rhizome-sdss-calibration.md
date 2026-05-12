# Rhizome — SDSS Reproduction Calibration

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` (or `superpowers:subagent-driven-development` for the deterministic scaffolding tasks) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **This plan is executed entirely inside the existing PolyPhy fork at `~/Development/vendor/python/PolyPhy` on a new branch.** Skymap (this repo) is **not touched** by any task — the only skymap-side artefact is this plan file itself, committed on the `rhizome-spec` branch. Every other commit lands in the PolyPhy fork on the new `rhizome-sdss-calibration` branch.

**Goal:** Lock in the PolyPhy MCPM parameter set by reproducing the published Wilde et al. 2023 SDSS MCPM cube (`mcpm_sdss_d2.npy`, currently shipped by skymap as `mcpm-large.scfd`). We run PolyPhy on skymap's SDSS catalog restricted to the published 44–476 Mpc comoving volume, numerically + visually compare against the reference cube, iterate the parameter set, and freeze the final values in a frozen `RhizomeParams` dataclass. Those frozen parameters are then applied — unchanged — to the three full-sky rhizome shells in a **later plan**.

**Architecture:** A new `rhizome/` directory inside the existing PolyPhy fork, sibling to the proven `verification/` directory. Four Python entry points: `skymapBinDecoder.py` (v4 PointCloud reader), `buildRhizomeInput.py` (skymap `.bin` from R2 → PolyPhy CSV), `runRhizomePolyphy.py` (subprocess orchestrator with frozen `RhizomeParams`), `compareCubes.py` (numerical + max-projection comparison). The pinned-and-proven `verification/.venv/` Python environment is reused as-is — no new venv. No skymap runtime code runs in this phase; comparison is `.npy`-against-`.npy` directly with NumPy + matplotlib.

**Why fork-only, not a new repo with PolyPhy as a submodule:** The calibration loop is "run PolyPhy → look at the cube → tune params → re-run". One repo, one branch, one venv, zero cross-repo coordination. The v4 `.bin` format is stable, so a 50-line Python port costs nothing to maintain. `sdss-large.bin` and `mcpm_sdss_d2.npy` are both publicly hosted on R2 by skymap, so the fork pulls them via HTTP — no need to reach into skymap's working copy. "How the rhizome cubes were calibrated" lives as a single citable timeline in the fork's `rhizome-sdss-calibration` branch, ideal for paper appendices.

**Tech stack:** Python 3.10.20, Taichi 1.6.0, NumPy 1.22.0, Matplotlib 3.5.3, SciPy (from the verification freeze), pytest. All pinned exactly per `~/Development/vendor/python/PolyPhy/verification/requirements-frozen.txt` and proven working headlessly on Apple Silicon Metal. Skymap is untouched.

**Spec:** [`docs/superpowers/specs/2026-05-12-rhizome-cosmic-web-volume-design.md`](../specs/2026-05-12-rhizome-cosmic-web-volume-design.md) — the "Reproduction-against-SDSS calibration" section is what this plan implements. The spec's "Repository split" subsection is authoritative on the fork-only architecture.
**Smoke-test handoff:** [`~/Development/vendor/python/PolyPhy/verification/README.md`](../../../../../vendor/python/PolyPhy/verification/README.md) — authoritative for the working PolyPhy invocation, environment, output format, and gotchas.
**v4 binary format:** [`src/data/pointCloudFormat.ts`](../../../src/data/pointCloudFormat.ts) in skymap — 16-byte header (`magic=0x504d4b53`, `version=4`, `count`, `reserved`) + 64-byte record (`objID u64`, `xyz f32×3`, `magU/G/R/I/Z f32×5`, `axisRatio f32`, `positionAngleDeg f32`, `diameterKpc f32`, 12-byte pad). Little-endian throughout. Source of truth for `skymapBinDecoder.py`.
**PolyPhy CLI flags:** [`~/Development/vendor/python/PolyPhy/src/polyphy/utils/cli_helper.py`](../../../../../vendor/python/PolyPhy/src/polyphy/utils/cli_helper.py) — exhaustive list of `argparse` flags.

**Reality checks vs spec:**

- The spec says "load alongside the existing `mcpm-large.scfd` in the skymap renderer" for visual comparison. That is **deliberately deferred** — it would need a `.npy → .scfd` builder and a renderer-side toggle that don't exist yet, both explicitly out of scope for this plan. This plan substitutes a Python-side numerical + visual comparison (max-projection PNGs, 3D + 2D Pearson correlation) directly between the two `.npy` cubes. That's a stronger comparison than a perspective render anyway (no camera/tonemap variance) and keeps the calibration loop entirely inside the fork.
- The Wilde et al. literature typically expresses sensing distance / step size as **fractions of the domain extent**. PolyPhy's `PPConfig_3DDiscrete` auto-derives them from `DOMAIN_SIZE_MAX` (defaults `0.005` and `0.0005`) when unset — so the orchestrator stores these as fractions in `RhizomeParams` and multiplies into pixel-space at invocation time.
- The SDSS calibration cube spans 556 × 938 × 569 Mpc — *not* cubic. So `-t 256` produces a non-cubic trace cube whose longest axis is 256. The reproduction **deliberately does not add corner anchor points**: the reference cube is non-cubic (712 × 1200 × 728) and a faithful reproduction must be too. Cubic-AABB anchor pinning is a rhizome-shell concern, not a calibration concern.
- The verification README documents that PolyPhy emits 4D `(X, Y, Z, 1)` trace cubes that need `.squeeze(-1)`. The orchestrator does that on save; the comparison harness defends against either shape on load.
- **Acceptance bar** (`Pearson ≥ 0.6 on at least two of three axis projections`) is a *guess* — Wilde et al.'s preprocessing differs from ours (no RSD correction, no DBSCAN clustering), so absolute parity is impossible. The bar is documented in `CALIBRATION.md` as tunable; if iter 0 lands close to that bar with defaults, the bar likely needs raising.

---

## File map (in the PolyPhy fork at `~/Development/vendor/python/PolyPhy`)

**Created by this plan, all in the fork on branch `rhizome-sdss-calibration`:**

- `rhizome/README.md`
- `rhizome/.gitignore`
- `rhizome/skymapBinDecoder.py` — ~50-line Python port of skymap's v4 `decodePointCloud`
- `rhizome/buildRhizomeInput.py` — curls `sdss-large.bin` from R2 (idempotent), filters to 44–476 Mpc, writes CSV
- `rhizome/runRhizomePolyphy.py` — PolyPhy subprocess orchestrator + `RhizomeParams` dataclass
- `rhizome/compareCubes.py` — `.npy` vs `.npy` Pearson + max-projection PNG
- `rhizome/CALIBRATION.md` — parameter sweep log; one entry per iteration
- `rhizome/CANDIDATE_PARAMETERS.md` — output of Task 2 literature research
- `rhizome/tests/__init__.py` (empty marker)
- `rhizome/tests/test_skymap_bin_decoder.py`
- `rhizome/tests/test_build_rhizome_input.py`
- `rhizome/tests/test_run_rhizome_polyphy.py`
- `rhizome/tests/test_compare_cubes.py`
- `rhizome/cache/.gitkeep` — gitignored content: `sdss-large.bin`, `sdss_calibration.csv`
- `rhizome/reference/.gitkeep` — gitignored content: `mcpm_sdss_d2.npy`
- `rhizome/output/.gitkeep` — gitignored content: `sdss_reproduced.npy` + sidecar JSON
- `rhizome/calibration/.gitkeep` — committed per-iteration artefacts under `iter<N>_<name>/`
- `rhizome/calibration/sources/` — committed verbatim literature/spec excerpts (Task 2)

**Touched in the skymap repo (this repo, branch `rhizome-spec`):**

- *only this plan file itself* — committed in a separate non-plan-execution step before this plan begins. Nothing else in skymap is created, modified, or deleted during plan execution.

---

## Task 1: Branch + scaffold `rhizome/` in the PolyPhy fork

Create the `rhizome-sdss-calibration` branch, scaffold the directory tree, write the README + `.gitignore`. **No PolyPhy invocation yet** — just a clean reproducible skeleton.

**Branch base decision (resolve in Step 1):** The fork has two relevant tips:

- `verification-spike` (current HEAD: `161b1d4 Add headless 3D verification spike for skymap-rhizome`) — contains the `verification/` directory and the proven `.venv/`.
- `main` (the fork's local main, mirroring `upstream/main`).

The verification venv lives at `~/Development/vendor/python/PolyPhy/verification/.venv/`. We **must** reuse it (Taichi+NumPy+Matplotlib pinned exactly, proven Metal-stable). That venv tree exists on the `verification-spike` branch only (the `verification/` directory itself is committed there). Therefore **the new branch must be based off `verification-spike`** — confirm via `git branch -a` showing `verification-spike` includes the `verification/` directory, then `git checkout -b rhizome-sdss-calibration verification-spike`.

**Pytest setup decision (resolve in Step 1):** PolyPhy's `setup.cfg` has `[tool:pytest] addopts = --cov src --cov-report term-missing` and `testpaths = tests`. Running plain `pytest` from the fork root would pick up *PolyPhy's* `tests/` directory (not ours) and require `--cov` against PolyPhy's `src/`. To run our tests in isolation without touching PolyPhy config files, invoke explicitly:

```bash
verification/.venv/bin/pytest rhizome/tests/ --no-cov
```

`--no-cov` disables the `--cov src` addopt from `setup.cfg` (which would otherwise fail because our tests don't import `polyphy`). Passing the explicit `rhizome/tests/` path overrides `testpaths`. This invocation is documented in `rhizome/README.md` and used verbatim throughout the plan. No edits to PolyPhy's `setup.cfg` or `pyproject.toml`.

- [ ] **Step 1: Verify branch state + create the calibration branch**

  ```bash
  cd ~/Development/vendor/python/PolyPhy
  git branch -a
  # Confirm `verification-spike` is present and `verification/` directory exists on it.
  git status
  # Must be clean. If not, halt and surface to user.
  git checkout -b rhizome-sdss-calibration verification-spike
  ```

  If the verification venv is not present at `verification/.venv/bin/python`, halt — the calibration recipe depends on it. Recreate via the verification README's setup steps before continuing.

- [ ] **Step 2: Confirm pytest invocation works on an empty test dir**

  ```bash
  mkdir -p rhizome/tests
  touch rhizome/tests/__init__.py
  verification/.venv/bin/pytest rhizome/tests/ --no-cov
  ```

  Expected: `no tests ran` exit 5, NOT a coverage-related error. If we see `--cov` errors, the `--no-cov` flag isn't being respected — investigate before continuing.

- [ ] **Step 3: Scaffold directories**

  ```bash
  cd ~/Development/vendor/python/PolyPhy
  mkdir -p rhizome/{tests,cache,reference,output,calibration/sources}
  touch rhizome/cache/.gitkeep rhizome/reference/.gitkeep \
        rhizome/output/.gitkeep rhizome/calibration/.gitkeep
  ```

- [ ] **Step 4: Write `rhizome/.gitignore`**

  Use the `Write` tool to create `~/Development/vendor/python/PolyPhy/rhizome/.gitignore`:

  ```gitignore
  # Generated artefacts — recreated by the scripts in this directory.

  # Downloaded skymap .bin cache (large; fetched from R2 on demand).
  cache/*.bin

  # Generated PolyPhy CSV input (regenerated by buildRhizomeInput.py).
  cache/*.csv

  # Downloaded reference cube (large; fetched from R2 on demand).
  reference/*.npy

  # Reproduced cubes (large; recreated by runRhizomePolyphy.py).
  output/*.npy
  output/*.json

  # Python noise.
  __pycache__/
  *.pyc
  .pytest_cache/

  # macOS noise.
  .DS_Store
  ```

  The `.gitkeep` markers under each gitignored directory ensure the empty directories are present after a fresh clone.

- [ ] **Step 5: Write `rhizome/README.md`**

  Use the `Write` tool to create `~/Development/vendor/python/PolyPhy/rhizome/README.md`:

  ```markdown
  # rhizome — PolyPhy MCPM calibration against the Wilde et al. SDSS cube

  Sibling to `verification/`. Lives inside the [`rulkens/PolyPhy`](https://github.com/rulkens/PolyPhy)
  fork on branch `rhizome-sdss-calibration`. Companion to skymap's spec
  [`2026-05-12-rhizome-cosmic-web-volume-design.md`](https://github.com/rulkens/skymap/blob/main/docs/superpowers/specs/2026-05-12-rhizome-cosmic-web-volume-design.md).

  ## What this is

  A four-script Python pipeline that reproduces the **SDSS_z_44-476mpc**
  MCPM cube from Wilde et al. 2023 (the cube skymap currently ships as
  `mcpm-large.scfd`) by running this PolyPhy fork on skymap's own SDSS
  catalog. The goal is to lock in MCPM parameter values that match the
  published recipe; once locked, those same parameters will be applied
  unchanged to full-sky 2MRS+GLADE inputs in a later milestone.

  See [`CALIBRATION.md`](./CALIBRATION.md) for the parameter sweep log
  and the locked-in final values.

  ## Why inside the PolyPhy fork (not a separate repo)

  - One repo, one branch, one venv, zero cross-repo coordination.
  - Reuses the `verification/.venv/` proven working on Apple Silicon Metal.
  - Calibration timeline is citable as a single fork branch (paper appendix).

  No skymap-side code is touched by this calibration. Skymap's only role
  is hosting `sdss-large.bin` and `mcpm_sdss_d2.npy` on R2; the scripts
  here `curl` both at runtime.

  ## Setup

  Reuses the verification venv at `verification/.venv/` (Python 3.10.20,
  Taichi 1.6.0, NumPy 1.22.0, Matplotlib 3.5.3 — pinned, no `pip install`
  needed if you already ran `verification/`'s setup):

  ```bash
  # From fork root. If verification/.venv/ doesn't exist, run verification/'s
  # setup steps first (see verification/README.md).
  verification/.venv/bin/python --version  # → Python 3.10.20
  ```

  ## Running the full calibration loop

  ```bash
  # 1. Build the CSV input from skymap's SDSS catalog (fetches sdss-large.bin
  #    from R2 if cache/ is empty).
  verification/.venv/bin/python rhizome/buildRhizomeInput.py

  # 2. Run PolyPhy with the currently-frozen calibration parameters.
  verification/.venv/bin/python rhizome/runRhizomePolyphy.py \
      --input rhizome/cache/sdss_calibration.csv \
      --output rhizome/output/sdss_reproduced.npy

  # 3. Fetch the reference cube (idempotent).
  mkdir -p rhizome/reference
  curl -o rhizome/reference/mcpm_sdss_d2.npy \
      https://skymap-data.rulkens.com/data/raw/mcpm/mcpm_sdss_d2.npy

  # 4. Compare reproduced vs reference.
  verification/.venv/bin/python rhizome/compareCubes.py \
      --reproduced rhizome/output/sdss_reproduced.npy \
      --reference rhizome/reference/mcpm_sdss_d2.npy \
      --out rhizome/calibration/iter5_lockin/
  ```

  Wall-clock: ~30 s for step 2 on Apple Silicon Metal at the locked-in
  parameter set; step 1 dominated by the R2 download on first run.

  ## Running the tests

  ```bash
  verification/.venv/bin/pytest rhizome/tests/ --no-cov
  ```

  `--no-cov` is required because PolyPhy's `setup.cfg` enforces `--cov src`
  in its top-level pytest config; our tests don't import from `src/polyphy/`
  and would fail the coverage gate. We pass the explicit `rhizome/tests/`
  path to override `testpaths = tests`. No edits to PolyPhy's pytest config.

  ## Repository layout

  | Path | Purpose |
  |---|---|
  | `skymapBinDecoder.py` | Port of skymap's v4 PointCloud decoder (binary format from `pointCloudFormat.ts`) |
  | `buildRhizomeInput.py` | Curl `sdss-large.bin` from R2, decode, filter to 44–476 Mpc shell, write CSV |
  | `runRhizomePolyphy.py` | Subprocess wrapper around PolyPhy 3d_discrete; `RhizomeParams` lives here |
  | `compareCubes.py` | Pearson correlation + max-projection PNG between reproduced and reference cube |
  | `CANDIDATE_PARAMETERS.md` | Literature-research starting parameter set (Task 2) |
  | `CALIBRATION.md` | Iteration-by-iteration tuning log + locked-in final parameter set |
  | `calibration/` | Per-iteration artefacts (`iter0_baseline/`, `iter1_*/`, etc.) + `sources/` |
  | `tests/` | pytest unit tests for the deterministic pieces |
  | `cache/` (gitignored) | `sdss-large.bin` and `sdss_calibration.csv` |
  | `reference/` (gitignored) | `mcpm_sdss_d2.npy` |
  | `output/` (gitignored) | `sdss_reproduced.npy` + sidecar JSON |
  ```

- [ ] **Step 6: Initial commit**

  ```bash
  cd ~/Development/vendor/python/PolyPhy
  git add rhizome/.gitignore rhizome/README.md \
          rhizome/tests/__init__.py \
          rhizome/cache/.gitkeep rhizome/reference/.gitkeep \
          rhizome/output/.gitkeep rhizome/calibration/.gitkeep
  git commit -m "$(cat <<'EOF'
  chore(rhizome): scaffold calibration directory

  Sibling to verification/. Reuses verification/.venv/ — no new venv.
  Empty directory tree + README + .gitignore; scripts land in follow-up
  commits as the SDSS calibration milestone takes shape.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

  Verify with `git log --format='%an <%ae>' -1` that the author is the user (Alexander Rulkens), not Claude. If it's wrong, halt and surface to user — do NOT `git commit --amend --author=...`.

---

## Task 2: Wilde et al. parameter research

**This task is mostly non-coding.** It produces a parameter table that Task 5 codifies as a frozen `RhizomeParams` dataclass. Search the literature, the Cosmic Slime VAC metadata, and PolyPhy's own defaults for explicit values.

The point of this research is to **start the iteration loop as close to the published recipe as possible**, not to find values that we can apply unmodified. If the literature gives us nothing, we fall back to PolyPhy's auto-derived defaults (currently `sense_distance ≈ 0.005 × DOMAIN_SIZE_MAX`, `step_size ≈ 0.0005 × DOMAIN_SIZE_MAX` — verify against the current HEAD of `src/polyphy/core/discrete3D.py` since "currently undergoing refactoring" per PolyPhy's README).

**Sources to check (in order of expected yield):**

1. **Wilde et al. 2023 ApJ "A Galaxy's Place in the Universe..."** — arXiv:2301.02719. Read Methods + any appendix detailing the MCPM run that produced the Cosmic Slime VAC. Search for "sensing distance", "step size", "iterations", "agents".
2. **Burchett et al. 2020 ApJ "Revealing the Dark Threads of the Cosmic Web"** — arXiv:2007.04339. Original Polyphorm cosmic-web paper; appendix likely has the most explicit parameter table.
3. **Elek et al. 2022 "Monte Carlo Physarum Machine"** — MIT Press *Artificial Life*. Algorithm characterisation with explicit parameter discussion.
4. **Cosmic Slime VAC `export_metadata.txt`** — `https://data.sdss.org/sas/dr17/env/EBOSS_LSS/mcpm/v1_0_1/datacube/SDSS_z_44-476mpc/export_metadata.txt`.
5. **Polyphorm GitHub `CreativeCodingLab/Polyphorm`** — README + any `.build`/`.config` files committed alongside binary releases. Look for `polyphorm.build` files in releases — those are the exact parameter records the published cubes were rendered from.
6. **PolyPhy's current HEAD defaults** — fall back to whatever `core/common.py` + `core/discrete3D.py` set in the active branch's source tree.

**Parameters to find values (or starting guesses) for:**

| PolyPhy CLI flag | PPConfig field | Meaning | Default origin |
|---|---|---|---|
| `-n` | `num_iterations` | Total MCPM iterations | Must specify with `-b` |
| `-t` | `TRACE_RESOLUTION_MAX` | Largest axis of output trace cube | `512` (smoke test); we set `256` |
| `-d` | `sense_distance` (pixels) | Agent sensor reach | auto-derived from `DOMAIN_SIZE_MAX` |
| `-a` | `sense_angle` (degrees) | Sensor cone half-angle | from `common.py` defaults |
| `-s` | `step_size` (pixels) | Agent forward step per iter | auto-derived from `DOMAIN_SIZE_MAX` |
| `-X` | `deposit_attenuation` | Deposit field decay rate | from `common.py` defaults |
| `-T` | `trace_attenuation` | Trace field decay rate | from `common.py` defaults |
| `-e` | `sampling_exponent` | Data-deposit sampling exponent | from `common.py` defaults |
| `-m` | `DOMAIN_MARGIN` | Padding factor around input bbox | from `common.py` defaults |
| `--distance-distribution` | enum | constant / exponential / maxwell-boltzmann | from `common.py` defaults |
| `--directional-distribution` | enum | discrete / cone | from `common.py` defaults |
| `--directional-mutation` | enum | deterministic / stochastic | from `common.py` defaults |
| `--deposit-fetching` | enum | nearest-neighbor / noise-perturbed-NN | from `common.py` defaults |
| `--agent-boundary-handling` | enum | wrap-around / re-initialize-center / re-initialize-randomly | from `common.py` defaults |

(`-D` / `-A` are typed as `str` in `cli_helper.py` and route through `EnumDataDeposit` / `EnumAgentDeposit`. They are not currently sweepable — leave at PolyPhy defaults.)

- [ ] **Step 1: Capture PolyPhy's own defaults**

  Use the `Read` tool to inspect `~/Development/vendor/python/PolyPhy/src/polyphy/core/common.py` and `src/polyphy/core/discrete3D.py` on the current `rhizome-sdss-calibration` branch HEAD. Record literal numeric defaults for every field in the table into `~/Development/vendor/python/PolyPhy/rhizome/calibration/sources/polyphy_defaults.txt`. Quote line:column citations so the source can be re-verified after upstream rebases. This file is your **floor**: if literature search produces nothing, start here.

- [ ] **Step 2: Search the Wilde et al. 2023 paper**

  Use `WebFetch` on `https://arxiv.org/abs/2301.02719`. Read in full. Quote any sentence mentioning a parameter value into `rhizome/calibration/sources/wilde_2023_quotes.txt`. If nothing — write that conclusion explicitly into the file with the prompt phrasing you used.

- [ ] **Step 3: Search the Burchett et al. 2020 paper**

  Same procedure on `https://arxiv.org/abs/2007.04339`. Capture into `rhizome/calibration/sources/burchett_2020_quotes.txt`.

- [ ] **Step 4: Search the Elek et al. 2022 MCPM characterisation**

  Use `WebSearch` to find the open-access PDF (MIT Press *Artificial Life*, "Monte Carlo Physarum Machine"). `WebFetch` the PDF. Capture into `rhizome/calibration/sources/elek_2022_quotes.txt`. This paper is the methods reference and most likely to give explicit recommended ranges.

- [ ] **Step 5: Search the Polyphorm release artefacts**

  `WebFetch` `https://github.com/CreativeCodingLab/Polyphorm` and the latest release page. Look for `polyphorm.build`, `default.cfg`, or any text shipped with the binaries. Capture into `rhizome/calibration/sources/polyphorm_release_notes.txt`.

- [ ] **Step 6: Re-fetch the SDSS VAC metadata**

  `WebFetch` `https://data.sdss.org/sas/dr17/env/EBOSS_LSS/mcpm/v1_0_1/datacube/SDSS_z_44-476mpc/export_metadata.txt`. Save verbatim to `rhizome/calibration/sources/sdss_vac_metadata.txt`.

- [ ] **Step 7: Synthesise the starting parameter set**

  Use the `Write` tool to create `~/Development/vendor/python/PolyPhy/rhizome/CANDIDATE_PARAMETERS.md`. For each row in the table above, pick a value with reasoning. Format per parameter:

  ```markdown
  ## sense_distance

  **Value:** `0.005 × DOMAIN_SIZE_MAX` (≈ 4.7 Mpc for the 938-Mpc-wide SDSS volume)

  **Source:** PolyPhy `core/discrete3D.py:<line>` auto-derive. No explicit value
  found in Wilde et al., Burchett et al., or Elek et al. — papers describe it
  qualitatively as "comparable to the typical inter-galaxy spacing."

  **Confidence:** medium (consistent with paper's qualitative description, but
  Burchett/Wilde may have tuned away from default).
  ```

  …and so on for every parameter.

- [ ] **Step 8: Commit the research artefacts**

  ```bash
  cd ~/Development/vendor/python/PolyPhy
  git add rhizome/calibration/sources/ rhizome/CANDIDATE_PARAMETERS.md
  git commit -m "$(cat <<'EOF'
  rhizome(calibration): capture starting parameter set from literature + PolyPhy defaults

  Research pass through Wilde et al. 2023, Burchett et al. 2020, Elek et al.
  2022, the Polyphorm release notes, and the SDSS Cosmic Slime VAC metadata.
  Few explicit numeric values published; the candidate set defaults to
  PolyPhy's auto-derived constants for sense_distance / step_size and to
  PPConfig defaults for everything else. Confidence per parameter recorded
  in CANDIDATE_PARAMETERS.md.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

  **STOP-and-check gate.** Show the user `CANDIDATE_PARAMETERS.md`. If they want to manually override any value (e.g. "the Burchett paper used 8° sensing angle"), capture that into the file and amend with a new commit (do NOT `git commit --amend`; create a fresh commit) before proceeding to Task 3.

---

## Task 3: `skymapBinDecoder.py` — port the v4 PointCloud decoder

A ~50-line Python port of skymap's `src/data/pointCloudFormat.ts:decodePointCloud`. Reads raw bytes and returns a dict of NumPy arrays mirroring the TypeScript `PointCloud` shape. **TDD-shaped.**

**Files:**
- Create: `rhizome/skymapBinDecoder.py`
- Create: `rhizome/tests/test_skymap_bin_decoder.py`

- [ ] **Step 1: Write the failing test first**

  Use the `Write` tool to create `~/Development/vendor/python/PolyPhy/rhizome/tests/test_skymap_bin_decoder.py`:

  ```python
  """Round-trip test for the v4 PointCloud decoder.

  We hand-build a v4 buffer in pure Python (matching the byte layout
  documented in skymap's src/data/pointCloudFormat.ts) and verify the decoder
  recovers the expected values. The encoder lives in the skymap repo and is
  itself unit-tested there — we only need to confirm our Python reader sees
  the same bytes the TypeScript writer emits.
  """
  import struct
  import sys
  from pathlib import Path

  # Make rhizome/ importable for `from skymapBinDecoder import ...` regardless
  # of cwd. (pytest collected from rhizome/tests/ doesn't auto-add the parent.)
  sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

  import numpy as np
  import pytest

  from skymapBinDecoder import decode_point_cloud, MAGIC, VERSION


  def build_v4_buffer(points):
      """Construct a v4 .bin buffer from a list of point dicts."""
      header = struct.pack('<IIII', MAGIC, VERSION, len(points), 0)
      records = b''
      for p in points:
          # objID (u64), x/y/z (f32 x3), magU/G/R/I/Z (f32 x5),
          # axisRatio (f32), positionAngleDeg (f32), diameterKpc (f32),
          # 12 bytes padding.
          records += struct.pack(
              '<Qfffffffffff12x',
              p['objID'],
              p['x'], p['y'], p['z'],
              p['magU'], p['magG'], p['magR'], p['magI'], p['magZ'],
              p['axisRatio'], p['positionAngleDeg'], p['diameterKpc'],
          )
      return header + records


  def test_round_trip_two_points():
      points = [
          dict(objID=12345, x=1.5, y=-2.0, z=3.25,
               magU=18.0, magG=17.5, magR=17.0, magI=16.8, magZ=16.5,
               axisRatio=0.7, positionAngleDeg=45.0, diameterKpc=30.0),
          dict(objID=67890, x=-10.0, y=20.0, z=-30.0,
               magU=19.0, magG=18.5, magR=18.0, magI=17.8, magZ=17.5,
               axisRatio=0.9, positionAngleDeg=120.0, diameterKpc=42.0),
      ]
      buf = build_v4_buffer(points)
      result = decode_point_cloud(buf)
      assert result['count'] == 2
      np.testing.assert_array_equal(result['objIDs'], [12345, 67890])
      np.testing.assert_allclose(
          result['positions'].reshape(-1, 3),
          [[1.5, -2.0, 3.25], [-10.0, 20.0, -30.0]],
      )
      np.testing.assert_allclose(result['magR'], [17.0, 18.0])
      np.testing.assert_allclose(result['diameterKpc'], [30.0, 42.0])


  def test_rejects_bad_magic():
      buf = struct.pack('<IIII', 0xDEADBEEF, VERSION, 0, 0)
      with pytest.raises(ValueError, match='bad magic'):
          decode_point_cloud(buf)


  def test_rejects_old_version():
      buf = struct.pack('<IIII', MAGIC, 3, 0, 0)
      with pytest.raises(ValueError, match='unsupported version'):
          decode_point_cloud(buf)


  def test_rejects_truncated_buffer():
      # Header claims 5 points but only 1 record's worth of bytes follow.
      buf = struct.pack('<IIII', MAGIC, VERSION, 5, 0) + b'\x00' * 64
      with pytest.raises(ValueError, match='truncated'):
          decode_point_cloud(buf)
  ```

- [ ] **Step 2: Run the test to confirm it fails**

  ```bash
  cd ~/Development/vendor/python/PolyPhy
  verification/.venv/bin/pytest rhizome/tests/test_skymap_bin_decoder.py --no-cov
  ```

  Expected: `ModuleNotFoundError: No module named 'skymapBinDecoder'`.

- [ ] **Step 3: Write the decoder**

  Use the `Write` tool to create `~/Development/vendor/python/PolyPhy/rhizome/skymapBinDecoder.py`:

  ```python
  """Python port of skymap's v4 PointCloud binary decoder.

  Source of truth: skymap/src/data/pointCloudFormat.ts — keep these two files
  in lock-step. The v4 format is 16-byte header + 64-byte per-point record.
  See the TypeScript docblock for the full field layout.

  Why a port rather than calling out to Node? Avoiding the Node dep keeps
  this directory Python-only. The decode is trivial enough (one struct.unpack
  via a NumPy structured dtype) that the port costs less than the toolchain
  integration would.
  """
  import struct
  from typing import TypedDict

  import numpy as np

  # "SKMP" as little-endian uint32 — same constant as pointCloudFormat.ts:62.
  MAGIC = 0x504D4B53
  VERSION = 4
  HEADER_BYTES = 16
  BYTES_PER_POINT = 64


  class PointCloud(TypedDict):
      count: int
      objIDs: np.ndarray            # uint64, shape (N,)
      positions: np.ndarray         # float32, shape (3N,) — x0,y0,z0,x1,y1,z1,...
      magU: np.ndarray              # float32, shape (N,)
      magG: np.ndarray
      magR: np.ndarray
      magI: np.ndarray
      magZ: np.ndarray
      axisRatio: np.ndarray
      positionAngleDeg: np.ndarray
      diameterKpc: np.ndarray


  def decode_point_cloud(buf: bytes) -> PointCloud:
      """Decode a v4 .bin buffer into a dict of NumPy arrays."""
      if len(buf) < HEADER_BYTES:
          raise ValueError(f'buffer too short ({len(buf)} bytes) for header')
      magic, version, count, _reserved = struct.unpack('<IIII', buf[:HEADER_BYTES])
      if magic != MAGIC:
          raise ValueError(f'bad magic 0x{magic:08x} — not a SKMP file')
      if version != VERSION:
          raise ValueError(
              f'unsupported version {version} — expected {VERSION}; '
              f'regenerate via skymap\'s "npm run build-all"')

      expected = HEADER_BYTES + count * BYTES_PER_POINT
      if len(buf) < expected:
          raise ValueError(f'truncated buffer: have {len(buf)} bytes, need {expected}')

      # Build per-field arrays by viewing the buffer through a structured dtype.
      # NumPy aliases without copying; per-field access copies for safety.
      record_dtype = np.dtype([
          ('objID', '<u8'),
          ('x', '<f4'), ('y', '<f4'), ('z', '<f4'),
          ('magU', '<f4'), ('magG', '<f4'), ('magR', '<f4'),
          ('magI', '<f4'), ('magZ', '<f4'),
          ('axisRatio', '<f4'),
          ('positionAngleDeg', '<f4'),
          ('diameterKpc', '<f4'),
          ('_padding', '<u1', 12),
      ])
      assert record_dtype.itemsize == BYTES_PER_POINT, 'dtype size mismatch'

      records = np.frombuffer(buf, dtype=record_dtype, count=count, offset=HEADER_BYTES)
      positions = np.empty(count * 3, dtype=np.float32)
      positions[0::3] = records['x']
      positions[1::3] = records['y']
      positions[2::3] = records['z']

      return {
          'count': int(count),
          'objIDs': records['objID'].copy(),
          'positions': positions,
          'magU': records['magU'].copy(),
          'magG': records['magG'].copy(),
          'magR': records['magR'].copy(),
          'magI': records['magI'].copy(),
          'magZ': records['magZ'].copy(),
          'axisRatio': records['axisRatio'].copy(),
          'positionAngleDeg': records['positionAngleDeg'].copy(),
          'diameterKpc': records['diameterKpc'].copy(),
      }
  ```

- [ ] **Step 4: Re-run tests, confirm pass**

  ```bash
  cd ~/Development/vendor/python/PolyPhy
  verification/.venv/bin/pytest rhizome/tests/test_skymap_bin_decoder.py --no-cov -v
  ```

  Expected: all four tests pass.

- [ ] **Step 5: Commit**

  ```bash
  cd ~/Development/vendor/python/PolyPhy
  git add rhizome/skymapBinDecoder.py rhizome/tests/test_skymap_bin_decoder.py
  git commit -m "$(cat <<'EOF'
  rhizome: port skymap's v4 PointCloud decoder to Python

  Reads .bin files emitted by skymap's encodePointCloud (TypeScript).
  Uses a NumPy structured dtype for zero-loop bulk decode of the 64-byte
  per-point records. Tests cover round-trip, bad magic, version rejection,
  and truncation. Stays in lock-step with src/data/pointCloudFormat.ts in
  the skymap repo.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 4: `buildRhizomeInput.py` — fetch + filter SDSS to the calibration shell

Curls `sdss-large.bin` from R2 (idempotent — skip if file present with expected size), decodes via `skymapBinDecoder`, filters to the Wilde et al. 44–476 Mpc comoving-distance shell, writes `rhizome/cache/sdss_calibration.csv` for PolyPhy. **TDD-shaped.**

**Coordinate frame:** Skymap's `.bin` stores positions in supergalactic Cartesian Mpc. The Wilde et al. cube was built in *equatorial* Cartesian (the VAC ships in J2000 RA/Dec/redshift space). For the calibration we want to reproduce the **spatial structure** visible in the reference cube, not match its frame — PolyPhy is frame-agnostic and the comparison harness operates on each cube's intrinsic axes via max-projection.

**Distance filter:** Skymap stores `(x, y, z)` in supergalactic Cartesian Mpc with observer at origin, so `sqrt(x² + y² + z²)` is exactly the comoving distance. No cosmology helper needed.

**No corner anchor points:** the reference cube is non-cubic (712 × 1200 × 728). A faithful reproduction must be non-cubic too, so we let PolyPhy auto-fit its bounding box to the input galaxies. Anchor-pinning to a cubic AABB is a rhizome-shell concern for a later plan.

**Output CSV format (matches `verification/make_blobs.py` exactly):** `x,y,z,weight` per row, comma-separated, no header, 6 decimal places, weight `1.0` for all rows.

**Files:**
- Create: `rhizome/buildRhizomeInput.py`
- Create: `rhizome/tests/test_build_rhizome_input.py`

- [ ] **Step 1: Write the failing test**

  Use the `Write` tool to create `~/Development/vendor/python/PolyPhy/rhizome/tests/test_build_rhizome_input.py`:

  ```python
  """Test the SDSS calibration shell filter, CSV writer, and idempotent fetch."""
  import struct
  import sys
  from pathlib import Path

  sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

  import numpy as np
  import pytest

  from buildRhizomeInput import (
      filter_calibration_shell,
      write_polyphy_csv,
      fetch_sdss_bin_if_missing,
      CALIBRATION_D_MIN_MPC,
      CALIBRATION_D_MAX_MPC,
  )
  from skymapBinDecoder import MAGIC, VERSION


  def _make_cloud(positions_mpc):
      """Build a tiny v4 .bin from a list of (x, y, z) tuples."""
      n = len(positions_mpc)
      header = struct.pack('<IIII', MAGIC, VERSION, n, 0)
      body = b''
      for i, (x, y, z) in enumerate(positions_mpc):
          body += struct.pack(
              '<Qfffffffffff12x',
              i,  # objID
              x, y, z,
              18.0, 17.5, 17.0, 16.8, 16.5,  # mags
              0.7, 45.0, 30.0,  # axisRatio, PA, diameter
          )
      return header + body


  def test_filter_keeps_shell_only():
      points = [
          (43.0, 0.0, 0.0),     # 43 Mpc — below shell
          (200.0, 0.0, 0.0),    # 200 Mpc — in shell
          (0.0, 300.0, 0.0),    # 300 Mpc — in shell
          (500.0, 0.0, 0.0),    # 500 Mpc — above shell
          (44.0, 0.0, 0.0),     # exactly d_min — kept (inclusive)
          (476.0, 0.0, 0.0),    # exactly d_max — kept (inclusive)
      ]
      buf = _make_cloud(points)
      kept = filter_calibration_shell(buf, d_min=44.0, d_max=476.0)
      assert kept.shape == (4, 3)
      # Order preserved.
      np.testing.assert_allclose(kept[:, 0], [200.0, 0.0, 44.0, 476.0])


  def test_filter_uses_published_defaults():
      assert CALIBRATION_D_MIN_MPC == pytest.approx(44.0)
      assert CALIBRATION_D_MAX_MPC == pytest.approx(476.0)


  def test_csv_round_trip(tmp_path: Path):
      pts = np.array([[1.5, 2.5, 3.5], [10.0, -20.0, 30.0]], dtype=np.float32)
      csv_path = tmp_path / 'out.csv'
      write_polyphy_csv(pts, csv_path)
      content = csv_path.read_text()
      lines = content.strip().split('\n')
      assert len(lines) == 2
      # Format: x,y,z,1.000000
      first = lines[0].split(',')
      assert len(first) == 4
      assert float(first[0]) == pytest.approx(1.5)
      assert float(first[3]) == pytest.approx(1.0)
      # 6 decimal places.
      assert '.' in first[0] and len(first[0].split('.')[1]) == 6


  def test_fetch_skips_when_present(tmp_path: Path, monkeypatch):
      """If the cache file already exists, fetch_sdss_bin_if_missing must not download."""
      cache = tmp_path / 'sdss-large.bin'
      cache.write_bytes(b'pretend this is a valid bin')

      def fail_urlretrieve(*args, **kwargs):
          raise AssertionError('should not have fetched')

      import urllib.request
      monkeypatch.setattr(urllib.request, 'urlretrieve', fail_urlretrieve)

      fetch_sdss_bin_if_missing(cache)  # must not raise
  ```

- [ ] **Step 2: Confirm test fails**

  ```bash
  cd ~/Development/vendor/python/PolyPhy
  verification/.venv/bin/pytest rhizome/tests/test_build_rhizome_input.py --no-cov
  ```

  Expected: `ImportError`.

- [ ] **Step 3: Write `buildRhizomeInput.py`**

  Use the `Write` tool to create `~/Development/vendor/python/PolyPhy/rhizome/buildRhizomeInput.py`:

  ```python
  #!/usr/bin/env python3
  """buildRhizomeInput.py — produce PolyPhy CSV input from skymap's SDSS catalog.

  Current scope: SDSS calibration shell only. Idempotently fetches
  `sdss-large.bin` from R2, decodes via skymapBinDecoder, filters to the
  44–476 Mpc comoving-distance shell matching Wilde et al. 2023's
  `SDSS_z_44-476mpc` cube, writes `rhizome/cache/sdss_calibration.csv`
  ready for PolyPhy's `-f` flag.

  Why no anchor points: the reference cube we're reproducing is non-cubic
  (712 x 1200 x 728). We let PolyPhy auto-fit its bounding box to the input
  galaxies, which produces a similarly non-cubic output. Anchor-pinning to
  a cubic AABB is a rhizome-shell concern for later plans.

  Why no SDSS-frame transform: skymap stores positions in supergalactic
  Cartesian Mpc; the Wilde cube was built in equatorial Cartesian. Frames
  differ but the cosmic structure is the same; the calibration's comparison
  is per-axis max-projection on each cube's intrinsic axes.
  """
  import argparse
  import sys
  import urllib.request
  from pathlib import Path

  import numpy as np

  from skymapBinDecoder import decode_point_cloud


  # Wilde et al. 2023 Cosmic Slime VAC: comoving distance shell in Mpc.
  # Source: SDSS DR17 VAC `SDSS_z_44-476mpc` directory naming.
  CALIBRATION_D_MIN_MPC = 44.0
  CALIBRATION_D_MAX_MPC = 476.0

  SDSS_BIN_URL = 'https://skymap-data.rulkens.com/data/sdss-large.bin'


  def fetch_sdss_bin_if_missing(dest: Path) -> None:
      """Download sdss-large.bin from R2 to `dest` if it's not already present.

      Idempotent: if `dest` exists and is non-empty, do nothing. We trust that
      R2 isn't going to change the file under us (it's content-addressed by
      the skymap build pipeline). If a partial download exists, delete it
      manually before re-running.
      """
      if dest.exists() and dest.stat().st_size > 0:
          print(f'sdss-large.bin already cached at {dest} ({dest.stat().st_size} bytes)')
          return
      dest.parent.mkdir(parents=True, exist_ok=True)
      print(f'Downloading {SDSS_BIN_URL} → {dest}')
      urllib.request.urlretrieve(SDSS_BIN_URL, dest)
      print(f'Cached {dest.stat().st_size} bytes')


  def filter_calibration_shell(
      buf: bytes,
      *,
      d_min: float = CALIBRATION_D_MIN_MPC,
      d_max: float = CALIBRATION_D_MAX_MPC,
  ) -> np.ndarray:
      """Decode a skymap .bin and return an (N, 3) float32 array of positions
      whose comoving distance from origin is in [d_min, d_max], inclusive.

      The observer is at the origin in skymap's supergalactic Cartesian frame,
      so |position| is exactly the comoving distance. No cosmology helper
      required. Order of input galaxies is preserved in the output.
      """
      cloud = decode_point_cloud(buf)
      pos = cloud['positions'].reshape(-1, 3)
      r = np.linalg.norm(pos, axis=1)
      mask = (r >= d_min) & (r <= d_max)
      return pos[mask].astype(np.float32, copy=False)


  def write_polyphy_csv(positions_mpc: np.ndarray, path: Path) -> None:
      """Write an (N, 3) position array as a PolyPhy 3D-discrete CSV.

      Format: `x,y,z,weight` per line, no header, 6 decimal places, weight = 1.0
      for all rows. Matches the verification handoff's `make_blobs.py` output
      exactly so PolyPhy's CSV parser doesn't need to second-guess us.
      """
      if positions_mpc.ndim != 2 or positions_mpc.shape[1] != 3:
          raise ValueError(f'expected (N, 3) array, got {positions_mpc.shape}')
      path.parent.mkdir(parents=True, exist_ok=True)
      weights = np.ones((positions_mpc.shape[0], 1), dtype=np.float32)
      data = np.hstack([positions_mpc, weights])
      np.savetxt(path, data, fmt='%.6f', delimiter=',')


  def main() -> int:
      parser = argparse.ArgumentParser(
          description='Fetch + filter skymap SDSS to a PolyPhy CSV input')
      parser.add_argument('--bin', type=Path,
                          default=Path('rhizome/cache/sdss-large.bin'),
                          help='Cache path for sdss-large.bin (fetched if missing)')
      parser.add_argument('--out', type=Path,
                          default=Path('rhizome/cache/sdss_calibration.csv'),
                          help='Output CSV path')
      args = parser.parse_args()

      fetch_sdss_bin_if_missing(args.bin)
      buf = args.bin.read_bytes()
      positions = filter_calibration_shell(buf)
      total = (len(buf) - 16) // 64
      print(f'Kept {positions.shape[0]} of {total} galaxies in the '
            f'{CALIBRATION_D_MIN_MPC}-{CALIBRATION_D_MAX_MPC} Mpc shell')
      write_polyphy_csv(positions, args.out)
      print(f'Wrote {args.out}')
      return 0


  if __name__ == '__main__':
      sys.exit(main())
  ```

- [ ] **Step 4: Run tests, confirm pass**

  ```bash
  cd ~/Development/vendor/python/PolyPhy
  verification/.venv/bin/pytest rhizome/tests/test_build_rhizome_input.py --no-cov -v
  ```

  Expected: all four tests pass.

- [ ] **Step 5: Dry-run against the real R2 bin**

  ```bash
  cd ~/Development/vendor/python/PolyPhy
  verification/.venv/bin/python rhizome/buildRhizomeInput.py
  ```

  Expected:
  - First run: downloads ~150 MB to `rhizome/cache/sdss-large.bin`.
  - Reports on the order of 300k galaxies kept (Wilde et al. used 324,849; ours may differ because skymap's SDSS CSV is a different SkyServer SQL extraction — see the SDSS gotcha in skymap's CLAUDE.md).
  - Writes `rhizome/cache/sdss_calibration.csv`. Inspect the first few lines:
    ```bash
    head rhizome/cache/sdss_calibration.csv
    ```
    Each line should look like `123.456789,-67.890123,234.567890,1.000000`.
  - Second run (re-invoke the same command): logs "already cached", does not re-download.

- [ ] **Step 6: Commit**

  ```bash
  cd ~/Development/vendor/python/PolyPhy
  git add rhizome/buildRhizomeInput.py rhizome/tests/test_build_rhizome_input.py
  git commit -m "$(cat <<'EOF'
  rhizome: fetch + filter SDSS to calibration shell CSV

  Idempotently downloads sdss-large.bin from R2 (skips if cached), decodes
  via skymapBinDecoder, filters to the 44-476 Mpc comoving shell matching
  Wilde et al. 2023's SDSS_z_44-476mpc reference cube. Uniform weights;
  no anchor pinning (reference cube is non-cubic so we let PolyPhy auto-fit
  the bbox). Tested with synthetic v4 buffers + monkeypatched urlretrieve.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 5: `runRhizomePolyphy.py` — orchestrator with `RhizomeParams`

A subprocess wrapper around PolyPhy's CLI. The frozen `RhizomeParams` dataclass lives at the top of this file; Task 8 mutates the locked-in `CALIBRATION_PARAMS` instance as iterations converge. The orchestrator:

1. Removes `/tmp/flag` defensively (CPU-force sentinel).
2. Hashes the input CSV (sidecar reproducibility).
3. Stages the CSV under `data/csv/` relative to the fork root (PolyPhy resolves `-f` from `ROOT='../../'` = the fork root).
4. Archives any stale `data/fits/trace_*.npy` so the "newest after run" glob is unambiguous.
5. Records start time, runs `python polyphy.py 3d_discrete -b ...` via `subprocess.run(cwd=fork_root / 'src' / 'polyphy')`.
6. Globs for `trace_*.npy` files with `mtime > start_time` — that's the new output.
7. Validates shape (4D with trailing 1) and dtype (float32), squeezes the channel axis, writes `output/sdss_reproduced.npy` + sidecar JSON.

**TDD where it pays:** the pure functions (`build_cli_args`, `find_new_trace`, `squeeze_and_save`, sidecar writer) get unit tests. The subprocess invocation itself is exercised end-to-end in Task 7 and not mock-tested — mocking `subprocess.run` would prove nothing about whether PolyPhy actually accepts our flags.

**Files:**
- Create: `rhizome/runRhizomePolyphy.py`
- Create: `rhizome/tests/test_run_rhizome_polyphy.py`

- [ ] **Step 1: Write the failing test**

  Use the `Write` tool to create `~/Development/vendor/python/PolyPhy/rhizome/tests/test_run_rhizome_polyphy.py`:

  ```python
  """Unit tests for the pure helpers in runRhizomePolyphy.py."""
  import json
  import sys
  import time
  from pathlib import Path

  sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

  import numpy as np
  import pytest

  from runRhizomePolyphy import (
      RhizomeParams,
      build_cli_args,
      find_new_trace,
      squeeze_and_save,
      write_sidecar,
      hash_file,
  )


  def test_params_are_frozen():
      p = RhizomeParams()
      with pytest.raises(Exception):
          p.num_iterations = 9999  # type: ignore[misc]


  def test_build_cli_args_includes_required_flags():
      params = RhizomeParams(num_iterations=500, trace_res_max=256,
                             sense_distance_frac=0.01, step_size_frac=0.001,
                             sensing_angle_deg=20.0)
      args = build_cli_args(params, Path('data/csv/foo.csv'))
      assert '3d_discrete' in args
      assert '-b' in args
      assert '-n' in args and '500' in args
      assert '-t' in args and '256' in args
      assert '-f' in args and 'data/csv/foo.csv' in args
      # sense_distance_px = 0.01 * 256 = 2.56
      assert '-d' in args
      d_idx = args.index('-d')
      assert float(args[d_idx + 1]) == pytest.approx(2.56)
      # step_size_px = 0.001 * 256 = 0.256
      assert '-s' in args
      s_idx = args.index('-s')
      assert float(args[s_idx + 1]) == pytest.approx(0.256)
      # sensing_angle passes through.
      assert '-a' in args
      a_idx = args.index('-a')
      assert float(args[a_idx + 1]) == pytest.approx(20.0)


  def test_find_new_trace_returns_latest_after_start(tmp_path: Path):
      old = tmp_path / 'trace_2026-01-01_00-00-00.npy'
      old.write_bytes(b'old')
      start = time.time()
      # Sleep just past the filesystem mtime granularity (typically 1s on macOS HFS+,
      # ~10ms on APFS).
      time.sleep(0.05)
      new = tmp_path / 'trace_2026-05-12_12-00-00.npy'
      new.write_bytes(b'new')

      found = find_new_trace(tmp_path, start)
      assert found == new


  def test_find_new_trace_raises_if_none(tmp_path: Path):
      start = time.time()
      with pytest.raises(RuntimeError, match='no new trace'):
          find_new_trace(tmp_path, start)


  def test_squeeze_and_save_4d_to_3d(tmp_path: Path):
      cube_4d = np.ones((4, 5, 6, 1), dtype=np.float32)
      src = tmp_path / 'raw.npy'
      dst = tmp_path / 'out.npy'
      np.save(src, cube_4d)
      result = squeeze_and_save(src, dst)
      assert result.shape == (4, 5, 6)
      reloaded = np.load(dst)
      assert reloaded.shape == (4, 5, 6)
      assert reloaded.dtype == np.float32


  def test_squeeze_and_save_rejects_unexpected_shape(tmp_path: Path):
      cube_2d = np.ones((4, 5), dtype=np.float32)
      src = tmp_path / 'raw.npy'
      np.save(src, cube_2d)
      with pytest.raises(RuntimeError, match='unexpected trace cube shape'):
          squeeze_and_save(src, tmp_path / 'out.npy')


  def test_write_sidecar_round_trip(tmp_path: Path):
      params = RhizomeParams()
      input_csv = tmp_path / 'input.csv'
      input_csv.write_text('1.0,2.0,3.0,1.0\n')
      out = tmp_path / 'out.npy'
      out.write_bytes(b'fake')

      write_sidecar(
          out, params=params, input_csv=input_csv,
          cube_shape=(256, 256, 256), elapsed_s=12.5, polyphy_commit='abc1234',
      )
      sidecar = tmp_path / 'out.json'
      data = json.loads(sidecar.read_text())
      assert data['params']['num_iterations'] == params.num_iterations
      assert data['cube_shape'] == [256, 256, 256]
      assert data['polyphy_commit'] == 'abc1234'
      assert 'input_csv_sha256' in data and len(data['input_csv_sha256']) == 64


  def test_hash_file_is_deterministic(tmp_path: Path):
      p = tmp_path / 'x.txt'
      p.write_bytes(b'hello')
      h1 = hash_file(p)
      h2 = hash_file(p)
      assert h1 == h2
      assert len(h1) == 64
  ```

- [ ] **Step 2: Confirm tests fail**

  ```bash
  cd ~/Development/vendor/python/PolyPhy
  verification/.venv/bin/pytest rhizome/tests/test_run_rhizome_polyphy.py --no-cov
  ```

  Expected: `ImportError`.

- [ ] **Step 3: Write the orchestrator**

  Use the `Write` tool to create `~/Development/vendor/python/PolyPhy/rhizome/runRhizomePolyphy.py`:

  ```python
  #!/usr/bin/env python3
  """runRhizomePolyphy.py — wraps PolyPhy's 3d_discrete batch mode.

  Why a wrapper:
    1. PolyPhy hardcodes ROOT='../../' in core/common.py:135 — caller must
       cd to src/polyphy/ first. We pass cwd= to subprocess.run.
    2. PolyPhy emits timestamped trace_*.npy and deposit_*.npy into
       data/fits/ without naming the latest. We glob for files with
       mtime > start_time after the run.
    3. PolyPhy's CLI takes sensing-distance and step-size in pixel-space,
       but MCPM literature specifies them as fractions of DOMAIN_SIZE_MAX.
       We multiply (frac × trace_res_max) at invocation time.
    4. CI uses /tmp/flag as a "force CPU" sentinel (discrete3D.py:24).
       We unlink it defensively before every run.
    5. The output cube is 4D `(X, Y, Z, 1)`; we squeeze the trailing axis
       before saving to output/.

  RhizomeParams near the top of this file are the *frozen* calibration
  values. The initial values are the Task 2 candidate set. Task 8 mutates
  CALIBRATION_PARAMS via successive commits; the final committed state is
  the locked-in calibration set.
  """
  import argparse
  import hashlib
  import json
  import subprocess
  import sys
  import time
  from dataclasses import asdict, dataclass, field
  from pathlib import Path

  import numpy as np


  # ---------------------------------------------------------------------------
  # Parameter constants. The calibration sweep updates CALIBRATION_PARAMS as
  # iterations converge. Sensing distance + step size are stored as fractions
  # of DOMAIN_SIZE_MAX (= trace_res_max in pixel units, since PolyPhy auto-fits
  # the trace grid to the input bbox at the requested max-axis resolution).
  # ---------------------------------------------------------------------------


  @dataclass(frozen=True)
  class RhizomeParams:
      """All PolyPhy hyperparameters the calibration sweeps over.

      Frozen + dataclass so we can asdict() into the sidecar JSON for
      reproducibility, and so a typo at a call site fails at parse time
      rather than silently using a default.
      """
      # --- iteration / resolution ---
      num_iterations: int = 700           # -n; Polyphorm convergence guidance
      trace_res_max: int = 256            # -t; non-cubic auto-derived for non-cubic input

      # --- agent sensing & motion (fractions of trace_res_max in pixel units) ---
      sense_distance_frac: float = 0.005  # PolyPhy default auto-derive
      step_size_frac: float = 0.0005      # PolyPhy default auto-derive
      sensing_angle_deg: float = 30.0     # PPConfig default — confirm in Task 2

      # --- deposit / trace attenuation ---
      deposit_attenuation: float = 0.90   # PPConfig default — confirm in Task 2
      trace_attenuation: float = 0.96     # PPConfig default — confirm in Task 2

      # --- sampling distributions (enum string values per cli_helper.py) ---
      distance_distribution: str = 'maxwell-boltzmann'
      directional_distribution: str = 'cone'
      directional_mutation: str = 'stochastic'
      deposit_fetching: str = 'noise-perturbed-NN'
      agent_boundary_handling: str = 're-initialize-randomly'


  # The locked-in calibration set. Task 8 updates these values via fresh commits.
  CALIBRATION_PARAMS = RhizomeParams()


  # Path to the PolyPhy fork root (this script's parent's parent).
  REPO_ROOT = Path(__file__).resolve().parent.parent


  def remove_cpu_force_flag() -> None:
      """PolyPhy's discrete3D.py:24 forces CPU if /tmp/flag exists. Unlink it."""
      flag = Path('/tmp/flag')
      if flag.exists():
          flag.unlink()


  def hash_file(path: Path) -> str:
      h = hashlib.sha256()
      with path.open('rb') as fp:
          for chunk in iter(lambda: fp.read(1 << 16), b''):
              h.update(chunk)
      return h.hexdigest()


  def polyphy_commit() -> str:
      """Return the short SHA of the fork's current HEAD."""
      out = subprocess.run(
          ['git', '-C', str(REPO_ROOT), 'rev-parse', '--short', 'HEAD'],
          capture_output=True, text=True, check=True,
      )
      return out.stdout.strip()


  def build_cli_args(params: RhizomeParams, csv_relative_to_repo_root: Path) -> list[str]:
      """Translate a RhizomeParams into a list of PolyPhy CLI tokens.

      Note on pixel conversion: PolyPhy treats sense_distance and step_size in
      trace-grid pixel units. With `-t trace_res_max`, the trace's longest axis
      = trace_res_max in pixels, so "fraction of domain" × trace_res_max yields
      the pixel value PolyPhy expects.
      """
      sense_distance_px = params.sense_distance_frac * params.trace_res_max
      step_size_px = params.step_size_frac * params.trace_res_max
      return [
          '3d_discrete', '-b',
          '-n', str(params.num_iterations),
          '-t', str(params.trace_res_max),
          '-f', str(csv_relative_to_repo_root),
          '-d', f'{sense_distance_px:.6f}',
          '-s', f'{step_size_px:.6f}',
          '-a', f'{params.sensing_angle_deg:.3f}',
          '-X', f'{params.deposit_attenuation:.4f}',
          '-T', f'{params.trace_attenuation:.4f}',
          '--distance-distribution', params.distance_distribution,
          '--directional-distribution', params.directional_distribution,
          '--directional-mutation', params.directional_mutation,
          '--deposit-fetching', params.deposit_fetching,
          '--agent-boundary-handling', params.agent_boundary_handling,
      ]


  def find_new_trace(fits_dir: Path, start_time: float) -> Path:
      """Find the trace_*.npy file produced after `start_time` (epoch seconds)."""
      candidates = [
          p for p in fits_dir.glob('trace_*.npy')
          if p.stat().st_mtime > start_time
      ]
      if not candidates:
          raise RuntimeError(f'no new trace produced in {fits_dir} after start')
      # Highest mtime among new files — robust to filesystem mtime tie-breaking.
      return max(candidates, key=lambda p: p.stat().st_mtime)


  def squeeze_and_save(raw_path: Path, out_path: Path) -> np.ndarray:
      """Load the 4D (X, Y, Z, 1) trace, squeeze, save as 3D float32."""
      cube = np.load(raw_path)
      if cube.ndim == 4 and cube.shape[-1] == 1:
          cube = cube.squeeze(-1)
      if cube.ndim != 3:
          raise RuntimeError(f'unexpected trace cube shape {cube.shape}')
      out_path.parent.mkdir(parents=True, exist_ok=True)
      np.save(out_path, cube.astype(np.float32))
      return cube


  def write_sidecar(out_path: Path, *, params: RhizomeParams, input_csv: Path,
                    cube_shape: tuple, elapsed_s: float,
                    polyphy_commit: str | None = None) -> None:
      sidecar = {
          'params': asdict(params),
          'input_csv': str(input_csv),
          'input_csv_sha256': hash_file(input_csv),
          'polyphy_commit': polyphy_commit if polyphy_commit is not None else '',
          'cube_shape': list(cube_shape),
          'wall_clock_s': elapsed_s,
          'produced_at': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
      }
      sidecar_path = out_path.with_suffix('.json')
      sidecar_path.write_text(json.dumps(sidecar, indent=2))


  def run_polyphy(csv_path: Path, params: RhizomeParams) -> tuple[Path, float]:
      """Invoke PolyPhy on csv_path. Return (path to new trace .npy, elapsed s)."""
      remove_cpu_force_flag()

      # PolyPhy resolves -f relative to its own ROOT (= fork repo root).
      # Easiest path: stage the CSV under data/csv/ at the fork root, then
      # reference it as data/csv/<name> in the CLI.
      polyphy_csv_dir = REPO_ROOT / 'data' / 'csv'
      polyphy_csv_dir.mkdir(parents=True, exist_ok=True)
      staged_csv = polyphy_csv_dir / csv_path.name
      if staged_csv.resolve() != csv_path.resolve():
          import shutil
          shutil.copy(csv_path, staged_csv)
      csv_relative = Path('data/csv') / csv_path.name

      cli_args = build_cli_args(params, csv_relative)

      fits_dir = REPO_ROOT / 'data' / 'fits'
      fits_dir.mkdir(parents=True, exist_ok=True)

      print(f'Running PolyPhy: {" ".join(cli_args)}')
      start_time = time.time()
      t0 = time.perf_counter()
      subprocess.run(
          [sys.executable, 'polyphy.py', *cli_args],
          cwd=REPO_ROOT / 'src' / 'polyphy',
          check=True,
      )
      elapsed = time.perf_counter() - t0
      print(f'PolyPhy returned in {elapsed:.1f}s')

      trace_path = find_new_trace(fits_dir, start_time)
      return trace_path, elapsed


  def main() -> int:
      parser = argparse.ArgumentParser(description='Run PolyPhy for rhizome calibration')
      parser.add_argument('--input', type=Path,
                          default=Path('rhizome/cache/sdss_calibration.csv'))
      parser.add_argument('--output', type=Path,
                          default=Path('rhizome/output/sdss_reproduced.npy'))
      args = parser.parse_args()

      if not args.input.exists():
          print(f'ERROR: {args.input} not found. Run buildRhizomeInput.py first.',
                file=sys.stderr)
          return 1

      raw_trace, elapsed = run_polyphy(args.input, CALIBRATION_PARAMS)
      cube = squeeze_and_save(raw_trace, args.output)

      write_sidecar(
          args.output, params=CALIBRATION_PARAMS, input_csv=args.input,
          cube_shape=cube.shape, elapsed_s=elapsed,
          polyphy_commit=polyphy_commit(),
      )
      print(f'Saved reproduced cube to {args.output} (shape={cube.shape})')
      print(f'Sidecar at {args.output.with_suffix(".json")}')
      return 0


  if __name__ == '__main__':
      sys.exit(main())
  ```

- [ ] **Step 4: Run tests, confirm pass**

  ```bash
  cd ~/Development/vendor/python/PolyPhy
  verification/.venv/bin/pytest rhizome/tests/test_run_rhizome_polyphy.py --no-cov -v
  ```

  Expected: all seven tests pass.

- [ ] **Step 5: Commit**

  ```bash
  cd ~/Development/vendor/python/PolyPhy
  git add rhizome/runRhizomePolyphy.py rhizome/tests/test_run_rhizome_polyphy.py
  git commit -m "$(cat <<'EOF'
  rhizome: PolyPhy orchestrator with frozen RhizomeParams dataclass

  Wraps PolyPhy's 3d_discrete batch mode. Handles the cd-to-src/polyphy
  requirement via subprocess cwd=, removes /tmp/flag defensively, hashes
  the input CSV for sidecar reproducibility, locates the new trace by
  mtime > start_time, squeezes 4D (X,Y,Z,1) → 3D float32 .npy, and writes
  a sidecar JSON with every parameter, input hash, PolyPhy HEAD commit,
  and wall-clock.

  Sensing distance + step size stored as fractions of DOMAIN_SIZE_MAX,
  resolved to pixel space at CLI-build time. Unit tests cover all the
  pure helpers; the subprocess invocation itself is exercised end-to-end
  in Task 7.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 6: `compareCubes.py` — visual + numerical comparison

Loads two `.npy` cubes (reproduced + reference), normalises both to `[0, 1]` (min-max), aligns shapes via `scipy.ndimage.zoom` if they differ, computes:

1. 3D Pearson correlation on the volumetric data.
2. Per-axis 2D Pearson correlation on max-projections.
3. A 3×2 grid PNG (rows = X/Y/Z axis projection, cols = reproduced / reference) rendered with matplotlib `magma` colourmap and `LogNorm`.
4. A `stats.json` next to the PNG with the four correlation numbers + both cube shapes + normalisation min/max.

**TDD-shaped** for the pure functions. The PNG-rendering is exercised end-to-end in Task 7.

**Files:**
- Create: `rhizome/compareCubes.py`
- Create: `rhizome/tests/test_compare_cubes.py`

- [ ] **Step 1: Write the failing test**

  Use the `Write` tool to create `~/Development/vendor/python/PolyPhy/rhizome/tests/test_compare_cubes.py`:

  ```python
  """Test the comparison harness on synthetic cube pairs."""
  import json
  import sys
  from pathlib import Path

  sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

  import numpy as np
  import pytest

  from compareCubes import (
      correlation_score,
      normalise_minmax,
      resample_to_match,
      max_projections,
      compare_pair,
  )


  def test_normalise_minmax_to_unit_range():
      cube = np.array([[[1.0, 3.0], [5.0, 7.0]]], dtype=np.float32)
      out = normalise_minmax(cube)
      assert out.min() == pytest.approx(0.0)
      assert out.max() == pytest.approx(1.0)


  def test_normalise_minmax_handles_flat_input():
      cube = np.full((2, 2, 2), 3.5, dtype=np.float32)
      out = normalise_minmax(cube)
      # Flat input → all zeros (no range to scale into).
      assert np.allclose(out, 0.0)


  def test_correlation_identity():
      rng = np.random.default_rng(seed=0)
      cube = rng.random((16, 16, 16), dtype=np.float32)
      r = correlation_score(cube, cube)
      assert r == pytest.approx(1.0)


  def test_correlation_anticorrelated():
      rng = np.random.default_rng(seed=0)
      a = rng.random((8, 8, 8), dtype=np.float32)
      b = 1.0 - a
      r = correlation_score(a, b)
      assert r == pytest.approx(-1.0, abs=1e-5)


  def test_resample_matches_shape():
      a = np.ones((10, 10, 10), dtype=np.float32)
      a_resampled = resample_to_match(a, (20, 20, 20))
      assert a_resampled.shape == (20, 20, 20)


  def test_max_projections_returns_three_planes():
      cube = np.arange(2 * 3 * 4, dtype=np.float32).reshape(2, 3, 4)
      px, py, pz = max_projections(cube)
      assert px.shape == (3, 4)
      assert py.shape == (2, 4)
      assert pz.shape == (2, 3)


  def test_compare_pair_writes_stats_json(tmp_path: Path):
      a = np.random.RandomState(0).rand(8, 8, 8).astype(np.float32)
      b = np.random.RandomState(1).rand(8, 8, 8).astype(np.float32)
      a_path = tmp_path / 'a.npy'
      b_path = tmp_path / 'b.npy'
      np.save(a_path, a)
      np.save(b_path, b)
      out_dir = tmp_path / 'out'
      stats = compare_pair(a_path, b_path, out_dir)
      assert (out_dir / 'compare.png').exists()
      assert (out_dir / 'stats.json').exists()
      loaded = json.loads((out_dir / 'stats.json').read_text())
      assert 'pearson_3d' in loaded
      assert 'pearson_x_projection' in loaded
      assert 'pearson_y_projection' in loaded
      assert 'pearson_z_projection' in loaded
      assert loaded['reproduced_shape'] == [8, 8, 8]
      assert loaded['reference_shape'] == [8, 8, 8]
      # Round-trip the same cube against itself: r ≈ 1.0.
      stats_same = compare_pair(a_path, a_path, tmp_path / 'out2')
      assert stats_same['pearson_3d'] == pytest.approx(1.0)
  ```

- [ ] **Step 2: Confirm tests fail**

  ```bash
  cd ~/Development/vendor/python/PolyPhy
  verification/.venv/bin/pytest rhizome/tests/test_compare_cubes.py --no-cov
  ```

  Expected: `ImportError`.

- [ ] **Step 3: Write `compareCubes.py`**

  Use the `Write` tool to create `~/Development/vendor/python/PolyPhy/rhizome/compareCubes.py`:

  ```python
  #!/usr/bin/env python3
  """compareCubes.py — visual + numerical reproducibility comparison.

  Inputs: two 3D float32 .npy cubes (reproduced and reference).
  Outputs (into --out directory):
    - compare.png: a 3x2 grid of max-projections (rows = X/Y/Z axis,
      cols = reproduced / reference), magma colourmap, LogNorm.
    - stats.json: 3D Pearson + three per-axis 2D Pearson scores plus
      both input shapes and normalisation diagnostics.

  Cubes may differ in shape — the Wilde et al. reference is 712 x 1200 x 728;
  our reproduction at trace_res_max=256 will be smaller on each axis with a
  matching aspect ratio. For the 3D correlation we resample the smaller cube
  up to the larger via trilinear interpolation; for max-projections we
  compare each axis projection at native resolution after a separate 2D
  resample of the smaller projection.

  Why per-axis 2D max-projections in addition to 3D: (a) MCPM trace doesn't
  carry consistent absolute intensity across the depth axis, (b) filament
  continuity is easiest to read on a 2D projection, (c) 2D Pearson is much
  less sensitive to small voxel-grid misalignments than 3D Pearson.
  """
  import argparse
  import json
  import sys
  from pathlib import Path

  import matplotlib.pyplot as plt
  import numpy as np
  from matplotlib.colors import LogNorm
  from scipy.ndimage import zoom


  def normalise_minmax(cube: np.ndarray) -> np.ndarray:
      """Scale so min → 0 and max → 1. Flat input returns all-zeros."""
      lo = float(cube.min())
      hi = float(cube.max())
      span = hi - lo
      if span <= 0:
          return np.zeros_like(cube, dtype=np.float32)
      return ((cube - lo) / span).astype(np.float32)


  def resample_to_match(cube: np.ndarray, target_shape: tuple) -> np.ndarray:
      """Resample cube to target_shape via trilinear interpolation."""
      factors = tuple(t / s for t, s in zip(target_shape, cube.shape))
      return zoom(cube, factors, order=1).astype(np.float32)


  def correlation_score(a: np.ndarray, b: np.ndarray) -> float:
      """Pearson correlation between two arrays of identical shape."""
      if a.shape != b.shape:
          raise ValueError(f'shape mismatch: {a.shape} vs {b.shape}')
      af = a.ravel().astype(np.float64)
      bf = b.ravel().astype(np.float64)
      af -= af.mean()
      bf -= bf.mean()
      denom = np.linalg.norm(af) * np.linalg.norm(bf)
      if denom == 0:
          return 0.0
      return float(np.dot(af, bf) / denom)


  def max_projections(cube: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
      """Return (proj_x, proj_y, proj_z): max-projection along each axis."""
      return cube.max(axis=0), cube.max(axis=1), cube.max(axis=2)


  def _safe_lognorm_imshow(ax, img, title):
      # LogNorm chokes on all-zero data. Add a tiny floor to be safe.
      vmax = float(img.max())
      vmin = max(vmax * 1e-4, 1e-6)
      norm = LogNorm(vmin=vmin, vmax=max(vmax, vmin * 10))
      ax.imshow(img.T, origin='lower', cmap='magma', norm=norm)
      ax.set_title(title)
      ax.axis('off')


  def _load_3d(path: Path) -> np.ndarray:
      cube = np.load(path).astype(np.float32)
      if cube.ndim == 4 and cube.shape[-1] == 1:
          cube = cube.squeeze(-1)
      if cube.ndim != 3:
          raise ValueError(f'expected 3D cube from {path}, got shape {cube.shape}')
      return cube


  def compare_pair(reproduced: Path, reference: Path, out_dir: Path) -> dict:
      """Load, normalise, resample, compare, render. Return the stats dict."""
      out_dir.mkdir(parents=True, exist_ok=True)

      a_raw = _load_3d(reproduced)
      b_raw = _load_3d(reference)
      a = normalise_minmax(a_raw)
      b = normalise_minmax(b_raw)

      # 3D correlation: resample the smaller cube up to the larger.
      a_vol = int(np.prod(a.shape))
      b_vol = int(np.prod(b.shape))
      target = a.shape if a_vol >= b_vol else b.shape
      a_3d = a if a.shape == target else resample_to_match(a, target)
      b_3d = b if b.shape == target else resample_to_match(b, target)
      r_3d = correlation_score(a_3d, b_3d)

      # Per-axis 2D correlations: project each, then resample each pair to a
      # common shape (largest of the two projections per axis).
      proj_a = max_projections(a)
      proj_b = max_projections(b)
      axis_names = ['x', 'y', 'z']
      stats = {
          'pearson_3d': r_3d,
          'reproduced_shape': list(a.shape),
          'reference_shape': list(b.shape),
          'reproduced_minmax': [float(a_raw.min()), float(a_raw.max())],
          'reference_minmax': [float(b_raw.min()), float(b_raw.max())],
      }
      proj_resampled_a, proj_resampled_b = [], []
      for name, pa, pb in zip(axis_names, proj_a, proj_b):
          target2d = pa.shape if np.prod(pa.shape) >= np.prod(pb.shape) else pb.shape
          pa_r = pa if pa.shape == target2d else zoom(
              pa, tuple(t / s for t, s in zip(target2d, pa.shape)), order=1)
          pb_r = pb if pb.shape == target2d else zoom(
              pb, tuple(t / s for t, s in zip(target2d, pb.shape)), order=1)
          stats[f'pearson_{name}_projection'] = correlation_score(pa_r, pb_r)
          proj_resampled_a.append(pa_r)
          proj_resampled_b.append(pb_r)

      # Render PNG (3 rows × 2 cols: rows = axis, cols = reproduced / reference).
      fig, axes = plt.subplots(3, 2, figsize=(8, 12))
      for row, name in enumerate(axis_names):
          _safe_lognorm_imshow(axes[row, 0], proj_resampled_a[row],
                               f'Reproduced — {name} max-projection')
          _safe_lognorm_imshow(axes[row, 1], proj_resampled_b[row],
                               f'Reference — {name} max-projection')
      fig.tight_layout()
      fig.savefig(out_dir / 'compare.png', dpi=120, bbox_inches='tight')
      plt.close(fig)

      (out_dir / 'stats.json').write_text(json.dumps(stats, indent=2))
      return stats


  def main() -> int:
      parser = argparse.ArgumentParser(description='Compare reproduced cube vs reference')
      parser.add_argument('--reproduced', type=Path, required=True)
      parser.add_argument('--reference', type=Path, required=True)
      parser.add_argument('--out', type=Path, required=True,
                          help='Directory; receives compare.png + stats.json')
      args = parser.parse_args()

      stats = compare_pair(args.reproduced, args.reference, args.out)
      print(f'Reproduced shape: {stats["reproduced_shape"]}, '
            f'min/max: {stats["reproduced_minmax"]}')
      print(f'Reference  shape: {stats["reference_shape"]}, '
            f'min/max: {stats["reference_minmax"]}')
      print(f'3D Pearson correlation: {stats["pearson_3d"]:+.4f}')
      for name in ('x', 'y', 'z'):
          print(f'  Pearson({name} max-projection): '
                f'{stats[f"pearson_{name}_projection"]:+.4f}')
      print(f'Wrote {args.out / "compare.png"}')
      print(f'Wrote {args.out / "stats.json"}')
      return 0


  if __name__ == '__main__':
      sys.exit(main())
  ```

- [ ] **Step 4: Run tests, confirm pass**

  ```bash
  cd ~/Development/vendor/python/PolyPhy
  verification/.venv/bin/pytest rhizome/tests/test_compare_cubes.py --no-cov -v
  ```

  Expected: all seven tests pass.

- [ ] **Step 5: Commit**

  ```bash
  cd ~/Development/vendor/python/PolyPhy
  git add rhizome/compareCubes.py rhizome/tests/test_compare_cubes.py
  git commit -m "$(cat <<'EOF'
  rhizome: numerical + visual cube comparison harness

  Loads reproduced and reference cubes, min-max normalises, resamples the
  smaller to match the larger, computes 3D Pearson + per-axis 2D Pearson
  on max-projections. Renders a 3x2 magma+LogNorm PNG and writes a
  stats.json sidecar. Pure helpers unit-tested; end-to-end PNG render
  exercised in Task 7's baseline run.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 7: Baseline iteration 0 — record the unrefined starting state

Before any tuning, run the full pipeline end-to-end with Task 2's candidate parameters, save artefacts under `rhizome/calibration/iter0_baseline/`, and write the initial entry in `CALIBRATION.md`. This is the floor against which all subsequent iterations are measured.

- [ ] **Step 1: Fetch the reference cube**

  ```bash
  cd ~/Development/vendor/python/PolyPhy
  mkdir -p rhizome/reference
  curl -L -o rhizome/reference/mcpm_sdss_d2.npy \
      https://skymap-data.rulkens.com/data/raw/mcpm/mcpm_sdss_d2.npy
  ```

  Expected: ~600 MB download (712 × 1200 × 728 × 4 bytes ≈ 2.5 GB? Check actual file size on R2; the `_d2` suffix means downsampled-by-2, so ~316 MB float32, or smaller if shipped as float16). Verify with `ls -lh rhizome/reference/`.

- [ ] **Step 2: Run the full pipeline**

  ```bash
  cd ~/Development/vendor/python/PolyPhy
  verification/.venv/bin/python rhizome/buildRhizomeInput.py
  verification/.venv/bin/python rhizome/runRhizomePolyphy.py \
      --input rhizome/cache/sdss_calibration.csv \
      --output rhizome/output/sdss_reproduced.npy
  verification/.venv/bin/python rhizome/compareCubes.py \
      --reproduced rhizome/output/sdss_reproduced.npy \
      --reference rhizome/reference/mcpm_sdss_d2.npy \
      --out rhizome/calibration/iter0_baseline/
  cp rhizome/output/sdss_reproduced.json rhizome/calibration/iter0_baseline/params.json
  ```

  Failure modes to watch for:
  - `ROOT` resolution error → PolyPhy didn't find the CSV; confirm the staged copy at `data/csv/sdss_calibration.csv` exists.
  - `[Taichi] Starting on arch=x64` instead of `metal` → `/tmp/flag` survived our cleanup; investigate.
  - 4D output cube unexpectedly missing the trailing-1 channel → `squeeze_and_save` raises with the actual shape.
  - Memory blow-up at `trace_res_max=256` × 324k points × 1M agents → reduce to `trace_res_max=192` in `CALIBRATION_PARAMS` and re-record.
  - PolyPhy hangs or NaN cubes on Metal → fall back to CPU by `touch /tmp/flag` and rerun. Document in `CALIBRATION.md`.

- [ ] **Step 3: Initialise `CALIBRATION.md`**

  Use the `Write` tool to create `~/Development/vendor/python/PolyPhy/rhizome/CALIBRATION.md`:

  ```markdown
  # SDSS Reproduction Calibration Log

  **Goal:** match the structural appearance of Wilde et al. 2023's published
  `SDSS_z_44-476mpc` MCPM cube (skymap's `mcpm_sdss_d2.npy`) by running
  PolyPhy on our own SDSS catalog with parameter tuning.

  **Acceptance criterion (tunable):** Pearson correlation ≥ 0.6 on at least
  two of three axis max-projections. This is a guess at what's plausibly
  achievable given that our input preprocessing differs from Wilde's (no
  RSD correction, no DBSCAN clustering) — absolute parity is impossible.
  Raise the bar if iter 0 lands close to it with defaults; lower the bar
  if the architectural-difference floor proves to be below 0.6 across
  all five iterations.

  **Hard iteration cap:** 5 iterations. If we're not converging by iter 5,
  surface the upstream issue (wrong frame, wrong filter, wrong baseline,
  fundamental model mismatch) rather than continuing to thrash on
  parameters.

  ## Iteration log

  ### iter 0 — baseline (Task 2 candidate parameters)

  **Parameters:** `rhizome/calibration/iter0_baseline/params.json` (= PolyPhy
  defaults + any manual overrides captured in CANDIDATE_PARAMETERS.md).

  **Stats:** see `rhizome/calibration/iter0_baseline/stats.json`. 3D Pearson
  `<fill>`, per-axis x `<fill>`, y `<fill>`, z `<fill>`.

  **Visual:** `rhizome/calibration/iter0_baseline/compare.png`. Notes from
  inspection:
  - `<fill: filament locations correct / shifted / smeared / absent>`
  - `<fill: intensity contrast vs reference>`
  - `<fill: noise floor / agent diffusion observable>`
  - `<fill: cube shape vs reference>` (e.g. ours is 256×<…>×<…>, reference is 712×1200×728)

  **Decision:** baseline recorded; proceed to parameter sweeps in iter 1+.
  ```

- [ ] **Step 4: Commit and STOP**

  ```bash
  cd ~/Development/vendor/python/PolyPhy
  git add rhizome/CALIBRATION.md rhizome/calibration/iter0_baseline/
  git commit -m "$(cat <<'EOF'
  rhizome(iter 0): record baseline reproduction against Wilde et al. reference

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

  **STOP-and-check gate.** Show the user:
  - `rhizome/calibration/iter0_baseline/compare.png`
  - `rhizome/calibration/iter0_baseline/stats.json`
  - The reproduction's cube shape vs the reference's

  The user decides whether the starting state is in the right ballpark or whether something obvious is broken (all-noise output, wrong domain extent, agents not depositing, frame mismatch). If broken, fix before proceeding to Task 8. If the user wants to adjust the acceptance bar based on what iter 0 looks like, capture that in `CALIBRATION.md` first.

---

## Task 8: Tuning iterations — up to 5 named rounds

**This task is inherently non-TDD.** Calibration is "run → look at PNG → tune → re-run". No unit test can encode "the filaments look right." The structural test is the user's eye on `compare.png` plus the printed Pearson scores. **Hard cap: 5 iterations.** If we're not converging by iter 5, surface the upstream issue rather than continuing to thrash.

**Rules of engagement:**

- Change one *group* of related parameters per iteration (e.g. "sensing distance + sensing angle", "deposit + trace attenuation"), not everything at once. We want to attribute visual changes to causes.
- Each iteration gets a named subfolder under `rhizome/calibration/iter<N>_<name>/`, its own entry in `CALIBRATION.md`, and its own commit.
- After each iteration: **STOP and check with user.** They eyeball `compare.png` against iter 0 and the previous iteration. Their call whether to continue, revert, or escalate.
- Don't `git commit --amend`; create a fresh commit per iteration so the timeline is preserved.

The named iterations below are the *suggested* sequence; the actual order can adapt to what iter 0 looks like. Skip any iteration whose changes don't make sense given the iter 0 inspection.

### Iter 1 — sensing distance + sensing angle

- [ ] In `rhizome/runRhizomePolyphy.py`, update `CALIBRATION_PARAMS` with values from `CANDIDATE_PARAMETERS.md` adjusted per inspection of iter 0:
  - Try `sense_distance_frac` in `{0.005, 0.01, 0.02}` (default × 1, 2, 4).
  - Try `sensing_angle_deg` in `{15, 30, 45}` (pick whichever from Task 2 came closest, or the bracket around it).
- [ ] Re-run pipeline, save under `rhizome/calibration/iter1_sensing/`.
- [ ] Update `CALIBRATION.md` with stats + visual notes (same format as iter 0).
- [ ] Commit:
  ```bash
  cd ~/Development/vendor/python/PolyPhy
  git add rhizome/runRhizomePolyphy.py rhizome/CALIBRATION.md \
          rhizome/calibration/iter1_sensing/
  git commit -m "$(cat <<'EOF'
  rhizome(iter 1): sweep sensing distance and angle

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```
- [ ] **STOP-and-check gate.** User decides: continue, revert this iter, or escalate.

### Iter 2 — deposit + trace attenuation

- [ ] Adjust `deposit_attenuation` (try `{0.85, 0.90, 0.95}`) and `trace_attenuation` (try `{0.92, 0.96, 0.98}`) in `CALIBRATION_PARAMS`.
- [ ] Re-run, save under `rhizome/calibration/iter2_attenuation/`, log, commit, **STOP-and-check**.

### Iter 3 — iteration count + step size

- [ ] Try `num_iterations` in `{300, 700, 1500}` and `step_size_frac` in `{0.0005, 0.001, 0.002}`.
- [ ] Save under `rhizome/calibration/iter3_iter_step/`, log, commit, **STOP-and-check**.

### Iter 4 — distance + directional distributions

- [ ] Toggle `directional_distribution` between `discrete` and `cone`. Toggle `directional_mutation` between `deterministic` and `stochastic`. Try `distance_distribution` in `{constant, exponential, maxwell-boltzmann}`. These are coarser-grained changes that produce more visible structural differences than the numerical tweaks above.
- [ ] Save under `rhizome/calibration/iter4_distributions/`, log, commit, **STOP-and-check**.

### Iter 5 — final lock-in (only if iter 1-4 produced a clear winner)

- [ ] Take the best-performing parameter combination from iter 1-4 and write it back into `CALIBRATION_PARAMS` in `runRhizomePolyphy.py`. Re-run once with the locked-in set to produce the canonical artefacts at `rhizome/calibration/iter5_lockin/`.
- [ ] Add a "Locked-in parameters" section to `CALIBRATION.md` quoting the final dataclass values verbatim, with reasoning per parameter ("kept default because…", "tuned to X because…").
- [ ] Commit:
  ```bash
  cd ~/Development/vendor/python/PolyPhy
  git add rhizome/runRhizomePolyphy.py rhizome/CALIBRATION.md \
          rhizome/calibration/iter5_lockin/
  git commit -m "$(cat <<'EOF'
  rhizome: lock in SDSS-reproduction parameter set

  After N iterations of structural comparison against Wilde et al. 2023's
  published Cosmic Slime VAC cube, freezing the following parameters as
  the rhizome calibration set:
  [list final values]

  3D Pearson correlation: [value]; per-axis 2D max-projection correlations:
  x=[value], y=[value], z=[value]. Visual agreement on major filaments
  (Coma, Perseus-Pisces, Sloan Great Wall) confirmed in
  rhizome/calibration/iter5_lockin/compare.png.

  These parameters carry forward to the full-sky rhizome shells unchanged.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

### Escalation path if not converging by iter 5

If by iter 5 we're below the acceptance bar with no clear monotonic trend across iterations, do **not** continue tuning. Instead, write an "Escalation" section in `CALIBRATION.md` documenting:

- The best-achieved Pearson scores and which iter produced them.
- Which parameters had observable effect and which were null.
- The most likely upstream causes (in order of plausibility):
  - Input preprocessing mismatch (RSD, DBSCAN, weighting) we can't replicate.
  - Coordinate-frame divergence affecting projection geometry.
  - PolyPhy current-HEAD model diverging from the 2023 Polyphorm Wilde et al. used (PolyPhy README warns "currently undergoing refactoring").
  - SDSS catalog vintage difference between skymap's SkyServer extraction and the Cosmic Slime VAC's underlying input.
- A recommended next step (e.g. "switch to running against Polyphorm directly", "request the original parameter file from Elek/Wilde", "accept the bar as-is").

Commit this section and **STOP-and-check with user.** Do not attempt iter 6.

---

## Task 9: Clean-checkout reproduction + acceptance

Verifies the README's reproduction recipe works from a freshly-recreated working state and confirms all calibration commits meet repo hygiene standards.

- [ ] **Step 1: Clean-state reproduction**

  ```bash
  cd ~/Development/vendor/python/PolyPhy
  # Clear all generated artefacts (keeps caches to avoid re-downloading R2 bytes).
  rm -rf rhizome/output/*.npy rhizome/output/*.json data/csv/sdss_calibration.csv
  # Walk the README recipe verbatim.
  verification/.venv/bin/python rhizome/buildRhizomeInput.py
  verification/.venv/bin/python rhizome/runRhizomePolyphy.py \
      --input rhizome/cache/sdss_calibration.csv \
      --output rhizome/output/sdss_reproduced.npy
  verification/.venv/bin/python rhizome/compareCubes.py \
      --reproduced rhizome/output/sdss_reproduced.npy \
      --reference rhizome/reference/mcpm_sdss_d2.npy \
      --out /tmp/rhizome_acceptance_compare/
  ```

  Compare `/tmp/rhizome_acceptance_compare/stats.json` against `rhizome/calibration/iter5_lockin/stats.json`. The 3D and per-axis Pearson scores should match within MCPM stochastic noise (Pearson Δ < 0.01).

- [ ] **Step 2: Verify commit hygiene**

  ```bash
  cd ~/Development/vendor/python/PolyPhy
  # All commits on this branch must be authored by the user, not Claude.
  git log verification-spike..rhizome-sdss-calibration --format='%an <%ae>' | sort -u
  # Expected: only one line — the user's identity. NEVER "Claude <noreply@anthropic.com>".

  # Every commit body must end with the Co-Authored-By trailer.
  git log verification-spike..rhizome-sdss-calibration --format='%B' \
      | grep -c 'Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>'
  # Compare against the commit count:
  git rev-list --count verification-spike..rhizome-sdss-calibration
  # The two numbers must match.

  # No force-pushes happened (this is a local branch only; nothing to push yet).
  # The branch must have a remote tracking ref of `origin/rhizome-sdss-calibration`
  # ONLY if the user previously asked for a push. If the user has not asked,
  # there must be no remote ref.
  git rev-parse --abbrev-ref @{upstream} 2>&1 || echo 'no upstream — expected if user has not requested a push'
  ```

- [ ] **Step 3: Verify all tests pass green**

  ```bash
  cd ~/Development/vendor/python/PolyPhy
  verification/.venv/bin/pytest rhizome/tests/ --no-cov -v
  ```

  Expected: all tests across the four `test_*.py` files pass.

- [ ] **Step 4: Acceptance handoff to user**

  Show the user:
  - `rhizome/calibration/iter5_lockin/compare.png`
  - `rhizome/CALIBRATION.md`'s "Locked-in parameters" section
  - `git log --oneline verification-spike..HEAD` on the `rhizome-sdss-calibration` branch
  - Total wall-clock for one full pipeline run (the iter5 sidecar JSON's `wall_clock_s`)

  Ask:
  - Are they satisfied with the structural match?
  - Do they want to push the branch + open a PR back to the fork's `main` now, or defer until the rhizome-shells plan also lands?
  - Are they ready to start the next plan (full-sky rhizome shell production)?

  Do NOT push, open a PR, or merge anything without explicit user confirmation.

---

## Self-review (do this before declaring the plan executed)

- [ ] **Spec coverage.** Re-read the spec's "Reproduction-against-SDSS calibration" section. Confirm every numbered procedure step there maps onto at least one task above.
- [ ] **Placeholder scan.** `grep -rn 'TODO\|FIXME\|XXX\|<fill\|<placeholder' rhizome/` should return only the `<fill>` markers in `CALIBRATION.md`'s template entries (those are intentionally to be filled in during iterations 0–5).
- [ ] **Type consistency.** Every Python file uses `from pathlib import Path` (never raw strings for paths). Every numeric arg has an explicit type annotation. `RhizomeParams` remains `@dataclass(frozen=True)`.
- [ ] **Path consistency.** Every file path mentioned in this plan starts with `~/Development/vendor/python/PolyPhy/` except for the one (this) skymap-side plan file. Re-grep for accidental `~/Development/js/skymap-rhizome/` or `vendor/polyphy/` leftovers from prior architecture sketches.
- [ ] **No skymap modifications.** `git -C ~/Development/js/skymap status` must show only `.claude/` (or whatever was untracked at plan start) as the working-tree difference relative to the start of plan execution. The `rhizome-spec` branch in skymap gets one and only one commit (the plan file itself), pre-existing before this plan begins.

---

## Out of scope reminders

This plan does **not** include any of the following — they belong to later plans:

- Running PolyPhy on 2MRS+GLADE catalogs (the three full-sky shells).
- Building a `.npy → .scfd` converter in skymap.
- Wiring rhizome shells into skymap's `volumeFieldDefaults`, scalar-volume renderer, or settings UI.
- Migrating from the MCPM toggle to a rhizome toggle.
- Uploading any cubes to R2.
- Pushing this branch to the fork's remote, opening a PR back to the fork's `main`, or merging.
- DisPerSE involvement.
- Anything from the rhizome spec's "Open follow-ups" section (luminosity weighting, `1/V_max` correction, deposit-channel overlay, rhizome-vs-CF4 difference overlay).
