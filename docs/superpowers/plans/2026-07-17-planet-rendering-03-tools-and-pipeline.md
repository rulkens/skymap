# Planet rendering — Plan 03: fetch / build / R2 texture pipeline

**Spec:** `docs/superpowers/specs/2026-07-17-planet-rendering.md` — this plan
executes §3 (verified sources), §9 pipeline mechanics, §10 (tools / pipeline),
and closes the §12 Definition of Done. It mirrors the catalog raw→build→R2
pipeline verbatim (Q5 Option A).
**Sequencing:** LAST of three plans, on the same branch/PR, after Plan 02. It
produces the textures the Plan 02 renderers demand. The FULL-res fetch +
`build-textures` + `sync-r2-secure` run POST-MERGE from the MAIN worktree by the
user (spec §12, `project_worktree_data_isolation`,
`feedback_announce_big_downloads`); this plan lands green against the **dev
subset** only.
**Plan style (OVERRIDES upstream `writing-plans`):**
`docs/superpowers/conventions/plan-style.md` — **contract code yes,
implementation code no.** Cite `path:line`; test names + assertions ARE the
acceptance criteria.

## Goal

Stand up the texture asset pipeline: fetch the verified CC-BY / public-domain
sources into `data/raw/textures/`, build per-body tiered JPGs (+ the ring PNG)
into gitignored `public/data/images/textures/`, sweep them to R2 alongside the
catalog `.bin`s, and add the required attribution. A new textured body is one
`BODY_TEXTURE_REGISTRY` row (Plan 01) plus its `rawDataRegistry` entries — one
table feeds the runtime clamp, the build tier-set, and the fetch source list
(spec §4.3).

## Global constraints (house rules — override defaults)

- **Contract code yes, implementation code no.** Signatures + test names +
  tables only.
- **One function per util file** in `tools/utils/` — filename = symbol. Deep
  relative imports, no barrels.
- **`type` aliases, never `interface`.** `Vec3`/`Vec2` aliases, never raw tuples.
- **Raw-data paths via `rawDataPath('<catalog>.<artifact>')`** — NEVER a literal
  `data/raw/...` string (`feedback_raw_data_registry`). New rows use dotted-lower
  keys `textures.<artifact>`.
- **Announce big downloads** — the fetcher prints the ~700 MB full-fetch size up
  front and requires an explicit confirmation flag before pulling
  (`feedback_announce_big_downloads`).
- **Provenance README** at `data/raw/textures/README.md` (upstream URLs,
  licences, dims, fetch date, checksums) — covered by the `!/data/raw/**/README.md`
  gitignore glob, tracks with a plain `git add`.
- **Didactic, timeless comments** — why + the alternative; no dates/PR history.
- **Tests mirror the tree**; `testing.md`'s one question. The `.sha256` sidecars
  + tier-selection are the load-bearing external-format / build-contract tests;
  no source-text greps, no full-listing restatements.
- **Suite stays green** each task; the final gate (Task 8) runs `npm run
  typecheck` + `npm test`.

## Adding-a-new-raw-data-source checklist (CLAUDE.md — bind it here)

`data/raw/textures/` is a new per-catalog subdir; every file is registered in
`tools/utils/io/rawDataRegistry.ts` under `textures.*`; consumers call
`rawDataPath('textures.<artifact>')`; the README + `.sha256` sidecars are the
committed provenance (the `!/data/raw/**/README.md` + `!/data/raw/**/*.sha256`
globs cover them — a plain `git add`, no `-f`). The raw source images themselves
are `source: 'gitignored'` (build inputs, like the catalog `.dat` files).

---

## Task 1 — `rawDataRegistry` `textures.*` rows

**Files:** `tools/utils/io/rawDataRegistry.ts` (modify),
`tests/tools/utils/io/rawDataRegistry.test.ts` (modify if present).

Add one `textures.<artifact>` row per raw source in the spec §3 tables —
Solar System Scope planet + Moon JPGs + the ring PNG, the NASA BMNG Earth JPG (+
its 5400×2700 dev sibling), and the four USGS GeoTIFFs — plus `textures.dir` for
the built-output directory (dynamically-named tier variants join it, per the
CLAUDE.md "register the directory as `<catalog>.dir`" rule). Each row:
`source: 'gitignored'` (raw sources) or `'committed'` (`.sha256`/README via the
globs), a one-line `description`, the `upstream` URL, and `fetcher:
'tools/fetch/fetchTextures.ts'`.

- [ ] Add the `textures.*` rows (SSS bodies + ring, NASA BMNG full + dev sibling,
  USGS ×4, `textures.dir`). Keys dotted-lowercase (`textures.sssMars8k`,
  `textures.usgsIo`, `textures.nasaBmng`, `textures.nasaBmngDev`,
  `textures.sssRing`, `textures.dir`, …); URLs verbatim from spec §3.
- [ ] Test (if `rawDataRegistry` has a structural test) `textures rows resolve` —
  every `textures.*` key resolves through `rawDataPath` and carries an `upstream`
  URL (structural invariant, not a listing restatement).
- [ ] `npm test -- rawDataRegistry` → green (or typecheck-only if untested).
  Commit.

## Task 2 — `fetchTextures` (GET-only, resume, sha256, size-gated)

**Files:** `tools/fetch/fetchTextures.ts` (new),
`data/raw/textures/README.md` (new — provenance),
`tests/tools/fetch/fetchTextures.test.ts` (new — the pure helpers only).

**Behaviour (spec §3, §10):** `downloadWithResume` in the shape of
`fetchCosmicflows4.ts` (resume on on-disk byte count), writing raw sources to
`rawDataPath('textures.<artifact>')`. **GET-only — NO `HEAD`, NO `Range` probe:**
`solarsystemscope.com` returns `200 text/html` to `HEAD` and ignores `Range`
(spec §3), so resume is by on-disk byte count alone. Writes `.sha256` sidecars
(`createHash('sha256')`, the `fetchCosmicflows4.ts` pattern). **Prints the ~700 MB
full-fetch total up front and requires an explicit confirmation flag** (e.g.
`--confirm`) before the full pull (`feedback_announce_big_downloads`). `--dev`
fetches ONLY the small subset — the SSS 2k JPGs + the NASA 5400×2700 sibling
(~7 MB) — to exercise the pipeline visually without the full pull. `npm run
fetch-textures` wires to it (Task 6).

The provenance README documents each upstream URL, licence, native dims, fetch
date, and checksum (spec §3 + §10) — the SSS CC-BY-4.0 line, NASA Earth
Observatory (BMNG, PD), NASA/USGS (moon mosaics, PD).

- [ ] Add `fetchTextures.ts`. Didactic module header: WHY GET-only (SSS breaks
  `HEAD` + `Range`, spec §3), the size-gate + `--dev` subset, the `.sha256`
  sidecars. Reads/writes only through `rawDataPath('textures.*')`.
- [ ] Add `data/raw/textures/README.md` — the provenance table (upstream URLs,
  licences, dims, fetch date placeholder, checksums).
- [ ] Test `fetchTextures --dev selects the small subset` — the pure
  subset-selection helper returns exactly the SSS-2k + NASA-dev keys for `--dev`,
  and the full source list otherwise (a behavioural property of the subset
  chooser, driven headlessly — NO network in the test). If the size-gate
  confirmation is a pure predicate, assert it blocks the full pull without the
  flag.
- [ ] `npm test -- fetchTextures` → green. Commit.

## Task 3 — `buildTextures` (sharp; GeoTIFF; tint; tier downsample; ring PNG)

**Files:** `tools/textures/buildTextures.ts` (new),
`tools/textures/emittedTiersForBody.ts` (new — the pure tier-selection helper),
`tests/tools/textures/emittedTiersForBody.test.ts` (new).

**Signature (match exactly — the pure helper the build reads, spec §10 + §11):**

```ts
// emittedTiersForBody.ts — registry maxTier → the non-upscaled tier set to emit
export function emittedTiersForBody(id: BodyTextureId): readonly Tier[];
```

**Build behaviour (spec §3, §10 — sharp/libvips):** reads GeoTIFF (USGS) + JPEG
(SSS) + BMNG; multiplies `grayscaleTint` (from `BODY_TEXTURE_REGISTRY`, Plan 01)
into the mono USGS sources (Europa, Callisto); downsamples to each body's
`emittedTiersForBody` tiers — **only non-upscaled** (reads
`BODY_TEXTURE_REGISTRY[id].maxTier`); JPG quality ~80; the ring is
PNG passthrough+downsample (alpha preserved). Emits
`public/data/images/textures/<bodyId>-<px>.jpg` (+ `saturn-ring-<px>.png`).
Sharp precedent: `tools/famous/fetchFamousImages.ts`. `npm run build-textures`
wires to it (Task 6). Reads sources via `rawDataPath('textures.*')`; writes under
`rawDataPath('textures.dir')` / `public/data/images/textures/`.

- [ ] Add `emittedTiersForBody.ts` — the pure registry→tier-set helper. Didactic
  docblock: never emit above `maxTier` (never upscale, spec §3); the 4k tier is a
  build-time downsample of the 8k raw.
- [ ] Add `buildTextures.ts`. Didactic module header: the three source formats,
  the grayscale tint for mono USGS moons, the non-upscaled tier downsample, the
  ring-PNG alpha passthrough. All raw reads via `rawDataPath('textures.*')`.
- [ ] Test `emittedTiersForBody honours the ceiling` — Uranus (`maxTier: 'small'`)
  → `['small']` only; Venus (`'medium'`) → `['small', 'medium']`; Mars
  (`'large'`) → `['small', 'medium', 'large']` (the non-upscaling build contract,
  hand-derived from the ceilings — NOT a full-registry restatement).
- [ ] `npm test -- emittedTiersForBody` → green. Commit.

## Task 4 — `collectTextureImages` + `syncR2` sweep

**Files:** `tools/deploy/collectTextureImages.ts` (new),
`tools/deploy/syncR2.ts` (modify — add the sweep in `main`),
`tests/tools/deploy/collectTextureImages.test.ts` (new).

**Signature (match exactly — mirrors `collectHiResImages.ts`):**

```ts
export function collectTextureImages(sourceDir: string): TextureImageUpload[];
//  sweeps public/data/images/textures/ → r2Key `data/images/textures/<file>`
//  returns [] when the dir is absent; only .jpg / .png files
```

**Sweep (spec §10):** a second sweep in `syncR2.ts`'s `main` (like the hi-res
sweep at `syncR2.ts:417-444`), so `dataUrl('images/textures/…')` resolves. The
r2Key `data/images/textures/<file>` matches the `dataUrl` base like the `.bin`s.

- [ ] Add `collectTextureImages.ts` (`TextureImageUpload` = `{ localPath, r2Key
  }`, same shape as `HiResImageUpload`). Didactic docblock: mirrors
  `collectHiResImages`; the `data/images/textures/` r2Key prefix matches
  `dataUrl`.
- [ ] Wire the sweep into `syncR2.ts`'s `main` beside the hi-res sweep.
- [ ] Test `collectTextureImages maps files to the textures r2 prefix` — a
  fixture dir of `mars-2048.jpg` + `saturn-ring-8192.png` → r2Keys
  `data/images/textures/mars-2048.jpg` / `…/saturn-ring-8192.png`; an absent dir
  → `[]`; a non-image file is skipped (the r2-key mapping + sweep coverage,
  spec §11).
- [ ] `npm test -- collectTextureImages` → green. Commit.

## Task 5 — Splash attribution

**Files:** `src/components/Splash/Splash.tsx` (modify — the existing `.credits`
`<p>` at `Splash.tsx:205`).

Add the credit line to the Splash footer credits paragraph (spec §10): Solar
System Scope (CC BY 4.0), NASA Earth Observatory (Blue Marble), NASA/USGS (moon
mosaics). **Load the `create-component` skill before editing this component**
(`feedback_one_component_per_file` — it governs any `src/components/**` edit).

- [ ] Add the three-source attribution to the `.credits` paragraph text (the
  exact copy is the SSS-required `Solar System Scope (solarsystemscope.com), CC BY
  4.0` plus the NASA/USGS credits, spec §3).
- [ ] Confirm the existing Splash component test (if any) still passes; add a
  targeted assertion only if the component has a credits test — otherwise this is
  copy, verified visually.
- [ ] `npm test -- Splash` → green (or no-op if untested). Commit.

## Task 6 — `package.json` scripts + CLAUDE.md re-run order

**Files:** `package.json` (modify — `fetch-textures`, `build-textures` scripts),
`CLAUDE.md` (modify — "Re-run order when planet textures change" block).

- [ ] Add `"fetch-textures": "tsx tools/fetch/fetchTextures.ts"` and
  `"build-textures": "tsx tools/textures/buildTextures.ts"` to `package.json`
  (match the existing `fetch-cf4` / `build-mcpm` script shapes).
- [ ] Add a "Re-run order when planet textures change" block to CLAUDE.md's
  data-pipeline section (alongside the CF4/DESI/structures blocks): `fetch-textures`
  → `build-textures` → `sync-r2-secure`, with the note that the full-res pull +
  build + sync run POST-MERGE from the MAIN worktree (spec §12).
- [ ] `npm run typecheck` → clean (the scripts don't affect it, but confirm the
  tools tsconfig still passes). Commit.

## Task 7 — Dev-subset visual verification (spec §12 DoD)

**Files:** none — user-verified. Requires `?deepZoom` + `/link-data`, and the
dev texture subset present (`npm run fetch-textures -- --dev` then `npm run
build-textures`, run in this worktree/main per the data-isolation rule).

- [ ] Fetch the dev subset + build it locally so `public/data/images/textures/`
  has the 2k bodies + the NASA-dev Earth (announce/confirm as the tool requires).
- [ ] **STOP and ask the user to confirm on the dev server (`?deepZoom`, spec
  §12):**
  - lit textured **Mars** and **Jupiter** (2k dev subset) with correct band /
    feature orientation from the rotation elements;
  - **Saturn's rings** in Saturn's equatorial plane with ring-on-planet AND
    planet-on-ring shadows;
  - **phase crescent on Venus** (sun-relative lighting → crescent, not full disc);
  - **glint cross-fade** during descent (no pop below ~3 px);
  - **Earth Lambert** — Earth's lit/night hemisphere reads consistently with the
    lit planets, now with the real dev-subset Blue Marble.
- [ ] Record the confirmed properties in the PR body.

## Task 8 — Entanglement-radar review, backlog hygiene, full gate

**Files:** none new — a review pass over the whole feature diff + the final gate.

Run the `entanglement-radar` skill over the ENTIRE feature diff (Plans 01–03) per
`docs/superpowers/conventions/simplicity.md`. The design-time trigger applies:
any place the feature handles an "asymmetry"/"special-case"/"must-remember-to" is
a STOP-and-classify signal (essential vs accidental).

**Known candidates to classify (name reader + writer of each; mismatch = mirror
to un-braid):**

- **`BODY_TEXTURE_REGISTRY` as the single source** — confirm texture identity
  (Plan 01 §4.2), the runtime tier clamp (`clampTier`), the build tier-set
  (`emittedTiersForBody`), and the fetch source-list all DERIVE from the one
  registry; no per-body `textured` flag mirror, no second maxTier list. Expected:
  essential + un-braided.
- **Ring presence as data, not a shader branch** (spec §8) — confirm
  `ringOuterRatio == 0` makes every non-Saturn textured body skip the shadow term
  with one comparison + a never-sampled 1×1 placeholder; no Saturn-only pipeline
  variant. Expected: essential un-braiding of the "Saturn is special" asymmetry.
- **Tier change = one release edge** (spec §5.4) — confirm distance-evict AND
  stale-tier-evict are one `slot.release()` concept in the demand loop, not a
  second tier-reload mechanism. Expected: essential asymmetry (proximity vs
  always-resident lifecycles).
- **Saturn's equatorial frame is one source** — confirm the ring, Saturn's
  orientation, and `SATURN_EQUATORIAL_FRAME` all resolve to the one IAU pole (the
  Plan 01 Task 2 test pins the equality); no second Saturn-pole literal.
- **Glint↔`starPointRenderer` fold** (spec §14) — confirm it was deliberately NOT
  taken (shared at `lib/billboard`, not the pipeline level) and is flagged for a
  follow-up simplicity pass, not silently duplicated.

**Backlog hygiene:** this feature was picked up from the spec, not a `BACKLOG.md`
index item, so there is no index line / detail file to delete. Confirm that —
audit `docs/BACKLOG.md` + `docs/backlog/` for any planet-rendering /
texture / Saturn-rings / glint item and delete it (index line AND detail file) in
this commit if present (`feedback_backlog_index_terse`, the Backlog-hygiene
convention). Record "none found" if clean.

- [ ] Run `entanglement-radar` over the full Plans 01–03 diff; record the
  per-candidate verdicts (essential vs accidental) in the PR body. Fold any
  accidental mirror surfaced; if a fold is non-trivial, capture it in
  `docs/backlog/` and note it.
- [ ] Backlog-hygiene sweep: delete any matching `BACKLOG.md` index line + its
  `docs/backlog/` detail file, or record "none found".
- [ ] `npm run typecheck` (both tsconfigs) → clean.
- [ ] `npm test` (full suite) → green.
- [ ] PR body records the user-confirmed visual properties (Plan 02 Task 11 +
  Plan 03 Task 7) and the entanglement-radar verdicts.
- [ ] Commit.

---

## Self-review

### Spec-coverage map

| Spec section | Task(s) |
|---|---|
| §3 verified sources → raw-data rows | T1 |
| §10 `fetchTextures` (GET-only, resume, size-gate, `--dev`) | T2 |
| §10 `buildTextures` (sharp/GeoTIFF/tint/tier/ring) | T3 |
| §10 `collectTextureImages` + `syncR2` sweep | T4 |
| §10 Splash attribution | T5 |
| §10 npm scripts + CLAUDE.md re-run order | T6 |
| §12 dev-subset visual DoD | T7 |
| §14 entanglement-radar + backlog hygiene + gate | T8 |

### Post-merge, main-worktree work (NOT in this branch — spec §12)

The full-res ~700 MB fetch, `build-textures`, and `sync-r2-secure` run
POST-MERGE from the MAIN worktree by the user (`project_worktree_data_isolation`,
`feedback_announce_big_downloads`). The branch merges green against the dev
subset; the production texture build + sync are the user's follow-up.

### Placeholder scan

None. Every task names concrete files, signatures/tables, and test names.
