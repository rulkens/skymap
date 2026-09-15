# Mesh sources as editable `.blend`, backed up to R2 — design

Plan: [`plans/2026-09-15-mesh-sources-as-blend.md`](../plans/2026-09-15-mesh-sources-as-blend.md).
Supersedes the backlog item of the same name (deleted with this spec).

## Context

Raised 2026-09-15 in the user's visual pass on the mesh-body PBR feature (#714). The
baked atlases are faithful to the NASA models, and the NASA models author metallic 0 /
roughness 0.5 on every material, so no dish reads as metal and no panel as glass. The
point of this work is that the user fixes that **in Blender**, not in an override table:
open the model with its current materials, edit, save, rebake.

Two things stand in the way today:

- `tools/meshes/prebake/meshPrebake.py` has two load paths (Curiosity and MER open a
  `.blend`; Voyager and Perseverance import a `.glb`) and re-applies its source fixes
  **in memory on every run** (`fix_colour_management`, `unify_shader_outputs`, the
  `drop_materials` markers, the stow `frame`, modifier application, UV unification).
  Opening a source in the Blender GUI does not show what the bake sees, and an edit to
  a `.glb` has nowhere to be saved.
- Nothing under `data/raw/meshes/` is tracked except READMEs and `meshes.sha256`. An
  edited `.blend` would be lost with the machine and would trip the hash pin.

Note (deletion audit at /feature-done, 2026-09-15): the solar-system sky under the
probe (`cubeFaceBlitRenderer`, `skyCubemapBlitPass`, the `solarSystem` capture row,
~300 src / 100 test lines) has no visible payoff until a material is made metallic;
the user kept it for this edit path. If the edit never happens, that bundle is the
first thing to delete.

## Goals / non-goals

Goals: one editable `<key>.blend` per NASA body holding every scene-content fix; a
prebake that reads only that file; the pristine downloads and the four `.blend` files
backed up to R2 with a documented restore.

Non-goals (deferral boundary): the material edits themselves; any change to
`buildMeshes.ts`, the atlases or the runtime; whale and petunias (not prebaked this way,
not edited); executing the R2 sync (post-merge, from main).

## Design

### The split: scene content vs bake artefact

A new one-shot importer, `tools/meshes/prebake/importMesh.py`
(`npm run import-mesh -- <key>`, Blender 5.2 LTS, user-run), turns the pristine download
into `data/raw/meshes/<key>/<key>.blend`. Rule: **anything that changes scene content
moves into the importer and is saved; anything that is a bake artefact stays in the
prebake.**

| Importer (saved into the `.blend`)                                        | Prebake (never saved)                                    |
| ------------------------------------------------------------------------- | -------------------------------------------------------- |
| load: `open_mainfile` (`.blend`) or factory-empty + glTF import (`.glb`)  | `open_mainfile(<key>.blend)`, `frame_set(frame_current)` |
| un-exclude / un-hide every collection                                     | `keepers`: meshes with faces and materials               |
| `fix_colour_management`, `unify_shader_outputs`                           | join, decimate (`triangles`)                             |
| at the stow frame: `apply_modifiers`, pose frozen, marker removal (below) | unwrap, arm, `BAKE_PASSES`                               |
| `unify_source_uvs` + `repoint_uv_references`                              | flatten, keep only bake UV, export                       |
| pack images, save with `frame_current` = stow frame                       |                                                          |

**The pose is frozen, not merely saved as `frame_current`.** Curiosity's markers
(`pivot`, `shadow2`) are rig parents. Deleting a parent needs its children's parents
cleared with `KEEP_TRANSFORM` first — but a child whose F-curves animate its local
transform would then re-apply parent-relative values on the next evaluation and scatter
the model. So at the stow frame the importer applies modifiers (Perseverance's armature
deform and Curiosity's geometry nodes are evaluated there), clears object animation,
clears every parent keeping world transforms, and only then deletes the markers. The GUI
shows the bake's pose at any timeline position, and the per-body `frame` config leaves
the prebake. `frame_current` is still saved at the stow frame so any non-object animation
(materials, node values) evaluates where it did before.

After this, the prebake's `SOURCES` carries only `<key>` → `triangles` (`None` except
Perseverance's 100 000); the glTF branch, `exclusions`, the fix passes and `drop_materials`
are deleted from it. The UV-name contract between the two scripts is not a duplicated
constant: the prebake reads the one UV layer every keeper shares and raises if any keeper
has more than one, or if names differ (a GUI edit that would silently re-break the
join-by-name merge).

### Acceptance: the generated file does not move

After import ×4 + prebake ×4 + `npm run build-meshes`,
`git diff src/data/bodies/meshAssets.generated.ts` is **empty** — same `meanAlbedo`, same
`triangleCount`, same bounds. The committed values are the reference. Blender is not in
CI, so this is user-run; any non-empty diff halts the plan and goes to the user.

### Pinning

`data/raw/meshes/meshes.sha256` gains the four `<key>/<key>.blend` lines (regenerated
after import, and again after every saved edit). It stays the one list of hand-held mesh
inputs: pristine downloads plus the four `.blend` files; `.prebaked.*` outputs stay out.

`rawDataRegistry.ts` gains `meshes.<key>Blend` rows (`source: 'gitignored'`,
`fetcher: 'tools/meshes/prebake/importMesh.py'`, the body's `upstream` and `readme`); the
`.prebaked.glb` rows' descriptions name the `.blend` as their input; `meshes.dir` and
`meshes.sha256` descriptions follow. `tests/tools/utils/io/rawDataRegistry.test.ts` only
checks `mcxc.table` and the `textures.*` family, so new mesh rows need no test.

### Backup to R2

A `Mesh sources` group in `buildGroups()` (`tools/deploy/syncR2.ts`), `wrangler`
transport, `purge: false`, selected by a new `tools/deploy/r2/collectMeshSources.ts` that
reads `meshes.sha256` — the pin file already names exactly the backup set (pristine
downloads for all six bodies, whale and petunias included, plus the four `.blend` files),
so no second list exists to drift. Files absent on disk are skipped, the same "absent
group is normal" posture as the other collectors.

- **Keys:** `data/raw/meshes/<path as in meshes.sha256>`. `public/data` keys are
  `data/<path under public/data>` and `public/data/` has no `raw/` directory, so the
  `data/raw/` root cannot collide; `collectExtraFiles` already keys CF4 and MCPM caches
  under `data/raw/...` for the same reason.
- **Cache:** `NO_CACHE`, not `IMMUTABLE`. The pristine downloads never change, but a
  `.blend` is by definition re-saved under the same key: an immutable header would let the CDN
  serve the pre-edit bytes to a restore for a year, and `remoteEtag`'s HEAD through the
  edge could return a stale ETag that matches reverted local bytes and skip an upload.
  `no-cache` makes the edge revalidate every read; the files are fetched only on restore,
  so there is nothing to lose. `purge: false` then holds without a purge call.

### Restore

A documented command in a new `data/raw/meshes/README.md` (registry row
`meshes.readme`): loop over `meshes.sha256`, `curl --fail --create-dirs` each file from
`https://skymap-data.rulkens.com/data/raw/meshes/<path>` (spaces as `%20`), then
`shasum -a 256 -c meshes.sha256`. No new tool: `fetchPrebuiltData.ts` is driven by
`public/data/manifest.json` hashed paths and would need a second mode to reach unhashed
`data/raw` keys, and the registry's `fetcher` convention does not force one — the
existing mesh source rows already carry no fetcher and point at their README.

### READMEs and docs

Each NASA body README gains: the `.blend` is the edited source; written by Blender 5.2
LTS, it does not open in older versions; re-import from the pristine download with
`npm run import-mesh -- <key>`; edit materials in the GUI, save, update its
`meshes.sha256` line, `npm run prebake-mesh -- <key>`, `npm run build-meshes`. Text that
describes the fixes as prebake behaviour is rewritten as importer behaviour.
`docs/DEPLOY.md` names the new group in the R2 sync architecture and cache paragraphs.
`docs/DATA.md` has no mesh paragraphs and is unchanged.

## Ground preparation

None needed for the Python — because the fix passes ARE the thing moving; nothing else
consumes them (`petuniasPrebake.py` is a standalone script that imports nothing from
`meshPrebake.py`).

One missing joint on the R2 side: `uploadViaWrangler` builds a shell string with
unquoted `--file` and key, and every NASA source name contains spaces and parentheses
(`Voyager Probe (B).glb`), which is a shell syntax error. The fix is to spawn wrangler
with an argument array (`execFileSync`) instead. It is a few lines, is exercised only by
this group, and rides in the R2 task rather than its own PR.

## Success criteria

1. `data/raw/meshes/<key>/<key>.blend` exists for voyager, perseverance, curiosity, mer,
   and opening one in Blender 5.2 shows the deployed pose with the fixed materials.
2. `meshPrebake.py` has one load path and no fix passes; its `SOURCES` is key →
   triangles.
3. The import + prebake + build round trip leaves `meshAssets.generated.ts` byte-identical.
4. The group summary `syncR2.ts` prints before uploading lists `Mesh sources` with one
   file per `meshes.sha256` line (run from main, post-merge).
5. The README restore command, run against R2 after the post-merge sync, reproduces the
   files and passes `shasum -c`.
