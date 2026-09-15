# Mesh sources as editable `.blend` files, backed up to R2

**Raised:** 2026-09-15, user visual pass on the mesh-body PBR feature. The
baked atlases are faithful to the NASA models, and the NASA models author
metallic 0 / roughness 0.5 on every material — so no dish reads as metal and
no panel as glass. The user wants to fix that in Blender, not in an override
table: open the model with its current materials, edit, save, rebake.

## Current state

- `tools/meshes/prebake/meshPrebake.py` `SOURCES`: Curiosity and MER are
  `.blend`, Voyager and Perseverance are `.glb` (imported via
  `import_scene.gltf`). Two load paths.
- The prebake re-applies fixes **in memory on every run**
  (`fix_colour_management`, `unify_shader_outputs`, `drop_materials`, the stow
  `frame`), so opening a source in the Blender GUI does not show what the
  bake sees.
- Nothing under `data/raw/meshes/` is tracked except the READMEs and
  `meshes.sha256`; the sources (1.4–19 MB each) and `.prebaked.*` outputs are
  local-only, pinned by hash. An edited `.blend` would be lost with the
  machine and would trip the hash pin.

## Shape

- One-time `importMesh.py` per body: pristine download → apply the fixes →
  save `<key>.blend`. For the two `.blend` rovers that is "apply fixes and
  save"; for the two `.glb` bodies it is the glTF import plus fixes.
- `SOURCES` names only `<key>.blend`; the glb branch and the in-memory fix
  passes are **deleted** from the prebake, which becomes load → frame → bake.
  The GUI then shows exactly what the bake sees.
- R2: a `mesh-sources` group in `tools/deploy/syncR2.ts` for both the pristine
  downloads (provenance — NASA attribution stays traceable) and the `.blend`
  files; `immutable`, never purged, ~50 MB. `meshes.sha256` keeps pinning
  what is on disk; a restore path pulls from R2 on a machine that lacks them.
- Whale and petunias stay `.glb` (not prebaked, not edited).
- README line: `.blend` files written by Blender 5.2 LTS do not open in
  older versions.

Rebake after an edit stays user-run: `npm run prebake-mesh -- <key>` then
`npm run build-meshes`.

Sequencing: after the PBR feature lands — it edits the same Python.

Note (deletion audit at /feature-done, 2026-09-15): the solar-system sky under the
probe (`cubeFaceBlitRenderer`, `skyCubemapBlitPass`, the `solarSystem` capture row,
~300 src / 100 test lines) has no visible payoff until a material is made metallic;
the user kept it for this edit path. If the edit never happens, that bundle is the
first thing to delete.
