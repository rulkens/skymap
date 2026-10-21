# Body Layers: earthScenes draws its own rows

**Spec:** [`specs/2026-10-20-body-layers-design.md`](../specs/2026-10-20-body-layers-design.md) §3 (the
`earthScenes` row), §5 rulings 5, 7, 10, §6 P1 ("the `earthScenes` PR later adds its mesh pass and slot"),
§7 step 3. Follows [`completed/2026-10-20-body-layers-missions-craft.md`](completed/2026-10-20-body-layers-missions-craft.md),
whose Out of scope names this PR: earthScenes' mesh pass and Søndermarken's glint, deleting
`CORE_MESH_BODY_IDS`' drawing role.

**Strategy.** One PR. The `earthScenes` Layer stops being bodies-only: it draws Søndermarken through
core's one mesh handle (ruling 10: the slot stays core's) and glints it through its own glint-renderer
instance, as `missions` does for the craft. Core's drawing roster narrows to `SCENE_PLANETS`, so
`core-mesh-bodies` draws only the shape-model moons until the body PR. Søndermarken stays uncaptioned,
unpicked and claimed by the `body` selection kind (`#focus=body-soendermarken` keeps landing): the spec
gives earthScenes no caption, selection kind or card yet.

**Contract widenings:** none. `earthScenes` uses the existing `create`, `destroy` and `passes` members.
Any Layer contract member change is a STOP: report it, don't add it.

**Ground preparation.** Second-special-case trigger: `missionGlintsPass` is a glint pass over one
Layer's roster through that Layer's renderer, and earthScenes needs the same. Task 1 extracts the factory
(the `meshBodiesPassOver` precedent) behaviour-neutrally, as its own commit, before earthScenes uses it.

**Execution:** lean SDD. One dispatch (Sonnet) = Tasks 1–3, three commits. One final review, CI, smoke.

**Perf estimate and ruling.** Worst pose `#focus=body-soendermarken` from orbit (Søndermarken a glint):
one more `sceneBodyPresentation` walk per frame for `earth-scene-glints`' `enabled` (~5 µs) and at most
one extra instanced draw of one glint (28 B `writeBuffer`); `earth-scene-meshes` replaces the work
`core-mesh-bodies` did for the same body. Net under 0.01 ms CPU and GPU. **Ruling: no perf gate.**

**Planning findings:**

- `CORE_MESH_BODY_IDS` (`src/data/bodies/coreMeshBodyIds.ts`) has two roles: core's drawing roster
  (through `CORE_SCENE_BODY_IDS` → `coreMeshBodiesPass`, `coreSceneBodyPartition`) and the `body` kind's
  focus claim (`isCoreBodyId`, read by `bodySelectionRow` and `rankPaletteMatches`). Only the drawing
  role goes; the claim stays, renamed for what it is.
- Søndermarken is unpicked because `sceneBodyPickId('soendermarken')` is `null` (it has no
  `BODY_PICK_ROWS` seed); the earthScenes mesh pass passes `() => null`.
- It glints today: core's `body-glints` partitions `CORE_SCENE_BODY_IDS`, and an unresolved mesh body
  lands in `glints` (`sceneBodyPartition.ts:36`).
- It carries no `contactDecal`; the probe scheduler and NEAR0 read `bodySlabRosterIds`, which keeps it.
- Core may import a Layer's `bodies/` rows (the `layerBodyRows` precedent), never its `present/`.

---

### Task 1: one glint pass over a Layer's roster (prep, behaviour-neutral)

**Files:** `src/services/engine/frame/glintsPassOver.ts` (create; the frame-file purity rule applies),
`src/layers/missions/passes/missionGlintsPass.ts` (becomes a call), `src/layers/missions/layer.ts`.

**Contract:**

```ts
// the craft's pass is then glintsPassOver('mission-glints', MISSION_CRAFT_IDS, runtime.glintRenderer)
export function glintsPassOver(
  name: string,
  roster: ReadonlySet<string>,
  renderer: BodyGlintRenderer,
): ContentPass;
```

Staging is sized `roster.size * BODY_GLINT_INSTANCE_FLOATS`, allocated once per pass. No `drawPick`.

**Tests:** none new; the existing missions glint tests stay green unchanged (behaviour-neutral).

- [ ] Task 1

### Task 2: earthScenes draws Søndermarken; core's roster narrows

review: yes

**Files:**

- earthScenes: `src/layers/earthScenes/layer.ts` (`create`/`destroy` own a `BodyGlintRenderer`;
  `passes` returns its two passes), `src/layers/earthScenes/@types/EarthScenesRuntime.d.ts` (create),
  `src/layers/earthScenes/passes/{earthSceneMeshesPass,earthSceneGlintsPass}.ts` (create).
- Core: `src/data/bodies/coreMeshBodyIds.ts` → rename to `earthSceneBodyIds.ts` /
  `EARTH_SCENE_BODY_IDS` via `npm run move-files` + `npm run refactor` (its header drops "delete when…";
  its one role is the claim and the earthScenes roster); `src/data/bodies/coreSceneBodyIds.ts`
  (`SCENE_PLANETS` only); `src/services/engine/frame/passes/coreMeshBodiesPass.ts` (header);
  `src/utils/scene/isCoreBodyId.ts`; `src/data/rendering/frameSections.ts`.
- Tests: `tests/data/bodies/coreSceneBodyIds.test.ts`, `tests/services/engine/frame/expandFrameOrder.test.ts`.

**Contract:**

- Pass names `earth-scene-meshes` (in `bodyPasses` after `core-mesh-bodies`) and `earth-scene-glints`
  (after `mission-glints`). Neither joins the probe roster, for the reasons the roster comment gives
  for `mission-meshes` and `mission-glints`; update that comment's name lists.
- `earthSceneMeshesPass = meshBodiesPassOver('earth-scene-meshes', EARTH_SCENE_BODY_IDS, () => null)`.
- `EarthScenesRuntime = { readonly glintRenderer: BodyGlintRenderer }`; `destroy` releases it the way
  missions' does (or neither does: match missions, and say which).

**Tests:**

- `core draws no earthScenes body and earthScenes draws only its own` — over a fixture state with
  Søndermarken resident, `drawableMeshBodies` for `CORE_SCENE_BODY_IDS` excludes it and for
  `EARTH_SCENE_BODY_IDS` holds exactly it (extend `coreSceneBodyIds.test.ts`). **Bug caught:** both
  passes draw the park (z-fight) or neither does (it vanishes).
- `expandFrameOrder` pins `['mission-meshes', 'core-mesh-bodies', 'earth-scene-meshes']`.

**Done:** `rg CORE_MESH_BODY_IDS src tests` returns nothing.

- [ ] Task 2

### Task 3: docs

**Files:** `src/layers/README.md` (the earthScenes row: draws its rows; drop the
"core still draws Søndermarken" note), `docs/RENDERER.md` (pass list, if it names `core-mesh-bodies`
or the glint passes), spec §3 untouched.

- [ ] Task 3

---

## Definition of Done

**Deliverables:** `glintsPassOver`; earthScenes' `earth-scene-meshes` and `earth-scene-glints` passes,
`EarthScenesRuntime`; `EARTH_SCENE_BODY_IDS` (renamed from `CORE_MESH_BODY_IDS`); `CORE_SCENE_BODY_IDS`
narrowed to `SCENE_PLANETS`; docs.

**Observable behaviour (smoke), identical to main:**

- `#focus=body-soendermarken`: the park on terrain, lit, uncaptioned; clicking it selects nothing.
- `#focus=body-phobos` and `#focus=body-deimos`: the shape-model moons still draw as meshes.
- `#focus=body-earth`, pulled back until Copenhagen is sub-pixel: Søndermarken's glint behaves as on main.
- `#focus=body-hubble`, `#focus=body-curiosity`: craft unchanged.

**Out of scope:** Søndermarken's mesh slot (stays core, ruling 10); a caption, selection kind or card
for earthScenes; the body PR (P5) and the seeded stars.
