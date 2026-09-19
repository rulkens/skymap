# Mesh-body baked ambient occlusion — plan

Spec: `docs/superpowers/specs/2026-09-18-mesh-body-ambient-occlusion-design.md`.
Branch `mesh-body-ao-bake`, one PR, prep commit first.

Strategy: the prep (Task 1) is behaviour-neutral. The TS rule for "which mesh sits on
the ground" (Task 2) feeds both the Blender driver (Task 3) and the `buildMeshes`
stamp check (Task 5), so it lands before both. Blender work (Tasks 3–4) cannot run in
CI; it is verified by the re-bake in Task 7. Every `_mr` built today has R = 0, which
the Task 6 shader would read as full occlusion, so Tasks 5 and 6 only ship together
with the `build-meshes` re-run in Task 7 (and the R2 sync after merge).

## Task 1 (prep): bake rows carry their own sample count

**Files:** `tools/meshes/prebake/meshPrebake.py`

- [ ] `BAKE_PASSES` rows (`meshPrebake.py:84-89`) gain a sample count; every existing
      row keeps 1. `bake_pass` (`:231`, the hardcoded `scene.cycles.samples = 1` at
      `:246`) reads it from the row. Keep the row a tuple unpacked in `main()` (`:362`);
      update the `prepare`/row docstring (`:34`) if it names the row shape.
- [ ] No test (no Python harness; behaviour-neutral). Commit
      `refactor(meshes): bake rows carry their own sample count`.

## Task 2: `meshGroundUpSource` — which meshes sit on the ground

**Files:** `tools/utils/meshes/meshGroundUpSource.ts` (new),
`tests/tools/utils/meshes/meshGroundUpSource.test.ts` (new)

**Signature:** `meshGroundUpSource(meshKey: string): Vec3 | undefined`

**Behaviour:** a key is seated when a `SCENE_MESH_BODIES` entry
(`src/data/bodies/sceneMeshBodies.ts:38`) with that `meshKey` has an id in
`SURFACE_FIXED_SITES` (`src/data/bodies/surfaceFixedSites.ts`). Seated → body +Z in the
SOURCE frame: `rotateVec3ByTightMat3T([0, 0, 1], bodyFromSource)`
(`src/utils/math/rotateVec3ByTightMat3T.ts`), with `MESH_SOURCES[meshKey].bodyFromSource`
(`tools/utils/io/meshSources.ts`); absent `bodyFromSource` = identity. Not seated →
`undefined`. Throws when the key backs both a seated and a floating body (name the key
and both body ids).

- [ ] Test `the rovers bake against a ground whose up is source +Y`: `curiosity`,
      `perseverance`, `mer` → `[0, 1, 0]` (toBeCloseTo per component).
- [ ] Test `a floating mesh bakes with no ground`: `voyager`, `hubble` → `undefined`.
- [ ] No test for the mixed-key throw: no real data can reach it, and faking the tables
      would test the fake.
- [ ] Commit `feat(meshes): derive which meshes sit on the ground from the scene data`.

## Task 3: the prebake driver

**Files:** `tools/meshes/prebakeMesh.ts` (new), `package.json`,
`tools/meshes/prebake/meshPrebake.py`

- [ ] `prebakeMesh.ts <key>`: `spawnSync` Blender (`process.env.BLENDER` ??
      `/Applications/Blender.app/Contents/MacOS/Blender`) with
      `--background --factory-startup --python tools/meshes/prebake/meshPrebake.py --
      <key>` plus `--ground-up x,y,z` when `meshGroundUpSource(key)` is defined;
      `stdio: 'inherit'`; exit with Blender's status. Rejects a key not in
      `MESH_SOURCES`. Follow the `invokedDirectly` pattern of
      `tools/textures/buildSiteGroundHeights.ts:63`.
- [ ] `package.json` `prebake-mesh` → `tsx tools/meshes/prebakeMesh.ts`.
- [ ] `meshPrebake.py main()` (`:339`): parse the args after `--` as
      `<key> [--ground-up x,y,z]` (`argparse` on `sys.argv[sys.argv.index("--") + 1:]`)
      instead of `sys.argv[-1]`; carry the ground up (tuple or `None`) forward for
      Task 4. Nothing else uses it yet.
- [ ] No test (a process spawn; Task 7 exercises it). Commit
      `feat(meshes): prebake-mesh runs through a driver that knows the ground`.

## Task 4: the AO bake, ground plane, ORM export and stamp

**Files:** `tools/meshes/prebake/meshPrebake.py`

- [ ] New last row in `BAKE_PASSES`: `("occlusion", dict(type="AO"), "Non-Color", None)`
      with `AO_SAMPLES = 128`.
- [ ] `main()`: set the scene-level AO distance Cycles' AO bake reads
      (`scene.world.light_settings.distance`; create a world if the scene has none) to
      `AO_DISTANCE_FRACTION = 0.25` × the largest extent of `bounds(obj)` (`:354`).
- [ ] Seated only (`--ground-up` given): after `join_meshes` and before the bake loop,
      add a square plane: normal = the ground up, through the lowest vertex along it
      (min of `dot(world vertex, up)`), centred under the bounds centre, side
      `GROUND_PLANE_SPAN = 4` × the largest extent. Never selected or active (it is an
      occluder, not a bake target). Remove it (object and mesh datablock) before
      `flatten_materials`.
- [ ] `flatten_materials` (`:272`): link the occlusion atlas into the Occlusion input of
      a `glTF Material Output` node group (create the group with a float `Occlusion`
      input if `bpy.data.node_groups` lacks it) — that group is how the Blender glTF
      exporter finds occlusion; update the docstring: the exporter packs
      occlusion R, roughness G, metallic B into one image.
- [ ] `export` (`:306`): seated → set `obj["aoGroundUp"] = [x, y, z]` and turn
      `export_extras` on (`:323`) so it lands as the node's `extras.aoGroundUp`.
      Floating meshes export no stamp; keep `export_extras=False` for them, so no
      stray custom property of a floating source leaks in.
- [ ] No test (Blender-only; Task 7 verifies). Commit
      `feat(meshes): bake ambient occlusion, against the ground for seated meshes`.

## Task 5: `buildMeshes` — stamp check and the R rule

**Files:** `tools/meshes/buildMeshes.ts`, `tests/tools/meshes/buildMeshes.test.ts`

- [ ] `MeshBuildTarget` (`buildMeshes.ts:46`) gains `readonly groundUp?: Vec3`;
      `main()` (`:616`) fills it from `meshGroundUpSource(key)`.
- [ ] `bake()` (`:440`): read `extras.aoGroundUp` from the GLB's nodes (at most one node
      carries it). Throw when stamp and `target.groundUp` disagree (one present and not
      the other, or a component differs by > 1e-6):
      `buildMeshes: <key> was prebaked for ground <stamp|none>, the scene seats it on
      <expected|none> — re-run npm run prebake-mesh -- <key>`.
- [ ] The `_mr` R rule: R survives only when `material.getOcclusionTexture()` is the
      same `Texture` as `getMetallicRoughnessTexture()`; otherwise R is written as 255.
      The constant fallback (`:474-481`) becomes `r: 255`; update its comment (R is
      glTF's occlusion). `writeTexture` (`:423`) is the place to apply it.
- [ ] Test `refuses a GLB prebaked for a different ground than the scene seats it on`
      (stamped GLB, target without `groundUp`) and the reverse case in the same test.
- [ ] Test `writes R = 255 when the mr texture carries no occlusion`: MR image with
      R = 0 and no occlusionTexture → every written `_mr` pixel has R 255, G/B kept.
- [ ] Test `keeps R when occlusion is packed into the mr texture`: same image set as
      both → R preserved.
- [ ] Update the existing fallback test (`buildMeshes.test.ts:417`) to expect R 255.
- [ ] Commit `feat(meshes): carry baked occlusion in R of the mr map, 255 when absent`.

## Task 6: AO attenuates the environment light — review: yes

**Files:** `src/services/gpu/shaders/lib/pbr.wesl`,
`src/services/gpu/shaders/bodies/meshBody/fragment.wesl`

- [ ] `envSplitSum` (`pbr.wesl:357`) gains a last parameter `ao: f32`. Diffuse × `ao`;
      specular × the Lagarde 2014 specular occlusion
      `saturate(pow(NoV + ao, exp2(-16.0 * roughness - 1.0)) - 1.0 + ao)`. Extend the
      header comment by at most two lines (AO dims the environment, never the sun).
- [ ] `fragment.wesl:48`: sample `.rgb`; R is `ao`, G roughness, B metallic; fix the
      comment above it. Pass `ao` at `:58`. `pbrDirectSphere` is untouched.
- [ ] No new test; WESL link is covered by the existing shader compile tests. Commit
      `feat(meshBody): baked occlusion dims the environment light`.

## Task 7 (controller): re-bake, build, backlog

- [ ] Sources: the worktree's `data/raw/meshes/<key>/` holds only README.md. For
      voyager, perseverance, curiosity, mer, hubble (and whale, petunias for
      `build-meshes`), symlink each entry of main's `data/raw/meshes/<key>/` into the
      worktree's, EXCEPT `*.prebaked.*` (outputs must be real files here, not writes
      through into main).
- [ ] `npm run prebake-mesh -- <key>` × 5; then `npm run build-meshes`. Note:
      `public/data` is main's (symlink), so the new hashed mesh files and manifest land
      in main's local data. Harmless before merge — main's shader reads `.gb` only —
      but record it in the PR.
- [ ] Inspect the `_mr` PNGs: rovers' undersides dark in R; floating meshes R < 255
      only in crevices.
- [ ] Backlog: delete effort A from `docs/backlog/2026-09-18-mesh-body-ambient-occlusion.md`
      (effort B, the contact decal, stays; retitle) and update its `BACKLOG.md` line;
      add the adjacent finding (AO for petunias = fold `petuniasPrebake.py` into
      `meshPrebake.py` first; whale has no prebake).

## Definition of Done

- Deliverables: `meshGroundUpSource.ts`, `prebakeMesh.ts`; `meshPrebake.py` AO row,
  ground plane, ORM export, `aoGroundUp` stamp; `buildMeshes` stamp check + R rule;
  `envSplitSum(…, ao)`; re-baked prebaked GLBs + `.mesh`/PNGs for five meshes.
- Observable (user eye-check, f.lux off): rover undersides and wheel wells darker
  under the probe light; Voyager's dish interior darker; sunlit faces unchanged;
  whale and petunias look as before.
- `build-meshes` refuses a rover prebaked without its ground.
- Out of scope: the contact decal (effort B), multi-bounce AO, AO for whale and
  petunias, AO on the direct sun term, R2 sync (main session, after merge).
