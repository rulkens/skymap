# Mesh sources as editable `.blend`, backed up to R2 — implementation plan

> **Spec.** [`specs/2026-09-15-mesh-sources-as-blend-design.md`](../specs/2026-09-15-mesh-sources-as-blend-design.md)
> — the reviewer's authority. Tasks carry the values an implementer needs.
> **Execution.** `subagent-driven-development` under the lean protocol
> ([`conventions/sdd-execution.md`](../conventions/sdd-execution.md)): three grouped
> dispatches, one final review, CI as the gate. Blender is not in CI and no agent runs
> it: every Blender step is **USER-RUN** and says so.
> **Style.** [`conventions/plan-style.md`](../conventions/plan-style.md). Read the current
> file before editing it. `tools/meshes/prebake/*.py` has no test runner; Python tasks
> get no tests — the round trip in Task 3 is their test.

## Dispatch grouping

| Dispatch           | Tasks | Who                                                  |
| ------------------ | ----- | ---------------------------------------------------- |
| A — Python         | 1, 2  | implementer                                          |
| B — pins, docs, R2 | 4, 5  | implementer (parallel to A: disjoint files)          |
| C — round trip     | 3     | **user** (Blender), controller for `shasum` + commit |

Final review after C.

## Worktree data wiring (controller, before Task 3)

In this worktree `data/raw/meshes/` is a real directory (committed READMEs +
`meshes.sha256`) holding a stray `meshes` symlink to the main checkout's
`data/raw/meshes`; the Blender scripts resolve `REPO` from their own path, so they read
and write **this worktree's** body directories. Before Task 3:

- `rm -f data/raw/meshes/meshes` (the stray link; it is gitignored).
- In each of the six body directories, symlink every gitignored input from main that
  `build-meshes` or the importer reads: the four NASA pristine downloads (Curiosity's
  `.zip` and extracted `.blend` both), `whale/whale.glb`, and
  `petunias/petunias.prebaked.glb` + `petunias.prebaked.albedo.png`.
- Do **not** link the four NASA `.prebaked.*` outputs or create `<key>.blend`: Task 3
  writes them here as real files. Copying them into main is a post-merge step (DoD).

`public/data` is already a symlink into main, so `build-meshes` writes its `.mesh`/PNGs
there — the same bytes if the round trip holds.

---

### Task 1: `importMesh.py` — pristine download → `<key>.blend`

**review: yes** (Blender Python; CI cannot see it)

**Files:** `tools/meshes/prebake/importMesh.py` (create), `package.json` (modify: script)

**npm script** (same shape as `prebake-mesh`, `package.json:43`):
`"import-mesh": "\"${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}\" --background --factory-startup --python tools/meshes/prebake/importMesh.py --"`

**Source table** (moves out of `meshPrebake.py:98-130`):

```python
SOURCES = {  # key -> pristine filename under data/raw/meshes/<key>/, stow frame, marker materials
    "voyager":      source("Voyager Probe (B).glb"),
    "perseverance": source("Mars 2020 Perseverance Rover.glb", frame=120),
    "curiosity":    source("Curiosity Rover (MSL) (Clean).blend", frame=206, drop_materials=("pivot", "shadow2")),
    "mer":          source("Mars Exploration Rover - Spirit and Opportunity.blend", frame=1325),
}
# output: data/raw/meshes/<key>/<key>.blend
```

**Pass order** (the order is the contract; bodies move from `meshPrebake.py`, cite don't
rewrite):

1. Load — `.blend`: `wm.open_mainfile`; `.glb`: `read_factory_settings(use_empty=True)` +
   `import_scene.gltf(merge_vertices=True)` (`meshPrebake.py:138-143`).
2. Un-exclude and un-hide every layer collection (`exclusions`, `meshPrebake.py:152-156`).
3. `scene.frame_set(frame)` when the body has one.
4. `fix_colour_management` (`:159-185`, raise included), `unify_shader_outputs` (`:188-211`).
5. `apply_modifiers` over meshes with faces and materials (`:239-244`, filter from
   `keepers` `:223-232`) — at the stow frame, so armature deform and geometry nodes are
   evaluated there.
6. Freeze the pose: `view_layer.update()`, record every object's `matrix_world`, clear
   `animation_data` on every object; then, only for the direct children of the objects
   step 7 deletes, clear the parent and restore `matrix_world`. Freezing before any delete
   is what stops a child whose F-curves animate its parent-relative transform from
   scattering once its marker parent is gone. Never unparent everything: the
   matrix→loc/rot/scale round trip drifts at 1e-7 and moves Perseverance's decimation
   count and MER's ground offset (review A, measured).
7. Delete objects whose materials are all in `drop_materials`; raise if the set is
   non-empty and nothing matched (guard text from `:233-235`).
8. `unify_source_uvs` + `repoint_uv_references` (`:258-296`) over the surviving meshes
   with faces and materials.
9. `file.pack_all()` — the `.blend` is the backup and must not reference loose files.
10. `scene.frame_current = frame` (non-object animation evaluates where it did), then
    `wm.save_as_mainfile(filepath=<key>.blend)`.

Log one line per pass with the same counts the prebake logs today.

- [ ] Write the script; module header ≤ 5 lines naming the split rule ("scene content is
      saved here; bake artefacts stay in meshPrebake.py") and the Blender 5.2 LTS run.
- [ ] Add the npm script. No test (Blender; Task 3 is the test).

### Task 2: slim `meshPrebake.py` to load → bake

**review: yes** (Blender Python; CI cannot see it)

**Files:** `tools/meshes/prebake/meshPrebake.py` (modify)

**`SOURCES` after:**

```python
SOURCES = {s["key"]: s for s in [source("voyager"), source("perseverance", triangles=100_000),
                                 source("curiosity"), source("mer")]}
# source(key, triangles=None) -> {"key", "dir", "src": <dir>/<key>.blend, "out", "triangles"}
```

**Delete:** the glTF branch of `load`, `exclusions`, `fix_colour_management`,
`unify_shader_outputs`, `apply_modifiers`, `unify_source_uvs`, `repoint_uv_references`,
`SOURCE_UV`, the `frame` and `drop_materials` fields, and their `main()` log lines.

**Keep / change:**

- `load(cfg)`: `open_mainfile(cfg["src"])`. No `frame_set`: the importer leaves no animation
  or drivers in any source (final review, measured), and the depsgraph evaluates at the saved
  `frame_current` regardless.
- `keepers(scene) -> (keep, dropped)`: meshes with faces and materials; the marker branch
  and its raise go.
- `source_uv(meshes) -> str`: the name of the single UV layer every keeper shares; raises
  `RuntimeError` naming the offending object if any keeper has ≠ 1 UV layer or the names
  differ ("re-run `npm run import-mesh -- <key>` or remove the extra layer"). `unwrap`
  takes this name instead of `SOURCE_UV` (`:343`).
- Module header: drop "several carry a stow→deploy animation" framing; the input is the
  imported `<key>.blend` (≤ 5 lines).
- `select()` keeps its un-hiding: operator polls need it regardless of the file.

- [ ] Apply the deletions and changes. No test (Task 3 is the test).

### Task 3: round trip — the generated file does not move

**USER-RUN (Blender 5.2 LTS).** Controller does the wiring above first, then hashes and
commits.

**Files:** `data/raw/meshes/meshes.sha256` (modify)

- [ ] **User:** `npm run import-mesh -- <key>` for voyager, perseverance, curiosity, mer.
      Open one `.blend` in the GUI: deployed pose at any timeline frame, colour maps sRGB.
- [ ] **User:** `npm run prebake-mesh -- <key>` for the same four, then
      `npm run build-meshes`.
- [ ] **Gate:** `git diff src/data/bodies/meshAssets.generated.ts` is **empty** (same
      `meanAlbedo`, `triangleCount`, `boundingRadiusM`, `groundOffsetM`). A non-empty diff
      **halts the plan** and goes to the user with the diff; do not commit a changed
      generated file, do not tune the importer to chase digits without a ruling.
- [ ] **Controller:** append four lines to `meshes.sha256` in its existing format
      (`<sha256>  <key>/<key>.blend`), from `shasum -a 256` run in `data/raw/meshes/`;
      `shasum -a 256 -c meshes.sha256` passes. Commit.

### Task 4: registry rows, READMEs, DEPLOY.md

**Files:** `tools/utils/io/rawDataRegistry.ts` (modify, `:1030-1205`),
`data/raw/meshes/README.md` (create), `data/raw/meshes/{voyager,perseverance,curiosity,mer}/README.md`
(modify), `docs/DEPLOY.md` (modify)

**Registry rows** (after each body's source row):

```ts
'meshes.voyagerBlend': {
  path: 'data/raw/meshes/voyager/voyager.blend',
  kind: 'file',
  source: 'gitignored',
  description: '…the edited source the pre-bake opens; Blender 5.2 LTS…',
  upstream: 'https://science.nasa.gov/3d-resources/voyager-probe-b/',
  fetcher: 'tools/meshes/prebake/importMesh.py',
  readme: 'meshes.voyager.readme',
},
// likewise meshes.perseveranceBlend, meshes.curiosityBlend, meshes.merBlend (upstream = the body's existing URL)
'meshes.readme': { path: 'data/raw/meshes/README.md', kind: 'file', source: 'committed', description: '…' },
```

Descriptions to update: the four `.prebaked.glb` rows name `<key>.blend` as their input;
`meshes.curiositySource` ("what the pre-bake opens" → what `import-mesh` opens);
`meshes.dir` (no longer "Source GLBs"); `meshes.sha256` (pristine downloads plus the four
`.blend` files — also the R2 backup list). No test: `rawDataRegistry.test.ts` checks only
`mcxc.table` and `textures.*`, and `buildMeshes` reads the unchanged `.prebaked.glb` keys.

**`data/raw/meshes/README.md`** — short: what is pinned by `meshes.sha256`; that the same
list is backed up to R2 by `npm run sync-r2-secure` (from main); the restore command, run
from `data/raw/meshes/` in bash or zsh:

```sh
while IFS= read -r line; do f="${line#*  }"
  curl --fail --create-dirs -o "$f" "https://skymap-data.rulkens.com/data/raw/meshes/${f// /%20}"
done < meshes.sha256 && shasum -a 256 -c meshes.sha256
```

**Per-body READMEs (four NASA bodies):**

- Add a "The `.blend` — the edited source" section: `<key>.blend` is what the pre-bake
  opens; written by Blender 5.2 LTS, it does not open in older versions; re-import from the
  pristine download with `npm run import-mesh -- <key>` (overwrites edits); edit workflow =
  edit materials in the GUI, save, update the file's line in `../meshes.sha256`,
  `npm run prebake-mesh -- <key>`, `npm run build-meshes`.
- Rewrite prebake-behaviour text as importer behaviour: frame choice, marker/helper removal,
  rival Material Output removal, Non-Color re-flagging, dangling-texture re-pointing,
  Normal Map UV re-pointing. The pre-bake section keeps only join, decimate (Perseverance),
  unwrap, `BAKE_PASSES`, export. Keep "As inspected" and "Attribution" as they are.

**`docs/DEPLOY.md`:** one sentence in "R2 sync architecture" (`:30-41`) and one in the
cache paragraph (`:63`): the `Mesh sources` group backs up `meshes.sha256`'s list under
`data/raw/meshes/`, `no-cache` because a `.blend` is re-saved under its key, never purged,
restore in `data/raw/meshes/README.md`.

- [ ] Rows, READMEs, DEPLOY.md. `npm run format` on touched files only.

### Task 5: `Mesh sources` R2 group

**Files:** `tools/deploy/r2/collectMeshSources.ts` (create),
`tests/tools/deploy/r2/collectMeshSources.test.ts` (create),
`tools/deploy/r2/uploadViaWrangler.ts` (modify), `tools/deploy/syncR2.ts` (modify)

**Signature:** `collectMeshSources(meshesDir: string): R2Upload[]`
**Behaviour:** reads `<meshesDir>/meshes.sha256`; each line is `<hex>  <relative path>`
(two spaces; the path may itself contain spaces and parentheses); returns
`{ localPath: join(meshesDir, rel), r2Key: \`${RAW_DATA['meshes.dir'].path}/${rel}\` }` for
each file present on disk, in file order.

**Group row** in `buildGroups()`, after `Extra files`:

```ts
{ label: 'Mesh sources', files: collectMeshSources(RAW_DATA['meshes.dir'].path),
  transport: { kind: 'wrangler' }, cacheControl: NO_CACHE, purge: false },
```

Why comment (≤ 2 lines at the row): `no-cache` because an edited `.blend` is re-saved under
the same key — an immutable header would hand a restore the pre-edit bytes.

**`uploadViaWrangler`:** spawn `npx` with an argument array (`execFileSync`) instead of the
`execSync` string (`uploadViaWrangler.ts:47-55`); every NASA filename carries spaces and
parentheses, which the unquoted string turns into a shell syntax error. Same flags, same
order, `stdio: 'inherit'`. No test: the change is a call-shape swap with no branch, and it
fails loudly on first use.

- [ ] Test `collectMeshSources keeps a filename with spaces and parentheses as one key`:
      fixture dir with `meshes.sha256` holding `<hex>  voyager/Voyager Probe (B).glb` and
      `<hex>  voyager/voyager.blend`, both files written; asserts the two r2Keys are
      `data/raw/meshes/voyager/Voyager Probe (B).glb` and `data/raw/meshes/voyager/voyager.blend`.
      (A whitespace split is the bug this catches; the sync runs post-merge, so nothing
      else would see it before the backup silently misses files.)
- [ ] Implement, wire the group, swap the spawn. `npm test -- collectMeshSources` passes.

---

## Definition of Done

**Deliverable inventory**

- `tools/meshes/prebake/importMesh.py` and `npm run import-mesh`.
- `meshPrebake.py` with one load path (`<key>.blend`), no fix passes, `SOURCES` = key →
  triangles, `source_uv` guard.
- `data/raw/meshes/<key>/<key>.blend` for voyager, perseverance, curiosity, mer; four new
  lines in `meshes.sha256`.
- Registry rows `meshes.{voyager,perseverance,curiosity,mer}Blend` and `meshes.readme`.
- `data/raw/meshes/README.md` with the restore command; four body READMEs carry the
  `.blend` section and describe fixes as importer behaviour.
- `collectMeshSources` + its test; `Mesh sources` group in `buildGroups()`;
  `uploadViaWrangler` spawns without a shell; DEPLOY.md names the group.

**Observable behaviours** (user-run)

- Opening `curiosity.blend` in Blender 5.2: arm extended (frame-206 pose) at timeline frame
  0 and at 206; no `_root_p` cube or ground plane; textures not washed white.
- Opening `perseverance.blend`: mast up at any frame.
- Import ×4 + prebake ×4 + `build-meshes` → `git diff src/data/bodies/meshAssets.generated.ts`
  empty.
- `shasum -a 256 -c meshes.sha256` passes in the worktree after Task 3.

**Post-merge (from main, user)** — not a merge gate

- Copy the four `<key>.blend` files (and optionally the regenerated `.prebaked.*`) from the
  worktree into main's `data/raw/meshes/<key>/`; `shasum -a 256 -c meshes.sha256` in main.
- `npm run sync-r2-secure`; its summary lists `Mesh sources` with 11 files (7 pristine
  entries — voyager, perseverance, Curiosity's zip and `.blend`, mer, whale, petunias — plus 4 `.blend`); the restore
  command into a scratch copy of `data/raw/meshes/` passes `shasum -c`.

**Deferral boundary**

- No material edits (metallic/roughness values) — that is the user's follow-up in Blender.
- No change to `buildMeshes.ts`, `meshSources.ts`, atlases, `.mesh` format or runtime.
- Whale and petunias: sources backed up (they are in `meshes.sha256`), nothing else.
- `fetchPrebuiltData.ts` untouched; no restore tool.
- R2 sync execution and the sky-under-probe deletion decision.
