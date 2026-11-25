# MCPM workbench: load your own catalog — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development under
> `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A visitor to `skymap.rulkens.com/mcpm/` loads a galaxy catalog from a local file (CSV or a
packed `.bin` + `_metadata.txt` pair) and runs MCPM on it, alone or beside the built-in catalogs.

**Why:** Three astronomers saw the workbench on 2026-11-24. Running MCPM on your own data from a laptop
is the long-standing ask; one of them has DESI data that is not public. Today only the native Mac build
(the Polyphorm fork, v1.2.0-alpha) can do it.

**Architecture:** The loaded catalog is a row in the Data list, held in the catalog slice next to the
built-in source list. `watchCatalogSaga` concatenates whatever is switched on. Files are parsed in the
page by a pure function; nothing is sent anywhere.

**Spec:** none. The rulings below are the owner's, from the 2026-11-25 session, and stand in for one.

## Rulings (owner, 2026-11-25)

1. Two CSV formats, chosen by the user in the import dialog: `x, y, z, weight` (Mpc) and
   `RA, Dec, redshift, weight`. A wrong-looking file is refused with the line, what was found, and a
   compact example of the chosen format.
2. Weight is a required fourth column in both. A three-column file is rejected, like the native build.
3. Redshift files take H0 and Ωm from two fields in the import dialog (flat ΛCDM).
4. The import form is a dialog over the page.
5. Loading a file makes it the only selection: every built-in source is switched off. After that,
   built-ins and the file toggle freely and can run together.
6. State keeps the `sources` list and adds an on flag for the loaded catalog.
7. The packed `.bin` + `_metadata.txt` drop, dev-only today, opens to the deployed site.
8. `packedOverride` is renamed, and the misnamed `log10StellarMass` slot is renamed, in this branch.
9. The built-in catalogs' weights are fixed to work the way the port's do (Task 1).
10. People must be told what format the weight column is in.
11. One PR; the fix and the prep are their own commits, first.
12. The weight column is checked on load: the dialog shows its range (smallest, median, largest),
    warns when the median is far from the published run's or the values look like logarithms, and
    lets the user declare the column as log₁₀ mass in M☉, converted on load.

## Ground preparation

Checkpoint shown and answered on 2026-11-25 (ruling 6 chose the flag shape over a tagged union; ruling 5
removes the exclusivity the union was protecting, so no hand-kept invariant remains).

- **Bolt-on today:** `resolveCatalogPointsPlan` returns the override before it looks at `sources`
  (`tools/mcpm-workbench/src/state/catalog/watchCatalogSaga.ts:47`); `packedOverride` is "sticky for the
  session, cleared never" (`tools/mcpm-workbench/@types/CatalogSlice.d.ts:27`), so the source and tier
  toggles go dead once it is set.
- **Missing joint:** a loaded catalog as one more thing that can be on or off. Task 3 creates it.
- **Growth after prep:** CSV parser, cosmology arguments, dialog, Data row, sidecar block, README.
- **Left alone:** parsed points stay in the store as today (`TYPED_ARRAY_STATE_PATHS`,
  `createWorkbenchStore.ts:20`); tier; the params preset format (a preset cannot name a local file).

## Global constraints

- `type` aliases only; one type per `@types/` file; one function per helper file; deep relative imports.
- Comments explain why, within the budget in `docs/superpowers/conventions/comments.md`.
- No network call may carry file content. The file is read with `File.text()` / `File.arrayBuffer()`.
- Renames go through `npm run refactor` (see `.claude/skills/refactor/SKILL.md`), file moves through
  `npm run move-files`; never hand-edited imports or `git mv`.
- UI work follows `docs/superpowers/conventions/ui-ux.md`; the dialog is the owner's ruled exception to
  its "no modal" rule, and every other rule there applies to it.
- Interface copy is fixed in Task 6; do not reword it.

## Review focus

1. **A file in the wrong format is chosen.** x,y,z read as RA/Dec must fail the range test with a hint,
   never load as garbage (Task 5 tests).
2. **A header row, `#` comments, blank lines, CRLF endings, semicolons or tabs.** All load, as in the
   native build (Task 5 tests).
3. **A failed load.** The catalog that was loaded before stays loaded and selected (Task 6 behaviour;
   parse happens before any dispatch).
4. **Built-ins and a file on together.** Weights share one scale after Task 1; the merged set is
   normalised once (Task 3 test).
5. **A very large file.** Over 400 MB is refused with a message before it is read (Task 6).

---

### Task 1: Built-in weights are linear mass, as in the port (bug fix)

**review: yes**

The port computes `log10(1 + W)` on a linear weight (`Polyphorm/main.cpp:634`; its SDSS run uses stellar
mass in 10¹² M☉, mean weight 0.0415). The workbench feeds log₁₀ mass (8 to 12) into the same formula,
so the logarithm is taken twice and "weight by mass" moves built-in weights by 17% where the port's
differ by a factor of thousands. The workbench spec asked for this
(`docs/superpowers/specs/completed/2026-08-18-mcpm-workbench-design.md:376`); the spec was wrong.

**Files:** `tools/mcpm-workbench/src/field/massWeightFromLog10.ts` (create),
`tools/mcpm-workbench/src/field/loadCatalogPoints.ts`, `tools/mcpm-workbench/src/field/syntheticCatalog.ts`,
`tools/mcpm-workbench/src/field/deriveAgentWeights.ts` (header comment only),
`tests/tools/mcpm-workbench/field/massWeightFromLog10.test.ts` (create),
`tests/tools/mcpm-workbench/field/deriveAgentWeights.test.ts`

**Signature:** `massWeightFromLog10(log10MassMsun: number): number` — returns `10 ** (log10MassMsun - 12)`;
`NaN` in, `NaN` out (the median fill downstream still handles absent masses).

- [x] Failing test first, in `deriveAgentWeights.test.ts`:
      `mass weighting separates a 1e8 and a 1e12 Msun galaxy like the port` — build the slot from
      `[8, 12].map(massWeightFromLog10)`, derive in `stellarMass` mode, assert
      `weights[1] / weights[0] > 1000`. (Fed `[8, 12]` directly, today's ratio is 1.17.)
- [x] Test `massWeightFromLog10 maps 12 to 1 and 9 to 0.001` and `keeps NaN`.
- [x] `loadCatalogPoints` converts each source's `log10StellarMass` through the helper while merging
      (`loadCatalogPoints.ts:46-50`). `syntheticCatalog` does the same for its generated masses.
- [x] Update `deriveAgentWeights.ts`'s header: the input is a linear weight; the `max(W, 0)` clamp stays.
- [x] Commit: "MCPM workbench: built-in catalogs weigh by linear mass, as the port does".

### Task 1b: Divide by the mean of the raw weights, as the port does (bug fix)

**review: yes**

The port's data-point weight is `(1e6 / N) * log10(1 + W) / mean(W)`, with `mean(W)` the raw mean from
the metadata (`Polyphorm/main.cpp:645`, `mw` = `mean_weight`, `main.cpp:440`). The workbench divides by
the mean of the transformed values (`deriveAgentWeights.ts`, the `sum / n` term). The difference is one
uniform factor per catalog, `mean(log10(1 + W)) / mean(W)`: it changes how strongly data points deposit
against free agents.

**Files:** `tools/mcpm-workbench/src/field/deriveAgentWeights.ts`,
`tools/mcpm-workbench/src/field/renormalizeWeightMass.ts`, `tools/mcpm-workbench/src/field/cullPointsToBox.ts`,
`tools/mcpm-workbench/src/render/galaxyOverlayPass.ts`, and their tests.

**Landmine:** `TOTAL_WEIGHT_MASS` documents that every weights array sums to exactly 1e6
(`deriveAgentWeights.ts`, the constant's comment). After this change it sums to
`1e6 * mean(log10(1 + W)) / mean(W)`. Trace every reader before editing: `renormalizeWeightMass`
(replayed after the box cull), `buildOverlayCatalog`, and `galaxyOverlayPass`'s
`weightScale = n / TOTAL_WEIGHT_MASS`. Decide per reader whether it wants the port's sum (the deposit)
or a mean-1 display scale (the overlay), and say which in the commit message.

- [x] Failing test first: `matches the port's formula on linear weights` — W = `[0.01, 0.1, 1]`,
      `stellarMass` mode, assert each weight equals `(1e6 / 3) * log10(1 + W) / mean(W)` within 1e-3
      relative.
- [x] `uniform` mode keeps its current behaviour (the port has no such mode); state that in the test name
      `uniform mode still sums to 1e6`.
- [ ] After a box cull, the kept points keep the weights they had before it (the port never culls; a
      cropped box must not re-inflate the survivors). Test: `culling does not change a surviving point's weight` — not added: it passes before the fix and repeats `filters the weights array with the same mask`.
- [x] Commit.

### Task 2: Rename the weight slot

Pure rename, no behaviour change, no new test.

**Files:** `tools/mcpm-workbench/@types/CatalogPoints.d.ts`, `tools/mcpm-workbench/@types/AgentWeights.d.ts`,
and every reader (8 source files, 9 test files under `tests/tools/mcpm-workbench/`; search
`log10StellarMass|medianLog10Mass`).

- [x] `CatalogPoints.log10StellarMass` → `weight`, documented as
      "linear, positive; stellar mass in 10¹² M☉ for built-in catalogs; NaN where absent".
- [x] `AgentWeights.medianLog10Mass` → `medianWeight`; `deriveAgentWeights`'s parameter follows.
- [x] Use `npm run refactor` (property rename). Then `grep -rn 'log10StellarMass\|medianLog10Mass' tools/mcpm-workbench tests/tools/mcpm-workbench` → no hits. Runtime types under `src/` named `log10StellarMass` are a different type and stay.
- [x] Commit.

### Task 3: A loaded catalog is a row that can be on or off (prep)

**review: yes**

**Files:** `tools/mcpm-workbench/@types/UserCatalog.d.ts` (create),
`tools/mcpm-workbench/@types/CatalogImportSettings.d.ts` (create),
`tools/mcpm-workbench/@types/CatalogSlice.d.ts`, `tools/mcpm-workbench/src/state/catalog/catalogSlice.ts`,
`tools/mcpm-workbench/src/state/catalog/watchCatalogSaga.ts`,
`tools/mcpm-workbench/src/field/concatCatalogPoints.ts` (create),
`tools/mcpm-workbench/src/field/loadCatalogPoints.ts`, `tools/mcpm-workbench/src/store/createWorkbenchStore.ts`,
`tools/mcpm-workbench/src/ui/App/App.tsx`, and the two state test files.

**Contract:**

```ts
export type CatalogImportSettings = {
  readonly format:
    | { readonly kind: 'cartesianMpc' }
    | { readonly kind: 'raDecRedshift'; readonly h0KmSMpc: number; readonly omegaM: number };
  readonly weight:
    | { readonly kind: 'linear'; readonly scale: number }   // stored = column × scale
    | { readonly kind: 'log10MassMsun' };                    // stored = massWeightFromLog10(column)
};

export type UserCatalog = {
  readonly points: CatalogPoints;
  readonly fileName: string;
  readonly settings: CatalogImportSettings;
};

// CatalogSlice: `packedOverride` is removed; these two replace it.
readonly userCatalog: UserCatalog | null;
readonly userCatalogOn: boolean;

// Actions: `setPackedCatalog` is removed.
userCatalogLoaded: PayloadAction<UserCatalog>;   // userCatalog = payload, userCatalogOn = true, sources = []
setUserCatalogOn: PayloadAction<boolean>;

export type CatalogPointsPlan =
  | { readonly kind: 'synthetic' }
  | { readonly kind: 'load'; readonly sources: readonly GalaxyCatalogId[]; readonly tier: Tier;
      readonly userPoints: CatalogPoints | null };   // null when no catalog is loaded or it is off

concatCatalogPoints(parts: readonly CatalogPoints[]): CatalogPoints
```

- [x] Tests in `catalogSlice.test.ts`: `loading a catalog switches every built-in source off and the
      catalog on`; `switching the loaded catalog off keeps it in the slice`.
- [x] Tests in `watchCatalogSaga.test.ts`: `plan carries the loaded catalog's points when it is on`;
      `plan carries null user points when it is off`; `the probe gate still wins`. Replace the
      `packedOverride` cases.
- [x] Test `concatCatalogPoints joins positions, weights and counts in order`.
- [x] The worker concatenates the network result with `userPoints`; one `deriveAgentWeights` call over
      the merged set, as today. `loadCatalogPoints` returns an empty set without touching the network
      when `sources` is empty (`loadCatalogPoints.ts:37`), so a file-only run needs no fetch.
- [x] `watchCatalogSaga` takes `userCatalogLoaded` and `setUserCatalogOn` in place of
      `setPackedCatalog` (`watchCatalogSaga.ts:76`).
- [x] `TYPED_ARRAY_STATE_PATHS`: `catalog.packedOverride` → `catalog.userCatalog`.
- [x] `App.tsx`'s dev drop dispatches `userCatalogLoaded` with `{ kind: 'cartesianMpc' }`, linear scale 1 and
      the `.bin` file name. It stays dev-gated until Task 6.
- [x] `grep -rn 'packedOverride\|setPackedCatalog' tools tests` → no hits outside `docs/`.
- [x] Commit.

### Task 4: Cosmology arguments on the redshift helper

**Files:** `src/@types/math/Cosmology.ts` (create), `src/utils/math/redshiftToDistanceMpc.ts`,
`tests/utils/math/redshiftToDistanceMpc.test.ts`

**Signature:** `redshiftToDistanceMpc(z: number, cosmology?: Cosmology): number` with
`type Cosmology = { readonly h0KmSMpc: number; readonly omegaM: number }` (flat: Ω_Λ = 1 − Ω_m).
Omitted, it behaves exactly as today (H0 70, Ω_m 0.315), so the 17 importing files do not change.

- [x] Test `an omitted cosmology equals the app's own` (z = 0.1, 1).
- [x] Test `doubling H0 halves the distance`.
- [x] Test `omegaM 1 matches the Einstein-de Sitter closed form`: `d = (2c/H0)(1 − 1/√(1+z))` at
      z = 0.5, relative error < 1e-5.
- [x] Commit.

### Task 5: The CSV parser

**review: yes**

**Files:** `tools/mcpm-workbench/src/field/parseCsvCatalog.ts` (create),
`tools/mcpm-workbench/@types/CatalogFileProblem.d.ts` (create),
`tests/tools/mcpm-workbench/field/parseCsvCatalog.test.ts` (create)

**Contract:**

```ts
export type CatalogFileProblem = {
  readonly line: number | null;      // 1-based; null for whole-file problems
  readonly message: string;          // the exact strings below
};

export type WeightStats = { readonly min: number; readonly median: number; readonly max: number };

parseCsvCatalog(text: string, settings: CatalogImportSettings):
  | { readonly ok: true; readonly points: CatalogPoints; readonly skippedLines: number;
      readonly weightStats: WeightStats }          // of the stored weights
  | { readonly ok: false; readonly problem: CatalogFileProblem }

// null when the weights look right; otherwise the exact sentence to show.
weightUnitWarning(stats: WeightStats, weight: CatalogImportSettings['weight']): string | null
```

`WeightStats` gets its own `@types/WeightStats.d.ts`; `weightUnitWarning` its own
`src/field/weightUnitWarning.ts` and test. Both are added to this task's **Files**.

**Weight warnings** (linear kind only; the first that applies; `A`, `B`, `M` formatted to 2 significant digits):

| Condition | Sentence |
| --- | --- |
| Every stored weight between 5 and 15 | `Weights run from A to B, which looks like log₁₀ mass. Choose "log₁₀ of mass in M☉", or load anyway.` |
| Median above 2 | `Median weight is M. Built-in catalogs use stellar mass in 10¹² M☉, where the median is near 0.02. For 10⁹ M☉ use a scale of 0.001, or load anyway.` |

No scale is computed or applied for the user: the file may hold something other than stellar mass.

**Rules** (the native build's, `Polyphorm/cpplib/dataset.cpp:36-72`, plus the range test):

- A line is data when its first non-blank character is a digit, `-`, `+` or `.`; every other line
  (header, `#` comment, blank) is skipped and counted.
- Fields are separated by a comma, semicolon, tab or spaces. Columns after the fourth are ignored.
- The first problem ends the parse; nothing partial is returned.
- `cartesianMpc`: columns are x, y, z in Mpc, used as written.
- `raDecRedshift`: RA and Dec in degrees, redshift z; position =
  `raDecDistToEqCart` at `redshiftToDistanceMpc(z, { h0KmSMpc, omegaM })`.
- Stored weight: `linear` → fourth column × `scale`; `log10MassMsun` → `massWeightFromLog10(column)`
  (Task 1's helper), so 12 becomes 1. In the log kind the "weight must be greater than 0" row does
  not apply; the column only has to be finite.

**Messages** (exact; `N` is the line number):

| Condition | Message |
| --- | --- |
| Fewer than 4 numbers | `Line N: expected 4 numbers, found K` |
| Non-finite coordinate | `Line N: every value must be a finite number` |
| Weight × scale ≤ 0 or non-finite | `Line N: weight must be greater than 0` |
| RA/Dec format, Dec outside −90…90 | `Line N: Dec V is outside −90 to 90. If the columns are x, y, z, choose that format` |
| RA/Dec format, RA outside 0…360 | `Line N: RA V is outside 0 to 360. If the columns are x, y, z, choose that format` |
| RA/Dec format, z < 0 | `Line N: redshift must be 0 or more` |
| No data lines | `No data rows found` |

- [x] One test per row of the table, named after its condition, asserting `line` and `message`.
- [x] `loads comma, semicolon, tab and space separated rows alike`.
- [x] `skips a header row, # comments and blank lines and counts them`; `reads CRLF line endings`.
- [x] `ignores columns after the fourth`.
- [x] `applies the weight scale` (weight 42, scale 0.001 → 0.042).
- [x] `converts a log10 mass column to linear 1e12 Msun` (12 → 1, 9 → 0.001; a 0 or negative log is accepted).
- [x] `reports min, median and max of the stored weights`.
- [x] `weightUnitWarning`: `flags weights that look like logarithms` (8.1…12.3, linear);
      `flags a median far above the published run's` (median 20); `is silent for the published run's
      range` (median 0.02); `is silent for a declared log column`.
- [x] `places RA 0, Dec 0 on +x and Dec 90 on +z at the redshift's distance`.
- [x] `uses the given H0` (same row, H0 70 vs 140 → half the radius).
- [x] Implement; commit.

### Task 6: Import dialog, Data row, drop

**Files:** `tools/mcpm-workbench/src/ui/LoadCatalogDialog/LoadCatalogDialog.tsx` + `.module.css` (create),
`tools/mcpm-workbench/src/ui/LoadCatalogDialog/utils/CATALOG_EXAMPLES.ts` (create),
`tools/mcpm-workbench/src/ui/LoadCatalogDialog/utils/MAX_CATALOG_FILE_BYTES.ts` (create, 400 MB),
`tools/mcpm-workbench/src/ui/LoadCatalogDialog/utils/readCatalogFiles.ts` (create; replaces
`tools/mcpm-workbench/src/ui/App/utils/readDroppedPackedCatalog.ts`, which is deleted),
`tools/mcpm-workbench/src/ui/ControlsPanel/ControlsPanel.tsx`, `tools/mcpm-workbench/src/ui/App/App.tsx`,
`tools/mcpm-workbench/src/ui/App/utils/statusStyle.ts` (delete if unused after this task)

**Design brief**

```
Person and job: As an astronomer with my own galaxy catalog I need to run MCPM on it in the browser
  so that I can see its cosmic web without installing anything or sending the data anywhere.
Surface: dev tool page; "Load catalog" button at the top of the Data section, above the source toggles.
States: no file chosen; file chosen; reading (over 1 s: "Reading <name>…"); problem; loaded.
  Row: none / one catalog (shortest name "a.csv", longest a 60-character name, truncated with the
  full name in title).
Actions and keys: Load catalog → dialog opens, focus on "Choose file". Enter loads, Escape cancels,
  focus returns to the button. A file dropped anywhere on the page opens the dialog with it chosen.
  Loaded → dialog closes, the row appears switched on, built-ins switch off. Row toggle off → back on
  without re-reading. Load catalog again → replaces.
Must not cover: nothing while closed. Open, it is the one modal on the page.
Widths: 1728 and 400; touch yes.
Out of scope: a remove button (the toggle is the way back), remembering settings between visits,
  column mapping by header name, progress percentages.
Report: ui-ux.md self-check, two screenshots per state, one line per check.
```

**Build notes**

- Use the native `<dialog>` element with `showModal()`: focus trap, Escape and focus return come with it.
- One entry point: the button and the page drop both hand `File[]` to `readCatalogFiles`, which returns
  `{ kind: 'csv'; file }`, `{ kind: 'packed'; bin; metadata }` or a problem
  (`Choose a .csv file, or a .bin with its _metadata.txt`). A file over `MAX_CATALOG_FILE_BYTES` is
  refused before reading. The `import.meta.env.DEV` gate at `App.tsx:31` and `:61` is removed.
- A packed pair shows no format or scale fields (its weights are already scaled); it loads through
  `loadPackedCatalog` as today.
- Parse first, dispatch `userCatalogLoaded` only on success. On a problem the dialog stays open, shows
  the message (`role="alert"`) above the example for the chosen format, and state is untouched.
- A "Weight is" choice with two options; the scale field shows only for `linear`.
- After a successful parse, `weightUnitWarning` runs. A warning keeps the dialog open and shows the
  sentence (`role="status"`) with the confirm button relabelled `Load anyway`; changing any setting
  re-parses and restores `Load catalog`. No warning: the dialog loads and closes at once.
- `UserCatalog` gains `readonly weightStats: WeightStats` (add it in this task; the dev drop from
  Task 3 computes it with the same helper the parser uses).
- The Data row: file name, row count with `toLocaleString()`, the weight range as
  `weights A – B, median M`, and a `ToggleRow` bound to `userCatalogOn` / `setUserCatalogOn`,
  placed above the built-in toggles.
- H0 and Ωm fields show only for the RA/Dec format. Defaults 70 and 0.315. Text inputs are 16 px.

**Copy** (exact)

| Where | Text |
| --- | --- |
| Button, dialog title, confirm | `Load catalog` |
| Cancel | `Cancel` |
| Under the title | `Read in this browser. The file is not uploaded.` |
| File control | `Choose file` |
| Format options | `x, y, z, weight` · `RA, Dec, redshift, weight` |
| x, y, z help | `Positions in Mpc. One galaxy per row.` |
| RA/Dec help | `RA and Dec in degrees. Does not open in the native Polyphorm build.` |
| Weight choice label, options | `Weight is` · `linear` · `log₁₀ of mass in M☉` |
| Weight help, linear | `A positive number. Built-in catalogs use stellar mass in 10¹² M☉.` |
| Weight help, log | `Converted to stellar mass in 10¹² M☉. Does not open in the native Polyphorm build.` |
| Confirm after a warning | `Load anyway` |
| Scale label, hint | `Weight scale` · `Multiplies the weight column. 0.001 turns 10⁹ M☉ into 10¹² M☉.` |
| Cosmology labels, hint | `H0 (km/s/Mpc)` · `Ωm` · `Flat ΛCDM.` |
| Reading | `Reading <name>…` |
| Too large | `File is larger than 400 MB. Use a smaller sample, or the native build.` |

`CATALOG_EXAMPLES` holds two rows per format, shown in a mono block labelled `Example`:
`-239.4, -16.5, 201.2, 0.042` / `-241.0, -12.1, 198.7, 0.013` and
`185.73, 12.39, 0.0044, 0.042` / `186.10, 12.88, 0.0037, 0.013`.

- [ ] Build; no new unit tests (UI wiring; the parser and reducers carry the logic).
- [ ] Shoot each state at 1728 and 400 wide; run the ui-ux self-check; attach both to the report.
- [ ] Commit.

### Task 7: Export provenance and docs

**Files:** `tools/mcpm-workbench/src/export/emitTraceSidecar.ts`, the export saga's call site
(`tools/mcpm-workbench/src/state/export/watchExportSaga.ts`),
`tests/tools/mcpm-workbench/export/emitTraceSidecar.test.ts`, `tools/mcpm-workbench/README.md`,
`docs/BACKLOG.md`

- [ ] `emitTraceSidecar` takes `userCatalog: Pick<UserCatalog, 'fileName' | 'settings'> & { nPoints: number } | null`
      and, when present, writes `provenance.catalog.user_file = { name, n_points, format, weight_kind, weight_scale?, h0_km_s_mpc?, omega_m? }`.
      `frame` stays `equatorial-cartesian`: the importer validates it against a closed list
      (`tools/parsers/polyphyTraceSidecar.ts:96`), and for an x,y,z file the frame is the user's claim.
- [ ] Test `records the loaded file and its import settings`; test `omits user_file when no catalog is on`.
- [ ] README: a "Load your own catalog" section — the two formats, the weight rule, the cosmology
      fields, the 400 MB limit, that 324,901 rows is the largest tested size, and that the RA/Dec
      format is workbench-only. Correct the "Validation" section's note that the packed loader is dev-only.
- [ ] `docs/BACKLOG.md`: one index line, `mcpm-workbench: stream large catalog files` `ready` — files over
      400 MB (full DESI samples) need a streamed parse and an unboxed median.
- [ ] Commit.

## Definition of Done

**Deliverables**

- `parseCsvCatalog`, `concatCatalogPoints`, `massWeightFromLog10`, `LoadCatalogDialog`, the
  `UserCatalog` / `CatalogImportSettings` / `CatalogFileProblem` / `Cosmology` types.
- `packedOverride`, `setPackedCatalog`, `readDroppedPackedCatalog`, `log10StellarMass` and
  `medianLog10Mass` no longer appear under `tools/mcpm-workbench/` or its tests.

**Smoke pass on a production build (`npm run build`, served)**

- Load the port's `sample_3D_linW.csv` with scale 0.001: row appears on, built-ins off, grid box fits
  the data, the sim runs.
- Load an RA/Dec/redshift file; change H0 from 70 to 100 and reload: the bounds shrink by 0.7.
- Choose the RA/Dec format for an x,y,z file: refused, with the Dec message, the hint and the example;
  the previous catalog is still loaded.
- Drop a packed `.bin` + `_metadata.txt` pair on the page: the dialog opens with it chosen and loads it.
- Switch the row off and a built-in on, then both on: three runs, no re-read of the file.
- With 2MRS on, toggle "weight by mass": the field visibly changes (before Task 1 it barely does).
- Download a trace with a file loaded: the sidecar names the file and its settings.
- Network panel open during a load: no request is made.
- Escape closes the dialog and focus is back on the button; keyboard only, start to finish.

**Out of scope**

- Files over 400 MB and streamed parsing (backlogged in Task 7).
- Column mapping by header name; Mpc/h or kpc unit options; non-flat cosmologies.
- RA/Dec input in the native build.
- Re-validating the workbench against the port with built-in catalogs after Task 1.
