# Rhizome — SDSS Reproduction Calibration

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` (or `superpowers:subagent-driven-development` for the parallelisable scaffolding tasks) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **This plan is mostly executed inside a NEW repository — `skymap-rhizome` — that does not yet exist.** Task 1 creates it; all subsequent file paths beginning with `~/Development/js/skymap-rhizome/` refer to that new repo. The skymap repo itself is barely touched (one .gitignore hint, no code).

**Goal:** Lock in the PolyPhy MCPM parameter set by reproducing the published Wilde et al. 2023 SDSS MCPM cube (`mcpm-large.scfd` / `mcpm_sdss_d2.npy`, currently shipped). We run PolyPhy ourselves on skymap's SDSS catalog restricted to the published 44–476 Mpc comoving volume, visually compare against the reference, iterate the parameter set, and freeze the final values in `runRhizomePolyphy.py`. Those frozen parameters are then applied — unchanged — to the three full-sky rhizome shells in a **later plan**.

**Architecture:** A standalone Python repository (`skymap-rhizome`) houses the PolyPhy producer pipeline. It vendors PolyPhy as a git submodule pinned at the smoke-test–verified commit `5f9cef8`. Three Python entry points: `buildRhizomeInput.py` (skymap `.bin` → PolyPhy CSV), `runRhizomePolyphy.py` (subprocess orchestrator with named parameter constants), `compareCubes.py` (matplotlib side-by-side + cross-correlation against the reference). No skymap runtime code runs in this phase — the comparison harness loads `.npy` cubes directly with NumPy and renders to PNG.

**Tech stack:** Python 3.10.20, Taichi 1.6.0, NumPy 1.22.0, Matplotlib 3.5.3 (pinned exactly per the verification handoff). The skymap repo is untouched except for one `.gitignore` entry.

**Spec:** [`docs/superpowers/specs/2026-05-12-rhizome-cosmic-web-volume-design.md`](../specs/2026-05-12-rhizome-cosmic-web-volume-design.md) — the "Reproduction-against-SDSS calibration" section is what this plan implements.
**Smoke-test handoff:** [`~/Development/vendor/python/PolyPhy/verification/README.md`](../../../../../vendor/python/PolyPhy/verification/README.md) — authoritative for the working PolyPhy invocation, environment, output format, and gotchas.

**Reality checks vs spec:**

- The spec says "load alongside the existing `mcpm-large.scfd` in the skymap renderer." That's expensive — it requires a `.npy → .scfd` builder and a renderer-side toggle that don't exist yet, both of which are explicitly out of scope for this plan. **This plan substitutes a Python-side visual comparison** (max-projection PNGs, intensity histograms, cross-correlation) directly between the two `.npy` cubes. That's a stronger comparison than a perspective render anyway (no camera/tonemap variance), and it keeps the calibration loop entirely inside `skymap-rhizome`. Loading the reproduced cube in skymap is deferred to the next plan.
- The PolyPhy `PPConfig_3DDiscrete` class (`vendor/polyphy/src/polyphy/core/discrete3D.py:38-45`) auto-derives `sense_distance` and `step_size` from `DOMAIN_SIZE_MAX` *if they are left below a tiny threshold*. Wilde et al.'s parameters in the literature (and the Polyphorm tradition) are typically given as fractions of the domain — so the calibration's "iteration constants" are expressed as **fractions of `DOMAIN_SIZE_MAX`** in the orchestrator, multiplied out into pixel/world units at invocation time. This matches PolyPhy's internal model.
- The spec's claim "expect well under a minute on Apple silicon Metal" refers to a single shell. The SDSS calibration cube spans 556 × 938 × 569 Mpc — *not* cubic — so `-t 256` will produce a non-cubic trace cube whose largest axis is 256. For the reproduction we **deliberately don't add anchor points**: the reference cube is non-cubic (712 × 1200 × 728) and a faithful reproduction must also be non-cubic. The cubic-AABB trick is a rhizome-shell concern, not a calibration concern.
- The verification README documents that PolyPhy emits 4D `(X, Y, Z, 1)` trace cubes that need `.squeeze(-1)`. The comparison harness does that on load.

---

## File map (in the new `~/Development/js/skymap-rhizome/` repository)

**Created by this plan:**

- `.gitignore`
- `.python-version`
- `README.md`
- `pyproject.toml` — minimal PEP 621 metadata + dependency pins
- `requirements.txt` — exact pins matching the verified PolyPhy environment
- `requirements-frozen.txt` — `pip freeze` output captured post-install (for reproducibility)
- `vendor/polyphy/` — git submodule pinned at PolyPhy `5f9cef8`
- `buildRhizomeInput.py` — SDSS `.bin` → CSV, restricted to Wilde et al.'s 44–476 Mpc volume
- `runRhizomePolyphy.py` — PolyPhy orchestrator with calibration parameter constants
- `compareCubes.py` — `.npy` ↔ `.npy` visual + numerical comparison
- `skymapBinDecoder.py` — ~50-line Python port of skymap's v4 `decodePointCloud`
- `tests/test_skymap_bin_decoder.py` — round-trip test against a tiny hand-built v4 buffer
- `tests/test_build_rhizome_input.py` — distance-filter + CSV-format test on synthetic input
- `tests/test_compare_cubes.py` — cross-correlation + histogram on a known pair of cubes
- `data/csv/` (gitignored content) — produced CSV
- `output/` (gitignored content) — reproduced `.npy` cubes
- `calibration/` (committed) — final comparison PNG + sweep log
- `calibration/compare.png` — final side-by-side comparison (committed binary)
- `CALIBRATION.md` — sweep log + locked-in parameter values + reasoning

**Touched in the skymap repo (this repo, branch `rhizome-spec`):**

- `.gitignore` — add a comment pointing to `skymap-rhizome` so contributors don't search here for the producer scripts

---

## Task 1: Scaffold the `skymap-rhizome` repository

Create the empty repository, pin Python tooling, vendor PolyPhy as a submodule at the verified commit, set up the venv. **No PolyPhy invocation yet** — we just want a clean, reproducible skeleton that future tasks build on.

**Decision: submodule vs editable install.** Both work; we use a git **submodule** because (a) `skymap-rhizome` is meant to be a citable artefact ("how the cubes were built, exactly"), and a submodule pins the upstream tree at a specific commit inside our own repo's history, which an `-e` install doesn't, and (b) it allows in-tree patches later without forking PolyPhy upstream. The trade-off is one extra `git submodule update --init` step on clone, which is documented in the README.

**Repo location:** `~/Development/js/skymap-rhizome/` (sibling to `~/Development/js/skymap/`, matching the project layout).

**Files to create:** see file map above.

- [ ] **Step 1: Create the directory and initialise git**

  ```bash
  mkdir -p ~/Development/js/skymap-rhizome
  cd ~/Development/js/skymap-rhizome
  git init
  git checkout -b main
  ```

- [ ] **Step 2: Write `.gitignore`**

  Create `~/Development/js/skymap-rhizome/.gitignore`:

  ```gitignore
  # Python virtualenvs and caches.
  .venv/
  __pycache__/
  *.pyc
  .pytest_cache/

  # Generated CSVs (recreated by buildRhizomeInput.py from the .bin cache).
  data/csv/*.csv

  # Reproduced cubes (large; recreated by runRhizomePolyphy.py).
  output/*.npy
  output/*.json

  # Downloaded reference cubes (large; fetched from R2 on demand).
  reference/*.npy

  # Skymap .bin cache (large; fetched from R2 on demand).
  cache/*.bin

  # PolyPhy's own output sink — submoduled tree, but PolyPhy writes here at runtime.
  vendor/polyphy/data/fits/*.npy
  vendor/polyphy/data/csv/*.csv

  # macOS noise.
  .DS_Store
  ```

- [ ] **Step 3: Pin Python version**

  Create `~/Development/js/skymap-rhizome/.python-version`:

  ```
  3.10.20
  ```

  (Matches the verification environment exactly. If `pyenv` is in use it will pick this up automatically; otherwise the README documents falling back to system `python3.10`.)

- [ ] **Step 4: Write `requirements.txt`**

  Pinned to the verification env. We list only the runtime deps needed by *our* scripts plus PolyPhy's own transitive requirements that we want fixed at the verified version.

  Create `~/Development/js/skymap-rhizome/requirements.txt`:

  ```txt
  # Pinned to match ~/Development/vendor/python/PolyPhy/verification/requirements-frozen.txt.
  # Bumping any of these requires re-running the SDSS calibration to confirm no drift.
  taichi==1.6.0
  numpy==1.22.0
  matplotlib==3.5.3
  scipy==1.10.1
  pytest==8.0.0
  requests==2.31.0
  ```

- [ ] **Step 5: Write `pyproject.toml`**

  Minimal PEP 621 metadata so this is a real, citable Python project.

  Create `~/Development/js/skymap-rhizome/pyproject.toml`:

  ```toml
  [project]
  name = "skymap-rhizome"
  version = "0.1.0"
  description = "PolyPhy MCPM producer for skymap's rhizome cosmic-web density cubes."
  readme = "README.md"
  requires-python = "==3.10.*"
  authors = [{ name = "Alexander Rulkens" }]
  license = { text = "MIT" }

  [build-system]
  requires = ["setuptools>=61"]
  build-backend = "setuptools.build_meta"

  [tool.pytest.ini_options]
  testpaths = ["tests"]
  ```

- [ ] **Step 6: Vendor PolyPhy as a submodule**

  ```bash
  cd ~/Development/js/skymap-rhizome
  git submodule add https://github.com/PolyPhyHub/PolyPhy.git vendor/polyphy
  cd vendor/polyphy
  git checkout 5f9cef8
  cd ../..
  git add .gitmodules vendor/polyphy
  ```

  **Why this exact commit:** `5f9cef8` is the revision the verification handoff confirmed working headlessly on Apple Silicon Metal with the pinned environment. Newer PolyPhy commits may have refactored the API; older ones predate the batch-mode flag. Bumping requires re-calibration.

- [ ] **Step 7: Create the venv and install dependencies**

  ```bash
  cd ~/Development/js/skymap-rhizome
  python3.10 -m venv .venv
  .venv/bin/pip install --upgrade pip
  .venv/bin/pip install -r requirements.txt
  # Install vendored PolyPhy in editable mode so our scripts can `import polyphy`
  # if they ever need to (currently they shell out, but the install also pulls
  # PolyPhy's own deps as declared in its requirements.txt).
  .venv/bin/pip install -e vendor/polyphy
  .venv/bin/pip freeze > requirements-frozen.txt
  ```

- [ ] **Step 8: Write the README**

  Create `~/Development/js/skymap-rhizome/README.md`:

  ```markdown
  # skymap-rhizome

  PolyPhy MCPM producer pipeline for skymap's **rhizome** cosmic-web density cubes.

  ## What this is

  A standalone Python repository that runs Monte Carlo Physarum Machine (MCPM) on
  galaxy catalogs and emits 3D density `.npy` cubes for consumption by [skymap](https://github.com/rulkens/skymap)'s
  scalar-volume renderer. Companion to skymap's spec
  [`2026-05-12-rhizome-cosmic-web-volume-design.md`](https://github.com/rulkens/skymap/blob/main/docs/superpowers/specs/2026-05-12-rhizome-cosmic-web-volume-design.md).

  ## Current scope: SDSS calibration only

  This first milestone reproduces the published Wilde et al. 2023 SDSS MCPM cube
  (`mcpm_sdss_d2.npy`, currently shipped by skymap as `mcpm-large.scfd`) on our
  own PolyPhy invocation. The goal is to lock in MCPM parameter values that
  match the published recipe. Once locked, those same parameters are applied
  to full-sky 2MRS+GLADE inputs in a later milestone.

  See [`CALIBRATION.md`](./CALIBRATION.md) for the parameter sweep log and the
  frozen final values.

  ## Setup

  ```bash
  git clone --recurse-submodules https://github.com/rulkens/skymap-rhizome.git
  cd skymap-rhizome
  python3.10 -m venv .venv
  .venv/bin/pip install -r requirements.txt
  .venv/bin/pip install -e vendor/polyphy
  ```

  If you forgot `--recurse-submodules`:

  ```bash
  git submodule update --init --recursive
  ```

  PolyPhy is pinned at commit `5f9cef8`. Bumping the submodule requires
  re-running the SDSS calibration (see `CALIBRATION.md`).

  ## Reproducing the SDSS calibration

  ```bash
  # 1. Fetch skymap's SDSS catalog (.bin) into cache/.
  .venv/bin/python -c "import urllib.request; urllib.request.urlretrieve('https://skymap-data.rulkens.com/data/sdss-large.bin', 'cache/sdss-large.bin')"

  # 2. Fetch the reference cube (Wilde et al. 2023, pre-extracted by skymap).
  .venv/bin/python -c "import urllib.request; urllib.request.urlretrieve('https://skymap-data.rulkens.com/data/raw/mcpm/mcpm_sdss_d2.npy', 'reference/mcpm_sdss_d2.npy')"

  # 3. Build the PolyPhy input CSV.
  .venv/bin/python buildRhizomeInput.py --shell calibration

  # 4. Run PolyPhy with the locked-in calibration parameter set.
  .venv/bin/python runRhizomePolyphy.py --shell calibration

  # 5. Visual + numerical comparison against the reference.
  .venv/bin/python compareCubes.py \
      --reproduced output/sdss_reproduced.npy \
      --reference reference/mcpm_sdss_d2.npy \
      --out calibration/compare.png
  ```

  Wall-clock: ~30 s for steps 3-5 combined on M1/M2 Mac.

  ## Repository layout

  | Path | Purpose |
  |---|---|
  | `buildRhizomeInput.py` | Decode skymap `.bin`, filter to shell, write CSV |
  | `runRhizomePolyphy.py` | Subprocess wrapper around PolyPhy; parameter constants live here |
  | `compareCubes.py` | Side-by-side max-projection PNG + cross-correlation stats |
  | `skymapBinDecoder.py` | Port of skymap's v4 PointCloud decoder |
  | `vendor/polyphy/` | PolyPhy submodule, pinned at `5f9cef8` |
  | `calibration/` | Sweep log artefacts + final comparison PNG |
  | `tests/` | pytest unit tests for the deterministic pieces |
  ```

- [ ] **Step 9: Commit the scaffold**

  ```bash
  cd ~/Development/js/skymap-rhizome
  git add .gitignore .python-version requirements.txt requirements-frozen.txt pyproject.toml README.md .gitmodules vendor/polyphy
  git commit -m "$(cat <<'EOF'
  chore: scaffold skymap-rhizome repository

  PolyPhy MCPM producer pipeline. This first commit establishes the Python
  environment (3.10.20 + Taichi 1.6.0 + NumPy 1.22.0, matching the upstream
  PolyPhy verification handoff), vendors PolyPhy as a submodule pinned at
  commit 5f9cef8, and documents the SDSS calibration reproduction recipe.

  No producer code yet — that lands in subsequent commits as the SDSS
  calibration milestone takes shape.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

  **Do NOT push.** The remote doesn't exist yet; we'll create it (or decide not to) after the first round of calibration verifies the pipeline works end-to-end.

- [ ] **Step 10: Drop the skymap-side gitignore hint**

  In `~/Development/js/skymap/.gitignore`, find the existing comment block at the top documenting the rationale for the catalogue/binary gitignores. Append a one-line breadcrumb so future contributors searching this tree for the PolyPhy producer realise it lives elsewhere.

  Insert before the last paragraph of the top-of-file docblock (or at end of file if no docblock):

  ```gitignore
  # The PolyPhy producer pipeline that generates rhizome density cubes lives
  # in the sibling repository `skymap-rhizome` (not in this tree). See
  # docs/superpowers/specs/2026-05-12-rhizome-cosmic-web-volume-design.md
  # for the split rationale.
  ```

  Commit in skymap:

  ```bash
  cd ~/Development/js/skymap
  git add .gitignore
  git commit -m "$(cat <<'EOF'
  docs(gitignore): point contributors at skymap-rhizome for the producer pipeline

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 2: Research the Wilde et al. 2023 parameter set

**This task is non-coding.** It produces a parameter table that Task 5 codifies as named constants. Search the literature and Polyphorm source for explicit values.

The point of this research is to **start the iteration loop as close to the published recipe as possible**, not to find values that we can apply unmodified. If the literature gives us nothing, we start from PolyPhy's auto-derived defaults (`sense_distance = 0.005 × DOMAIN_SIZE_MAX`, `step_size = 0.0005 × DOMAIN_SIZE_MAX`, see `vendor/polyphy/src/polyphy/core/discrete3D.py:38-45`) and tune.

**Sources to check (in order of expected yield):**

1. **Wilde et al. 2023 ApJ "A Galaxy's Place in the Universe..."** — arXiv:2301.02719. Read the Methods section and any appendix detailing the MCPM run that produced the Cosmic Slime VAC. Search the PDF for "sensing distance", "step size", "iterations", "agents".
2. **Burchett et al. 2020 ApJ "Revealing the Dark Threads of the Cosmic Web"** — arXiv:2007.04339. Original Polyphorm cosmic-web paper. Appendix likely has the most explicit parameter table.
3. **Elek et al. 2022 "Monte Carlo Physarum Machine: Characteristics of Pattern Formation in Continuous Stochastic Transport Networks"** — MIT Press *Artificial Life*. Algorithm characterization with explicit parameter discussion.
4. **Cosmic Slime VAC `export_metadata.txt`** — `https://data.sdss.org/sas/dr17/env/EBOSS_LSS/mcpm/v1_0_1/datacube/SDSS_z_44-476mpc/export_metadata.txt`. Already partially excerpted in `docs/superpowers/specs/2026-05-11-mcpm-cosmic-web-volume-design.md`; re-fetch and grep for any parameter keys we missed.
5. **Polyphorm GitHub `CreativeCodingLab/Polyphorm`** — README + any `.build` or `.config` files committed alongside the binary releases. The interactive tool has parameter sliders; their default values are baked into the source.
6. **Polyphorm's `polyphorm.build` files in releases** — these are the exact parameter records a published cube was rendered from. If a Burchett or Wilde release ships one, it's the definitive answer.

**Parameters we need values (or starting guesses) for:**

| PolyPhy CLI flag | PPConfig field | Meaning | Default behavior |
|---|---|---|---|
| `-n` | `num_iterations` | Total MCPM iterations | No default — must specify with `-b` |
| `-t` | `TRACE_RESOLUTION_MAX` | Largest axis of output trace cube | `512` |
| `-d` | `sense_distance` | Agent sensor reach (world units) | `0.005 × DOMAIN_SIZE_MAX` if unset |
| `-a` | `sensing_angle` | Sensor cone half-angle (degrees) | `PPConfig` default — record from `vendor/polyphy/src/polyphy/core/common.py` |
| `-s` | `step_size` | Agent forward step per iter | `0.0005 × DOMAIN_SIZE_MAX` if unset |
| `-X` | `deposit_attenuation` | Deposit field decay rate | from `common.py` defaults |
| `-T` | `trace_attenuation` | Trace field decay rate | from `common.py` defaults |
| `-D` | `data_deposit` | Per-data-point deposit strength | `0.1 × MAX_DEPOSIT` |
| `-A` | `agent_deposit` | Per-agent deposit strength | `data_deposit × N_DATA / N_AGENTS` |
| `-e` | `sampling_exponent` | Data-deposit sampling exponent | from `common.py` defaults |
| `-m` | `DOMAIN_MARGIN` | Padding factor around input bbox | `0.0` per common.py |
| `--distance-distribution` | (enum) | constant / exponential / maxwell-boltzmann | from `common.py` defaults |
| `--directional-distribution` | (enum) | discrete / cone | from `common.py` defaults |
| `--directional-mutation` | (enum) | deterministic / stochastic | from `common.py` defaults |

- [ ] **Step 1: Capture PolyPhy's own defaults**

  Read `~/Development/js/skymap-rhizome/vendor/polyphy/src/polyphy/core/common.py` and any `PPConfig_*` subclass. Record the literal numeric defaults for every field in the table above into a temporary file `~/Development/js/skymap-rhizome/calibration/polyphy_defaults.txt`. This is your floor: if literature search produces nothing, you start here.

- [ ] **Step 2: Search the Wilde et al. 2023 paper**

  Use `WebFetch` to retrieve `https://arxiv.org/abs/2301.02719`. Read in full. Quote any sentence mentioning a parameter value into a new file `~/Development/js/skymap-rhizome/calibration/wilde_2023_quotes.txt`. If nothing — write that conclusion explicitly into the file.

- [ ] **Step 3: Search the Burchett et al. 2020 paper**

  Same procedure with `https://arxiv.org/abs/2007.04339`. Capture into `calibration/burchett_2020_quotes.txt`.

- [ ] **Step 4: Search the Elek et al. 2022 MCPM characterization**

  Use `WebSearch` to find the open-access PDF (MIT Press *Artificial Life*, "Monte Carlo Physarum Machine"). `WebFetch` the PDF. Capture into `calibration/elek_2022_quotes.txt`. This paper is the methods reference and is most likely to give explicit recommended parameter ranges.

- [ ] **Step 5: Search the Polyphorm release artefacts**

  `WebFetch` `https://github.com/CreativeCodingLab/Polyphorm` and the latest release page. Look for `polyphorm.build`, `default.cfg`, or any text file shipped with the binaries. Capture into `calibration/polyphorm_release_notes.txt`.

- [ ] **Step 6: Re-fetch the SDSS VAC metadata**

  `WebFetch` `https://data.sdss.org/sas/dr17/env/EBOSS_LSS/mcpm/v1_0_1/datacube/SDSS_z_44-476mpc/export_metadata.txt`. Save verbatim to `calibration/sdss_vac_metadata.txt`.

- [ ] **Step 7: Synthesise the starting parameter set**

  Create `~/Development/js/skymap-rhizome/calibration/CANDIDATE_PARAMETERS.md`. For each row in the table above, pick a value with reasoning. Format:

  ```markdown
  ## sense_distance

  **Value:** `0.005 × DOMAIN_SIZE_MAX` (= PolyPhy default, ≈ 4.7 Mpc for the
  556-Mpc-wide SDSS volume)

  **Source:** PolyPhy `core/discrete3D.py:39` auto-derive. No explicit value
  found in Wilde et al., Burchett et al., or Elek et al. — papers describe
  it qualitatively as "comparable to the typical inter-galaxy spacing."

  **Confidence:** medium (consistent with paper's qualitative description,
  but Burchett/Wilde may have tuned away from default).
  ```

  …and so on for every parameter.

- [ ] **Step 8: Commit the research artefacts**

  ```bash
  cd ~/Development/js/skymap-rhizome
  git add calibration/
  git commit -m "$(cat <<'EOF'
  calibration: capture starting parameter set from literature + PolyPhy defaults

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

  **STOP and check with user.** Show them `CANDIDATE_PARAMETERS.md`. If they want to manually override any value (e.g. "I remember the Burchett paper used 8° sensing angle"), capture that into the file and re-commit before proceeding to Task 3.

---

## Task 3: `skymapBinDecoder.py` — port the v4 PointCloud decoder

A ~50-line Python port of `src/data/pointCloudFormat.ts:decodePointCloud`. Reads an `ArrayBuffer`-equivalent (Python `bytes`) and returns a dict of NumPy arrays mirroring the TypeScript `PointCloud` shape.

**Files:**
- Create: `~/Development/js/skymap-rhizome/skymapBinDecoder.py`
- Create: `~/Development/js/skymap-rhizome/tests/test_skymap_bin_decoder.py`
- Create: `~/Development/js/skymap-rhizome/tests/__init__.py` (empty marker)

- [ ] **Step 1: Write the failing test first**

  Create `~/Development/js/skymap-rhizome/tests/test_skymap_bin_decoder.py`:

  ```python
  """Round-trip test for the v4 PointCloud decoder.

  We hand-build a 2-point v4 buffer in pure Python (matching the byte layout
  documented in skymap's src/data/pointCloudFormat.ts) and verify the decoder
  recovers the expected values. This is a sufficient correctness check
  because the encoder lives in the skymap repo and is itself unit-tested
  there — we only need to confirm our Python reader sees the same bytes the
  TypeScript writer emits.
  """
  import struct
  from pathlib import Path

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
      np.testing.assert_allclose(result['positions'].reshape(-1, 3),
                                 [[1.5, -2.0, 3.25], [-10.0, 20.0, -30.0]])
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
  ```

- [ ] **Step 2: Run the test to confirm it fails**

  ```bash
  cd ~/Development/js/skymap-rhizome
  .venv/bin/pytest tests/test_skymap_bin_decoder.py
  ```

  Expected: import error on `skymapBinDecoder`.

- [ ] **Step 3: Write the decoder**

  Create `~/Development/js/skymap-rhizome/skymapBinDecoder.py`:

  ```python
  """Python port of skymap's v4 PointCloud binary decoder.

  Source of truth: ../skymap/src/data/pointCloudFormat.ts — keep these two
  files in lock-step. The v4 format is 16-byte header + 64-byte per-point
  record. See the TypeScript docblock for the full field layout.

  Why a port rather than calling out to Node? Avoiding the Node dep keeps
  this repo Python-only. The decode is trivial enough (struct.unpack) that
  the port costs less than the toolchain integration would.
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
              f'unsupported version {version} — expected {VERSION}; regenerate via skymap\'s "npm run build-all"')

      expected = HEADER_BYTES + count * BYTES_PER_POINT
      if len(buf) < expected:
          raise ValueError(f'truncated buffer: have {len(buf)} bytes, need {expected}')

      # Build per-field arrays by indexing into a structured dtype view.
      # NumPy's structured dtype lets us alias the buffer with one allocation;
      # no per-record Python loop.
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

  Also create empty `tests/__init__.py`.

- [ ] **Step 4: Re-run the test, confirm pass**

  ```bash
  cd ~/Development/js/skymap-rhizome
  .venv/bin/pytest tests/test_skymap_bin_decoder.py -v
  ```

  Expected: all three tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add skymapBinDecoder.py tests/__init__.py tests/test_skymap_bin_decoder.py
  git commit -m "$(cat <<'EOF'
  feat: port skymap's v4 PointCloud decoder to Python

  Reads .bin files emitted by skymap's encodePointCloud (TypeScript).
  Uses a NumPy structured dtype for zero-loop bulk decode of the 64-byte
  per-point records. Tests cover round-trip, bad magic, and version
  rejection. Stays in lock-step with src/data/pointCloudFormat.ts in
  the skymap repo.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 4: `buildRhizomeInput.py` — SDSS calibration CSV

Reads `cache/sdss-large.bin` (the contributor fetches it from R2 themselves; the script doesn't do network I/O so it's offline-testable), filters galaxies to the Wilde et al. 44–476 Mpc comoving-distance shell, and writes `data/csv/sdss_calibration.csv` in PolyPhy's expected format.

**Coordinate frame:** Skymap's `.bin` stores positions in supergalactic Cartesian Mpc. The Wilde et al. cube was built in *equatorial* Cartesian (the VAC ships in J2000 RA/Dec/redshift space). For the calibration we want to reproduce the spatial structure visible in the reference cube, **not** match the reference cube's coordinate frame exactly — PolyPhy is frame-agnostic, and the comparison harness operates on the cubes' own intrinsic axes. So we feed PolyPhy the SDSS galaxies in supergalactic Cartesian (skymap's native frame), and the comparison harness normalises both cubes by their own bounding box before comparing structure.

**Distance filter:** We want galaxies whose *comoving distance from the origin* is in `[44, 476]` Mpc. Skymap's stored `(x, y, z)` is supergalactic Cartesian Mpc with the observer at the origin, so `sqrt(x² + y² + z²)` is exactly the comoving distance. No cosmology calculation needed.

**Why no anchor points:** see "Reality checks" in the header. The reference cube is non-cubic. We let PolyPhy auto-fit the bounding box.

**Output format (PolyPhy CSV):** `x, y, z, weight` per row, comma-separated, no header, 6 decimal places, weight `1.0` for all galaxies (matching Wilde et al.'s uniform-weight run).

**Files:**
- Create: `~/Development/js/skymap-rhizome/buildRhizomeInput.py`
- Create: `~/Development/js/skymap-rhizome/tests/test_build_rhizome_input.py`

- [ ] **Step 1: Write the failing test**

  Create `~/Development/js/skymap-rhizome/tests/test_build_rhizome_input.py`:

  ```python
  """Test the SDSS calibration shell filter and CSV format."""
  import struct
  import tempfile
  from pathlib import Path

  import numpy as np
  import pytest

  from buildRhizomeInput import filter_calibration_shell, write_polyphy_csv
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
      # Inner-edge (43 Mpc, excluded), in-shell (200 Mpc, kept), outer (500 Mpc, excluded)
      points = [
          (43.0, 0.0, 0.0),     # 43 Mpc — below shell
          (200.0, 0.0, 0.0),    # 200 Mpc — in shell
          (0.0, 300.0, 0.0),    # 300 Mpc — in shell
          (500.0, 0.0, 0.0),    # 500 Mpc — above shell
      ]
      buf = _make_cloud(points)
      kept = filter_calibration_shell(buf, d_min=44.0, d_max=476.0)
      assert kept.shape == (2, 3)
      np.testing.assert_allclose(kept[:, 0], [200.0, 0.0])
      np.testing.assert_allclose(kept[:, 1], [0.0, 300.0])


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
      # 6 decimal places
      assert '.' in first[0] and len(first[0].split('.')[1]) == 6
  ```

- [ ] **Step 2: Confirm test fails (import error)**

  ```bash
  cd ~/Development/js/skymap-rhizome
  .venv/bin/pytest tests/test_build_rhizome_input.py
  ```

- [ ] **Step 3: Write `buildRhizomeInput.py`**

  Create `~/Development/js/skymap-rhizome/buildRhizomeInput.py`:

  ```python
  #!/usr/bin/env python3
  """buildRhizomeInput.py — produce PolyPhy CSV input from skymap .bin files.

  Current scope: SDSS calibration shell only. Reads `cache/sdss-large.bin`
  (fetched by the user from R2), filters to galaxies in the 44–476 Mpc
  comoving-distance shell matching Wilde et al. 2023's `SDSS_z_44-476mpc`
  cube, writes `data/csv/sdss_calibration.csv` ready for PolyPhy's `-f` flag.

  Why no anchor points: the reference cube we're reproducing is non-cubic
  (712 x 1200 x 728). We let PolyPhy auto-fit its bounding box to the input
  galaxies, which produces a similarly non-cubic output. Anchor-pinning to
  a cubic AABB is a rhizome-shell concern for later plans.

  Why no SDSS-frame transform: skymap stores positions in supergalactic
  Cartesian Mpc; the Wilde cube was built in equatorial Cartesian. Frames
  differ but the cosmic structure is the same; the calibration's visual
  comparison is rotation-invariant (max-projections on intrinsic cube axes).
  """
  import argparse
  import sys
  from pathlib import Path

  import numpy as np

  from skymapBinDecoder import decode_point_cloud


  # Wilde et al. 2023 Cosmic Slime VAC: comoving distance shell in Mpc.
  # Source: SDSS DR17 VAC `SDSS_z_44-476mpc` directory naming.
  CALIBRATION_D_MIN_MPC = 44.0
  CALIBRATION_D_MAX_MPC = 476.0


  def filter_calibration_shell(
      buf: bytes,
      *,
      d_min: float = CALIBRATION_D_MIN_MPC,
      d_max: float = CALIBRATION_D_MAX_MPC,
  ) -> np.ndarray:
      """Decode a skymap .bin and return an (N, 3) float32 array of positions
      whose comoving distance from origin is in [d_min, d_max].

      The observer is at the origin in skymap's supergalactic Cartesian frame,
      so |position| is exactly the comoving distance. No cosmology helper
      required.
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
      parser = argparse.ArgumentParser(description='Build PolyPhy CSV input from skymap .bin')
      parser.add_argument('--shell', choices=['calibration'], default='calibration',
                          help='Which input shell to produce (only "calibration" supported in v1)')
      parser.add_argument('--bin', type=Path, default=Path('cache/sdss-large.bin'),
                          help='Path to the skymap SDSS .bin file (fetch from R2 first)')
      parser.add_argument('--out', type=Path, default=Path('data/csv/sdss_calibration.csv'),
                          help='Output CSV path (relative to repo root or absolute)')
      args = parser.parse_args()

      if not args.bin.exists():
          print(f'ERROR: input .bin not found at {args.bin}', file=sys.stderr)
          print('Fetch it first:', file=sys.stderr)
          print(f'  mkdir -p {args.bin.parent} && \\', file=sys.stderr)
          print(f'  curl -o {args.bin} https://skymap-data.rulkens.com/data/sdss-large.bin', file=sys.stderr)
          return 1

      buf = args.bin.read_bytes()
      positions = filter_calibration_shell(buf)
      print(f'Kept {positions.shape[0]} galaxies in the 44-476 Mpc shell '
            f'(of total {len(buf) // 64} in the .bin)')
      write_polyphy_csv(positions, args.out)
      print(f'Wrote {args.out}')
      return 0


  if __name__ == '__main__':
      sys.exit(main())
  ```

- [ ] **Step 4: Run tests, confirm pass**

  ```bash
  cd ~/Development/js/skymap-rhizome
  .venv/bin/pytest tests/test_build_rhizome_input.py -v
  ```

- [ ] **Step 5: Fetch the real `sdss-large.bin` and dry-run**

  ```bash
  cd ~/Development/js/skymap-rhizome
  mkdir -p cache
  curl -o cache/sdss-large.bin https://skymap-data.rulkens.com/data/sdss-large.bin
  .venv/bin/python buildRhizomeInput.py --shell calibration
  ```

  Sanity-check: the script should report on the order of 300k galaxies kept (Wilde et al. used 324,849; ours may differ slightly because skymap's SDSS catalog is a different SQL extraction). Inspect `data/csv/sdss_calibration.csv` — first few lines should look like `123.456789,-67.890123,234.567890,1.000000`.

- [ ] **Step 6: Commit**

  ```bash
  git add buildRhizomeInput.py tests/test_build_rhizome_input.py
  git commit -m "$(cat <<'EOF'
  feat: extract SDSS calibration shell to PolyPhy CSV

  Reads skymap's cache/sdss-large.bin and emits data/csv/sdss_calibration.csv
  restricted to the 44-476 Mpc comoving-distance shell matching Wilde et al.
  2023's SDSS_z_44-476mpc reference cube. Uniform weights; no anchor pinning
  (the reference cube is non-cubic so we let PolyPhy auto-fit the bbox).
  Tested with synthetic v4 buffers; dry-run against the real .bin reports
  the expected order of ~300k galaxies kept.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 5: `runRhizomePolyphy.py` — orchestrator with named parameter constants

A subprocess wrapper around PolyPhy's CLI. The parameter constants from Task 2's research live at the top of this file as module-level dataclass instances. The orchestrator handles the awkward `cd src/polyphy` requirement, removes any stale `/tmp/flag`, runs PolyPhy in batch mode, captures the newest `trace_*.npy` output, squeezes the trailing channel axis, and writes a clean `output/sdss_reproduced.npy` plus a `sidecar.json` recording every parameter, the input file hash, the PolyPhy commit, and wall-clock.

**Why no test:** the orchestrator's job is to drive a subprocess against state on disk. Testing it would mean mocking subprocess + filesystem, which is more work than it's worth and tests nothing real. We rely on Task 6's comparison harness to validate the produced cube structurally.

**Files:**
- Create: `~/Development/js/skymap-rhizome/runRhizomePolyphy.py`

- [ ] **Step 1: Write the orchestrator**

  Create `~/Development/js/skymap-rhizome/runRhizomePolyphy.py`:

  ```python
  #!/usr/bin/env python3
  """runRhizomePolyphy.py — wraps PolyPhy's 3d_discrete batch mode.

  Why a wrapper:
    1. PolyPhy hardcodes `ROOT = '../../'` in core/common.py:135, so the
       caller must `cd src/polyphy` before invocation. The wrapper hides that.
    2. PolyPhy emits timestamped `trace_*.npy` and `deposit_*.npy` into
       `data/fits/` without telling the caller which one is the latest. The
       wrapper globs for the newest after each run.
    3. PolyPhy's CLI takes pixel-space sensing distance and step size, but
       Wilde et al. and the MCPM literature specify these as fractions of the
       domain extent. The wrapper does the multiplication.
    4. CI uses `/tmp/flag` as a "force CPU" sentinel (discrete3D.py:24).
       The wrapper removes it defensively before every run.
    5. The output cube is 4D `(X, Y, Z, 1)`; we `np.squeeze(-1)` it before
       saving to `output/`.

  Parameter constants near the top of this file are the *frozen* calibration
  values. They get there by Task 8's iteration loop. Changing them requires
  re-running compareCubes.py.
  """
  import argparse
  import glob
  import hashlib
  import json
  import os
  import shutil
  import subprocess
  import sys
  import time
  from dataclasses import asdict, dataclass
  from pathlib import Path

  import numpy as np


  # ---------------------------------------------------------------------------
  # PolyPhy invocation constants. These are the calibration parameter set.
  # ---------------------------------------------------------------------------
  # Sensing distance and step size are specified as fractions of the input
  # domain's longest axis. PolyPhy's CLI takes them as floats in *pixel* units;
  # we resolve fractions → pixels at invocation time once we know the data's
  # bounding-box extent.
  #
  # On first execution of Task 5 these reflect the starting guesses captured
  # in calibration/CANDIDATE_PARAMETERS.md (Task 2). Task 8 iterates them
  # toward visual agreement with the Wilde et al. reference cube. The values
  # checked in at the end of Task 8 are the frozen calibration set.
  # ---------------------------------------------------------------------------


  @dataclass(frozen=True)
  class RhizomeParams:
      """All PolyPhy hyperparameters the calibration sweeps over.

      Frozen + dataclass so we can `asdict()` them into the sidecar JSON for
      reproducibility, and so a typo at a call site fails at parse time
      rather than silently using a default.
      """
      # --- iteration / resolution ---
      num_iterations: int = 700         # -n; Polyphorm convergence figure
      trace_res_max: int = 512          # -t; matches reference cube's largest axis

      # --- agent sensing & motion (fractions of DOMAIN_SIZE_MAX) ---
      sense_distance_frac: float = 0.005   # PolyPhy default (auto-derive)
      step_size_frac: float = 0.0005       # PolyPhy default
      sensing_angle_deg: float = 30.0      # PPConfig default; refine in Task 2 research

      # --- deposit / trace attenuation ---
      deposit_attenuation: float = 0.90    # PPConfig default; tune
      trace_attenuation: float = 0.96      # PPConfig default; tune

      # --- sampling distributions ---
      distance_distribution: str = 'maxwell-boltzmann'  # PPConfig default
      directional_distribution: str = 'cone'            # PPConfig default
      directional_mutation: str = 'stochastic'          # PPConfig default
      deposit_fetching: str = 'noise-perturbed-NN'      # PPConfig default
      agent_boundary_handling: str = 're-initialize-randomly'


  # The locked-in calibration set. Initial values here are the candidate set;
  # Task 8 updates them in-place as iterations progress.
  CALIBRATION_PARAMS = RhizomeParams()


  # Path to the vendored PolyPhy checkout (resolved from this file's location).
  REPO_ROOT = Path(__file__).resolve().parent
  POLYPHY_ROOT = REPO_ROOT / 'vendor' / 'polyphy'


  def remove_cpu_force_flag() -> None:
      """PolyPhy's discrete3D.py:24 forces CPU if /tmp/flag exists. Remove it."""
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
      """Return the short SHA of the pinned PolyPhy submodule."""
      out = subprocess.run(
          ['git', '-C', str(POLYPHY_ROOT), 'rev-parse', '--short', 'HEAD'],
          capture_output=True, text=True, check=True,
      )
      return out.stdout.strip()


  def build_cli_args(params: RhizomeParams, csv_relative_to_polyphy_root: Path,
                     domain_size_max_pixels: float) -> list[str]:
      """Translate a RhizomeParams into a list of PolyPhy CLI tokens."""
      sense_distance_px = params.sense_distance_frac * domain_size_max_pixels
      step_size_px = params.step_size_frac * domain_size_max_pixels
      return [
          '3d_discrete', '-b',
          '-n', str(params.num_iterations),
          '-t', str(params.trace_res_max),
          '-f', str(csv_relative_to_polyphy_root),
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


  def run_polyphy(csv_path: Path, params: RhizomeParams) -> Path:
      """Invoke PolyPhy on csv_path, return the path to the new trace .npy.

      Note on the pixel conversion: PolyPhy treats sense_distance and step_size
      in trace-grid pixel units. For the data we're feeding it the trace's
      longest axis = trace_res_max, so "fraction of domain" × trace_res_max
      gives the pixel value PolyPhy expects.
      """
      remove_cpu_force_flag()

      # PolyPhy resolves -f relative to its own ROOT (which is `../../` from
      # src/polyphy/). Easiest: copy our CSV into vendor/polyphy/data/csv/.
      polyphy_csv_dir = POLYPHY_ROOT / 'data' / 'csv'
      polyphy_csv_dir.mkdir(parents=True, exist_ok=True)
      staged_csv = polyphy_csv_dir / csv_path.name
      shutil.copy(csv_path, staged_csv)
      csv_relative = Path('data/csv') / csv_path.name

      cli_args = build_cli_args(params, csv_relative, params.trace_res_max)

      # Wipe stale trace outputs so our "newest" glob is unambiguous.
      fits_dir = POLYPHY_ROOT / 'data' / 'fits'
      fits_dir.mkdir(parents=True, exist_ok=True)
      stale = sorted(fits_dir.glob('trace_*.npy'))
      # Keep stale around for forensic comparison if a run goes wrong; rename
      # rather than delete.
      if stale:
          archive = fits_dir / '_archive'
          archive.mkdir(exist_ok=True)
          for old in stale:
              old.rename(archive / old.name)

      print(f'Running PolyPhy with: {" ".join(cli_args)}')
      t0 = time.perf_counter()
      result = subprocess.run(
          [sys.executable, 'polyphy.py', *cli_args],
          cwd=POLYPHY_ROOT / 'src' / 'polyphy',
          check=True,
      )
      elapsed = time.perf_counter() - t0
      print(f'PolyPhy returned in {elapsed:.1f}s')

      # The newest trace_*.npy is our output.
      new_traces = sorted(fits_dir.glob('trace_*.npy'))
      if not new_traces:
          raise RuntimeError(f'PolyPhy produced no trace output in {fits_dir}')
      return new_traces[-1]


  def squeeze_and_save(raw_path: Path, out_path: Path) -> np.ndarray:
      """Load the 4D `(X, Y, Z, 1)` trace, squeeze, save as 3D float32."""
      cube = np.load(raw_path)
      if cube.ndim == 4 and cube.shape[-1] == 1:
          cube = cube.squeeze(-1)
      if cube.ndim != 3:
          raise RuntimeError(f'unexpected trace cube shape {cube.shape}')
      out_path.parent.mkdir(parents=True, exist_ok=True)
      np.save(out_path, cube.astype(np.float32))
      return cube


  def write_sidecar(out_path: Path, *, params: RhizomeParams, input_csv: Path,
                    cube_shape: tuple[int, int, int], elapsed_s: float) -> None:
      sidecar = {
          'params': asdict(params),
          'input_csv_sha256': hash_file(input_csv),
          'polyphy_commit': polyphy_commit(),
          'cube_shape': list(cube_shape),
          'wall_clock_s': elapsed_s,
          'produced_at': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
      }
      sidecar_path = out_path.with_suffix('.json')
      sidecar_path.write_text(json.dumps(sidecar, indent=2))
      print(f'Wrote sidecar {sidecar_path}')


  def main() -> int:
      parser = argparse.ArgumentParser(description='Run PolyPhy for a rhizome shell')
      parser.add_argument('--shell', choices=['calibration'], default='calibration')
      parser.add_argument('--csv', type=Path, default=Path('data/csv/sdss_calibration.csv'))
      parser.add_argument('--out', type=Path, default=Path('output/sdss_reproduced.npy'))
      args = parser.parse_args()

      if not args.csv.exists():
          print(f'ERROR: {args.csv} not found. Run buildRhizomeInput.py first.', file=sys.stderr)
          return 1

      t0 = time.perf_counter()
      raw_trace = run_polyphy(args.csv, CALIBRATION_PARAMS)
      cube = squeeze_and_save(raw_trace, args.out)
      elapsed = time.perf_counter() - t0

      write_sidecar(args.out, params=CALIBRATION_PARAMS, input_csv=args.csv,
                    cube_shape=cube.shape, elapsed_s=elapsed)
      print(f'Saved reproduced cube to {args.out} (shape={cube.shape})')
      return 0


  if __name__ == '__main__':
      sys.exit(main())
  ```

- [ ] **Step 2: Smoke-run the orchestrator**

  ```bash
  cd ~/Development/js/skymap-rhizome
  .venv/bin/python runRhizomePolyphy.py --shell calibration
  ```

  Expected: PolyPhy banner `[Taichi] Starting on arch=metal`, ~30 s wall-clock for ~300k input points × 700 iters at 512³ trace resolution, output to `output/sdss_reproduced.npy` plus `output/sdss_reproduced.json`.

  **Failure modes to watch for:**
  - `ROOT` resolution error → confirm `cd` worked and CSV path is right.
  - `[Taichi] Starting on arch=x64` → `/tmp/flag` survived our cleanup; investigate.
  - 4D-not-3D cube → `squeeze_and_save` should handle it; if it complains, the channel axis isn't the last one.
  - Memory blow-up at 512³ → drop to `trace_res_max=256` in `CALIBRATION_PARAMS` and re-record that in CANDIDATE_PARAMETERS.md.

- [ ] **Step 3: Commit**

  ```bash
  git add runRhizomePolyphy.py
  git commit -m "$(cat <<'EOF'
  feat: PolyPhy orchestrator with named parameter constants

  Wraps PolyPhy's 3d_discrete batch mode: handles the cd-to-src/polyphy
  requirement, removes /tmp/flag, stages the CSV inside the vendored tree,
  archives stale traces, and squeezes the 4D output to a clean 3D float32
  .npy plus a sidecar JSON recording every parameter, input hash, and
  PolyPhy commit.

  Parameter constants live in a frozen dataclass at module top; first run
  uses the Task 2 candidate set. Task 8's iteration loop updates these
  values in place; the final committed state is the locked calibration set.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 6: `compareCubes.py` — visual + numerical comparison

Loads two `.npy` cubes (reproduced + reference), normalises each to unit max (so absolute intensity differences don't drown out structural ones), aligns shapes (resample the smaller to match the larger via `scipy.ndimage.zoom`), produces:

1. A side-by-side max-projection PNG along all three axes (matplotlib).
2. Quantitative comparison: cross-correlation (Pearson r) per axis projection, intensity-histogram KL divergence.
3. Per-axis log of differences printed to stdout so it can be redirected into `calibration/sweep_log.txt`.

**Files:**
- Create: `~/Development/js/skymap-rhizome/compareCubes.py`
- Create: `~/Development/js/skymap-rhizome/tests/test_compare_cubes.py`

- [ ] **Step 1: Write the failing test**

  Create `~/Development/js/skymap-rhizome/tests/test_compare_cubes.py`:

  ```python
  """Test the comparison harness on synthetic cube pairs."""
  import numpy as np
  import pytest

  from compareCubes import correlation_score, normalise_max, resample_to_match


  def test_normalise_max_unit_peak():
      cube = np.array([[[0.0, 0.5], [1.0, 2.0]]], dtype=np.float32)
      out = normalise_max(cube)
      assert out.max() == pytest.approx(1.0)
      assert out.min() == pytest.approx(0.0)


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
      b = np.ones((20, 20, 20), dtype=np.float32)
      a_resampled = resample_to_match(a, b.shape)
      assert a_resampled.shape == b.shape
  ```

- [ ] **Step 2: Confirm tests fail**

  ```bash
  cd ~/Development/js/skymap-rhizome
  .venv/bin/pytest tests/test_compare_cubes.py
  ```

- [ ] **Step 3: Write `compareCubes.py`**

  Create `~/Development/js/skymap-rhizome/compareCubes.py`:

  ```python
  #!/usr/bin/env python3
  """compareCubes.py — visual + numerical reproducibility comparison.

  Inputs: two 3D float32 `.npy` cubes (reproduced and reference).
  Output: a side-by-side max-projection PNG plus stdout comparison stats.

  Cubes may differ in shape (the Wilde et al. reference is 712 x 1200 x 728;
  our reproduction at trace_res_max=512 will be 512 along its longest axis
  and proportionally smaller on the other two). The comparison resamples
  whichever is smaller up to match the larger.

  Per-axis max-projections are the right comparison primitive because (a)
  they collapse the depth dimension MCPM's trace cube doesn't carry
  consistent absolute intensity in, (b) they make filament continuity
  obvious to the eye, and (c) cross-correlation on 2D projections is much
  less sensitive to small voxel-grid misalignments than 3D correlation is.
  """
  import argparse
  import sys
  from pathlib import Path

  import matplotlib.pyplot as plt
  import numpy as np
  from scipy.ndimage import zoom


  def normalise_max(cube: np.ndarray) -> np.ndarray:
      """Scale so peak voxel = 1.0. Returns a fresh array; doesn't mutate input."""
      peak = float(cube.max())
      if peak <= 0:
          return cube.astype(np.float32, copy=True)
      return (cube / peak).astype(np.float32)


  def resample_to_match(cube: np.ndarray, target_shape: tuple[int, int, int]) -> np.ndarray:
      """Resample cube to target_shape via trilinear interpolation."""
      factors = tuple(t / s for t, s in zip(target_shape, cube.shape))
      return zoom(cube, factors, order=1).astype(np.float32)


  def correlation_score(a: np.ndarray, b: np.ndarray) -> float:
      """Pearson correlation between two flattened arrays of the same shape."""
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
      """Return (xy, xz, yz) max-projections."""
      return cube.max(axis=2), cube.max(axis=1), cube.max(axis=0)


  def render_side_by_side(reproduced: np.ndarray, reference: np.ndarray,
                          out_path: Path) -> None:
      """Write a 3x2-grid PNG: rows = axes, cols = reproduced vs reference."""
      proj_a = max_projections(reproduced)
      proj_b = max_projections(reference)
      fig, axes = plt.subplots(3, 2, figsize=(8, 12))
      axis_names = ['xy (z-projected)', 'xz (y-projected)', 'yz (x-projected)']
      for row, (a_proj, b_proj, name) in enumerate(zip(proj_a, proj_b, axis_names)):
          axes[row, 0].imshow(a_proj.T, origin='lower', cmap='magma',
                              norm='log' if a_proj.max() > 0 else None)
          axes[row, 0].set_title(f'Reproduced — {name}')
          axes[row, 0].axis('off')
          axes[row, 1].imshow(b_proj.T, origin='lower', cmap='magma',
                              norm='log' if b_proj.max() > 0 else None)
          axes[row, 1].set_title(f'Reference — {name}')
          axes[row, 1].axis('off')
      fig.tight_layout()
      out_path.parent.mkdir(parents=True, exist_ok=True)
      fig.savefig(out_path, dpi=120, bbox_inches='tight')
      plt.close(fig)


  def main() -> int:
      parser = argparse.ArgumentParser(description='Compare reproduced cube vs reference')
      parser.add_argument('--reproduced', type=Path, required=True)
      parser.add_argument('--reference', type=Path, required=True)
      parser.add_argument('--out', type=Path, default=Path('calibration/compare.png'))
      args = parser.parse_args()

      reproduced = np.load(args.reproduced).astype(np.float32)
      reference = np.load(args.reference).astype(np.float32)
      # The reference may be 4D if it came straight from PolyPhy without squeeze.
      if reference.ndim == 4 and reference.shape[-1] == 1:
          reference = reference.squeeze(-1)

      print(f'Reproduced shape: {reproduced.shape}, min/max: {reproduced.min():.4f}/{reproduced.max():.4f}')
      print(f'Reference  shape: {reference.shape}, min/max: {reference.min():.4f}/{reference.max():.4f}')

      reproduced = normalise_max(reproduced)
      reference = normalise_max(reference)

      # Resample the smaller cube up to match the larger one for 3D correlation.
      target = max(reproduced.shape, reference.shape, key=lambda s: int(np.prod(s)))
      if reproduced.shape != target:
          reproduced_resampled = resample_to_match(reproduced, target)
      else:
          reproduced_resampled = reproduced
      if reference.shape != target:
          reference_resampled = resample_to_match(reference, target)
      else:
          reference_resampled = reference

      r3d = correlation_score(reproduced_resampled, reference_resampled)
      print(f'3D Pearson correlation: {r3d:+.4f}')

      # Per-axis 2D correlations on max-projections.
      proj_r = max_projections(reproduced_resampled)
      proj_f = max_projections(reference_resampled)
      for name, a_p, b_p in zip(['xy', 'xz', 'yz'], proj_r, proj_f):
          r = correlation_score(a_p, b_p)
          print(f'  Pearson({name} max-projection): {r:+.4f}')

      render_side_by_side(reproduced, reference, args.out)
      print(f'Wrote comparison PNG to {args.out}')
      return 0


  if __name__ == '__main__':
      sys.exit(main())
  ```

- [ ] **Step 4: Run tests, confirm pass**

  ```bash
  cd ~/Development/js/skymap-rhizome
  .venv/bin/pytest tests/test_compare_cubes.py -v
  ```

- [ ] **Step 5: Fetch the reference cube and dry-run**

  ```bash
  cd ~/Development/js/skymap-rhizome
  mkdir -p reference
  curl -o reference/mcpm_sdss_d2.npy https://skymap-data.rulkens.com/data/raw/mcpm/mcpm_sdss_d2.npy
  .venv/bin/python compareCubes.py \
      --reproduced output/sdss_reproduced.npy \
      --reference reference/mcpm_sdss_d2.npy \
      --out calibration/compare_iter0.png
  ```

  Expected output: `compare_iter0.png` written; stdout shows 3D Pearson correlation (likely 0.1-0.4 for the unrefined first run — that's fine, the iteration loop is what brings it up).

- [ ] **Step 6: Commit**

  ```bash
  git add compareCubes.py tests/test_compare_cubes.py
  git commit -m "$(cat <<'EOF'
  feat: numerical + visual cube comparison harness

  Loads reproduced and reference cubes, normalises to unit peak, resamples
  the smaller up to match the larger, computes 3D Pearson correlation and
  three per-axis max-projection 2D correlations. Renders a 3x2 magma PNG
  for visual review. Iteration loop in Task 8 watches the correlation
  numbers and the PNG side-by-side as the parameter set converges on the
  reference.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 7: Baseline iteration 0 — record the unrefined starting state

Before any tuning, run the full pipeline end-to-end with the Task 2 candidate parameter set, save artefacts under `calibration/iter0/`, and document the starting score in `CALIBRATION.md`. This is the floor against which all subsequent iterations are measured.

- [ ] **Step 1: Run the full pipeline**

  ```bash
  cd ~/Development/js/skymap-rhizome
  # CSV already produced in Task 4, cube already produced in Task 5,
  # comparison already produced in Task 6 — but we want a clean named copy.
  .venv/bin/python runRhizomePolyphy.py --shell calibration
  .venv/bin/python compareCubes.py \
      --reproduced output/sdss_reproduced.npy \
      --reference reference/mcpm_sdss_d2.npy \
      --out calibration/iter0/compare.png \
      | tee calibration/iter0/stats.txt
  cp output/sdss_reproduced.json calibration/iter0/params.json
  ```

- [ ] **Step 2: Begin `CALIBRATION.md`**

  Create `~/Development/js/skymap-rhizome/CALIBRATION.md`:

  ```markdown
  # SDSS Reproduction Calibration Log

  **Goal:** match the structural appearance of Wilde et al. 2023's published
  `SDSS_z_44-476mpc` MCPM cube (skymap's `mcpm_sdss_d2.npy`) by running
  PolyPhy on our own SDSS catalog with parameter tuning.

  **Acceptance criterion:** the comparison PNG shows the same major
  filaments (Coma, Perseus-Pisces, Sloan Great Wall) at the same locations
  with comparable intensity. Pixel-perfect match is not the goal — our
  input preprocessing differs from Wilde's (no RSD correction, no DBSCAN
  clustering), so absolute intensity will always differ. *Structural*
  agreement, as visible in max-projection PNGs and Pearson correlation
  ≥ 0.6 on at least two of three axis projections, is the bar.

  ## Iteration log

  ### iter 0 — Task 2 candidate parameters (baseline)

  **Parameters:** `calibration/iter0/params.json` (= PolyPhy defaults + any
  manual overrides from Task 2 Step 8).

  **Stats:** see `calibration/iter0/stats.txt`. Initial 3D Pearson correlation
  `[fill in]`. Per-axis: xy `[fill]`, xz `[fill]`, yz `[fill]`.

  **Visual:** `calibration/iter0/compare.png`. Notes from inspection:
  - `[fill in: filament locations roughly correct / shifted / smeared / absent]`
  - `[fill in: intensity contrast vs reference]`
  - `[fill in: noise floor / agent diffusion observable]`

  **Decision:** baseline recorded; proceed to parameter sweeps in iter 1+.
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add CALIBRATION.md calibration/iter0/
  git commit -m "$(cat <<'EOF'
  calibration(iter 0): record baseline reproduction against Wilde et al. reference

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

  **STOP and check with user.** Show them `calibration/iter0/compare.png` and the printed correlation numbers. The user decides whether the starting state is in the right ballpark or whether something obvious is broken (e.g. all-noise output, wrong domain extent, agents not depositing). If broken, fix before proceeding to Task 8.

---

## Task 8: Parameter tuning iterations (3–5 named rounds)

**This task is inherently non-TDD.** We change a small group of related parameters, rerun the pipeline, inspect the PNG side-by-side with iter 0, decide if it's better or worse, and update `CALIBRATION_PARAMS` in `runRhizomePolyphy.py`. The "test" is the user's eye on the PNG plus the printed correlation numbers.

**Rules of engagement:**

- Change one *group* of parameters per iteration (e.g. "sensing only", "deposit-attenuation only"), not everything at once. We want to attribute visual changes to causes.
- Each iteration gets a name (`iter1_sensing`, `iter2_attenuation`, etc.) and its own folder under `calibration/iter<n>_<name>/`.
- Each iteration's commit message records what changed and why.
- After each iteration: **STOP and check with user.** They eyeball `compare.png` against iter 0 and the previous iteration. Their call whether to continue, revert, or escalate.
- Maximum 5 iterations before re-assessing the approach. If after 5 we're not visibly closer, the cause is upstream (wrong frame, wrong filter, wrong input) — surface it to the user rather than tuning further.

The candidate iteration plan below is a suggestion; the actual sequence depends on what iter 0 looks like.

### Iter 1 — sensing distance & angle

- [ ] Change in `runRhizomePolyphy.py`'s `CALIBRATION_PARAMS`:
  - Try `sense_distance_frac = 0.01` (double the default; closer to MCPM's recommended "comparable to inter-galaxy spacing" at 5-10 Mpc on a 500 Mpc domain).
  - Try `sensing_angle_deg` values in `{15, 30, 45}` — pick whichever from Task 2 research came closest.
- [ ] Re-run pipeline, save under `calibration/iter1_sensing/`.
- [ ] Update `CALIBRATION.md` with stats + visual notes.
- [ ] Commit:
  ```bash
  git commit -m "$(cat <<'EOF'
  calibration(iter 1): sweep sensing distance and angle

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```
- [ ] **STOP and check with user.**

### Iter 2 — attenuation

- [ ] Adjust `deposit_attenuation` and `trace_attenuation` in `CALIBRATION_PARAMS`. The MCPM literature suggests sweep ranges of 0.85–0.95 for deposit decay and 0.92–0.98 for trace decay.
- [ ] Save under `calibration/iter2_attenuation/`, log, commit, **STOP and check**.

### Iter 3 — iteration count & step size

- [ ] Vary `num_iterations` (try 300, 700, 1500) and `step_size_frac` (try 0.0005, 0.001).
- [ ] Save under `calibration/iter3_iter_step/`, log, commit, **STOP and check**.

### Iter 4 — distribution choices (only if structure still wrong)

- [ ] Toggle `directional_distribution` between `discrete` and `cone`. Toggle `directional_mutation` between `deterministic` and `stochastic`. These are coarser-grained changes that produce more visible structural differences than the previous numerical tweaks.
- [ ] Save under `calibration/iter4_distributions/`, log, commit, **STOP and check**.

### Iter 5 — final lock-in

- [ ] Take the best-performing parameter set from iter 1-4 and commit it as the final `CALIBRATION_PARAMS` in `runRhizomePolyphy.py`. Re-run one more time to produce the canonical `calibration/compare.png` (no subfolder suffix — this is the headline image referenced in the README).
- [ ] Update `CALIBRATION.md` with a "Locked-in parameters" section quoting the final dataclass values verbatim and explaining each one.
- [ ] Commit:
  ```bash
  git commit -m "$(cat <<'EOF'
  calibration: lock in SDSS-reproduction parameter set

  After N iterations of structural comparison against Wilde et al. 2023's
  published Cosmic Slime VAC cube, freezing the following parameters as
  the rhizome calibration set:
  [list final values]

  3D Pearson correlation: [value]; per-axis 2D max-projection correlations:
  xy=[value], xz=[value], yz=[value]. Visual agreement on Coma, Perseus-
  Pisces, and Sloan Great Wall confirmed in calibration/compare.png.

  These parameters carry forward to the full-sky rhizome shells unchanged.

  Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 9: Acceptance review with user

- [ ] **Step 1: Run the full pipeline one last time from scratch on a clean checkout-equivalent state**

  Test the README's reproduction recipe verbatim:

  ```bash
  cd ~/Development/js/skymap-rhizome
  rm -rf output/ data/csv/
  .venv/bin/python buildRhizomeInput.py --shell calibration
  .venv/bin/python runRhizomePolyphy.py --shell calibration
  .venv/bin/python compareCubes.py \
      --reproduced output/sdss_reproduced.npy \
      --reference reference/mcpm_sdss_d2.npy \
      --out calibration/compare.png
  ```

  Confirm `calibration/compare.png` is byte-identical (or visually equivalent within float-precision noise) to the version committed in Task 8 iter 5.

- [ ] **Step 2: Verify acceptance criteria**

  - [ ] `calibration/compare.png` exists and is committed.
  - [ ] `CALIBRATION.md` documents every iteration and the final locked-in values.
  - [ ] `runRhizomePolyphy.py`'s `CALIBRATION_PARAMS` matches what `CALIBRATION.md` says.
  - [ ] `pytest tests/` passes green (3 test files, ~10 tests total).
  - [ ] All commits use the user's git identity (verify `git log --format='%an'` shows the user's name, never `Claude`).
  - [ ] All commits end with `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` (verify `git log --format='%B'` shows the trailer on every commit).
  - [ ] No commits were pushed to a remote (this repo doesn't have one yet — that's a user decision for after acceptance).

- [ ] **Step 3: Hand back to user**

  Show them:
  - `calibration/compare.png`
  - `CALIBRATION.md`'s "Locked-in parameters" section
  - `git log --oneline` of the calibration branch
  - Total wall-clock for one full pipeline run

  Ask:
  - Are they satisfied with the structural match?
  - Do they want to create a GitHub remote for `skymap-rhizome` now, or defer until the full-sky shells are also producing?
  - Are they ready to start the next plan (full-sky rhizome shell production)?

---

## Out of scope reminders

This plan does **not** include any of the following — they belong to later plans:

- Running PolyPhy on 2MRS+GLADE catalogs (the three full-sky shells).
- Building a `.npy → .scfd` converter in skymap.
- Wiring rhizome shells into skymap's `volumeFieldDefaults`, scalar-volume renderer, or settings UI.
- Migrating from the MCPM toggle to a rhizome toggle.
- Uploading any cubes to R2.
- DisPerSE involvement.
- Anything from the rhizome spec's "Open follow-ups" section (luminosity weighting, `1/V_max` correction, deposit-channel overlay, etc.).
