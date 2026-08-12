# Zone-of-avoidance guide layer

**Spec:** [`docs/superpowers/specs/2026-08-13-zone-of-avoidance-guide-layer.md`](../specs/2026-08-13-zone-of-avoidance-guide-layer.md)
**Grill:** [`docs/grill-sessions/zone-of-avoidance-guide-layer-2026-08-12.md`](../../grill-sessions/zone-of-avoidance-guide-layer-2026-08-12.md)
**Ground preparation:** none needed — `milkyWay` is the template at every touchpoint (spec §"Ground preparation").
**Picks up:** `docs/BACKLOG.md`'s "Zone of Avoidance visualization + tour beat" line + `docs/backlog/2026-07-21-zone-of-avoidance-visualization.md` (Task 1 removes both — the grill session converged the design onto the band+lettering scope below; the detail file's "tour beat" and "NIR-dwarf feature" directions are explicitly out of scope per the spec's Non-goals and are not carried forward as a fresh backlog item).

For agentic workers: REQUIRED SUB-SKILL `superpowers:subagent-driven-development`. Load the `wesl-shaders` skill BEFORE editing any `.wesl` file — every task below that touches one says so again, but the skill load is not optional even where the reminder is terse. Each task ends with its own scoped commit; **stage named files, never `git add -A`**; commit messages follow the house style (`docs/superpowers/conventions/comments.md`'s register — short, why-not-what, no LLM tells); **tick this plan's checkboxes as steps complete**, in the plan file itself, not just in the execution ledger.

## Goal

A translucent, additively-blended wedge along the galactic plane — inner edge a few Mpc out, outer edge near the survey shell (~380 Mpc), longitude-varying half-width `b_limit(ℓ)` (±15° at the bulge, ±5° at the anticenter) — that plugs the zone-of-avoidance hole in every galaxy catalog with an honest, self-explaining annotation instead of a silent gap. Curved on-surface lettering ("ZONE OF AVOIDANCE", repeated 2–3× around the band) reads as a map annotation; clicking the band opens an InfoCard with the didactic explanation. Invisible near Earth, fades in past the Local Group (~5–10 Mpc), full at survey scale. Band and lettering toggle independently, both default ON. No data pipeline — the shape is a closed-form `b_limit(ℓ)`, zero fetch/bake machinery.

## Architecture

Ten independent-but-coordinated surfaces, each a "one more row" addition to an existing total or partial dispatch table — no new mechanism except the curved-text vertex path:

1. **Registry** — `Source.ZoneOfAvoidance` (next append-only code), a `ZoneOfAvoidanceSourceEntry` `SourceEntry` arm, one `SOURCE_REGISTRY` row (`bearsLabel: true`, feeding `LABEL_CATEGORIES`/`CATEGORY_DISPLAY_INFO` for free).
2. **Settings** — `ZoneOfAvoidanceSettings = { enabled, labelEnabled } & ZoneOfAvoidanceTuning`, a singleton-overlay cluster on `EngineSettingsState` (no `items` record), defaults/reducers/selectors mirroring `milkyWay`.
3. **Selection type-arm cascade** — `SelectionRef` → `RESOLVE_PICK` → `EXTRACT_ROW`/`SelectionRow` → `BUILD_FOCUSABLE`/`FocusableTarget` → `REF_OF` → `TARGET_IDENTITY_KEY` → `URL_HASH_FOR` (returns `null` — no deep link) → `SELECTION_HALO_TABLE` (returns `null` — no selection ring; the band has no natural ring center) → `DETAIL_CARD`. One coherent task by construction (see below).
4. **InfoCard** — `ZoneOfAvoidanceDetailCard` + `CompactZoneOfAvoidanceCard`, carrying the didactic copy (dust extinction, why surveys are blind here). No Focus/"Fly here" affordance — `ZoneOfAvoidanceInfo` carries no world position (resolves the spec's open x/y/z question; see Task 3).
5. **Fades + wake** — one `SCALE_FADE_BANDS` row, two `fadeLayers.ts` rows (band + label, independent toggles), new `VisibilityLayerKey`/`FadeId` members, wake is automatic (`WAKE_ROUTES` already covers the whole `settings/` prefix).
6. **Renderer + ContentLayer** — a fullscreen-quad, camera-basis-ray-marched additive shell (the `horizonShellRenderer` technique, NOT the proxy-mesh `diskAxes` technique the spec's Architecture section cites — see Task 6's note), gated by the fade + settings toggle, one `CONTENT_LAYERS` row.
7. **Curved text** — reuses `layoutLabel`'s pure pen-space glyph layout; a new world-space vertex path places each glyph quad along the band's great circle instead of billboarding it.
8. **Pick** — a `drawPick` on the SAME `ContentLayer` row (the current `pickProgram.ts` auto-discovers layers with `drawPick` — no separate `pickRenderer.ts` registration, unlike the older milky-way-selectable precedent; see Task 12's note), analytic ray/wedge intersection + `frag_depth`, mirroring `spherePick.wesl`'s discard-on-miss shape.
9. **DebugPanel tuning** — `ZONE_OF_AVOIDANCE_SLIDER_FIELDS` + a parity test, section + container, mirroring `MilkyWayTuningSection`. `color` gets a bespoke (non-slider-table) control — a feel-call, not a contract.
10. **SettingsPanel** — the band's `enabled` toggle is a hand-authored `SectionRow` (like `toggle-constellations`); `labelEnabled` folds into the registry-driven `LABEL_CATEGORIES` machinery via one `LABEL_HOME_BY_SOURCE_TYPE` row.

## Tech Stack

TypeScript + React (UI shell), raw WebGPU + WESL (band, lettering, pick). Tests: Vitest, mirroring `src/`. Conventions per `CLAUDE.md`: `type` never `interface`, one type per file in `src/@types/`, one function per file in `src/utils/`, deep relative imports (no barrels), `Vec3` alias (never a raw `[number,number,number]` tuple) for the `color` tuning field, typed `vi.fn<() => void>()` mocks, didactic comments budgeted per `docs/superpowers/conventions/comments.md`.

## Global constraints

- **Never `git add -A`** — stage named files per task.
- **`wesl-shaders` skill BEFORE any `.wesl` edit** — Tasks 6, 7, 8 are gated on this; load it even if the task text feels self-explanatory.
- **Shader file convention**: folder + `io`/`vertex`/`fragment` split, per-type fragments (mirror `labels/fragment.wesl` + `labels/fragmentOcclude.wesl` — one vertex stage, two fragment entry points as separate files), no `g0`/`w2`-style unlabelled locals.
- **A clean `npm run build` does NOT prove a shader compiles** — `device.createShaderModule` is a runtime check the linker/`tsc` don't perform. Every `.wesl`-touching task carries its own visual-acceptance step: dev server running, console open, confirm the named appearance AND zero `Invalid ShaderModule`/`Invalid RenderPipeline` lines.
- **Opacity-0 house rule**: fully faded ⇒ `ContentLayer.enabled()` returns `false` ⇒ neither drawn nor pickable (the pick program reuses `enabled` unless a layer declares its own narrower `pickEnabled`; this layer doesn't need one — draw and pick visibility are identical).
- **Early visual checkpoints are gates, not suggestions.** Task 9 (band) and Task 11 (lettering) STOP for the user to look in the running dev server — the executor asks the user to look; it does not screenshot-verify itself. Tasks 12–14 (pick, DebugPanel tuning, SettingsPanel row) do not start until the checkpoint they follow is cleared.
- **Never edit `.claude/worktrees/*` other than this one; never kill the dev server** (leave `npm run dev` running for the visual checkpoints — start it if not already running).

## Task sequencing (authored, not mined)

Tasks 1–5 are pure-TS/registry plumbing with no GPU surface; Tasks 6–8 are the render pipeline; 9 and 11 are STOP checkpoints; 12–14 are the polish tasks explicitly sequenced after both checkpoints; 15 closes the plan. Implementers run strictly serially (per `docs/superpowers/conventions/sdd-execution.md`); the dependency lines below are prerequisites, not a parallel-dispatch schedule — they exist so a reviewer can tell whether a later task's diff could legally start before an earlier task's review has closed (SDD Rule 2's Files-disjointness gate).

| # | Task                                    | Depends on | Files disjoint from |
|---|------------------------------------------|-----------|----------------------|
| 1 | Backlog hygiene                          | none      | everything           |
| 2 | Registry entry                           | none      | 1, 3, 4              |
| 3 | `b_limit(ℓ)` pure math + test             | none      | 1, 2, 4              |
| 4 | Settings cluster                         | none      | 1, 2, 3              |
| 5 | Selection type-arm cascade               | 2         | 1, 3, 4              |
| 6 | InfoCard components + `DETAIL_CARD` row  | 5         | 1–4, 7               |
| 7 | Fades + wake wiring                      | 4         | 1–3, 5, 6            |
| 8 | Renderer + shader: band geometry         | 3, 4, 7   | 1, 2, 5, 6           |
| 9 | **VISUAL CHECKPOINT — band**              | 8         | —                     |
| 10 | Curved-text mechanism                    | 8, 7      | —                     |
| 11 | **VISUAL CHECKPOINT — lettering**         | 10        | —                     |
| 12 | Analytic pick                            | 8, 5      | 13, 14                |
| 13 | DebugPanel tuning section                | 4         | 12, 14                |
| 14 | SettingsPanel row                        | 2, 4      | 12, 13                |
| 15 | Final visual pass + entanglement-radar   | all       | —                     |

---

### Task 1: Backlog hygiene — remove the picked-up item

**Files:** `docs/BACKLOG.md` (modify, line 132), `docs/backlog/2026-07-21-zone-of-avoidance-visualization.md` (delete)

- [x] Delete the "**Zone of Avoidance visualization + tour beat**" index line from `docs/BACKLOG.md`.
- [x] `rm -f docs/backlog/2026-07-21-zone-of-avoidance-visualization.md` (bare `rm` prompts interactively and hangs).
- [x] Commit alongside the spec + this plan if they are not already committed.

### Task 2: Registry entry — `Source.ZoneOfAvoidance` + `SOURCE_REGISTRY` row

**Files:** `src/data/source.ts` (modify), `src/@types/data/zoneOfAvoidance/ZoneOfAvoidanceSourceEntry.d.ts` (new), `src/data/sources/zone-of-avoidance.ts` (new), `src/@types/data/SourceEntry.d.ts` (modify), `src/data/sources.ts` (modify)

**Contract** (`ZoneOfAvoidanceSourceEntry.d.ts`, mirrors `MilkyWaySourceEntry.d.ts` exactly):

```ts
import type { SourceEntryBase } from '../SourceEntryBase';

export type ZoneOfAvoidanceSourceEntry = SourceEntryBase & {
  readonly type: 'zoneOfAvoidance';
  readonly code: number;
};
```

- [x] Append `ZoneOfAvoidance: 29` to the `Source` const object in `src/data/source.ts` (`source.ts:8-15` lists the append-only codes ending at `SStar: 28`). Note in the module comment near `SStar`'s existing budget note: the pick texture's source field is 5 bits with 31 reserved as an all-ones sentinel (`source.ts`'s `SStar` docblock), so **only 29 and 30 remain** as pickable-budget codes after this — the next pickable source after this one needs a fresh budget conversation. `zoneOfAvoidance` genuinely is pickable (grill Q5 Option C), so it consumes one of the two.
- [x] Add `ZoneOfAvoidanceSourceEntry.d.ts` (above).
- [x] Add `src/data/sources/zone-of-avoidance.ts` exporting `ZONE_OF_AVOIDANCE_ENTRY`, mirroring `src/data/sources/milky-way.ts`'s shape: `type: 'zoneOfAvoidance'`, `code: Source.ZoneOfAvoidance`, `id: 'zoneOfAvoidance'`, `label: 'Zone of Avoidance'`, `allSky: true`, `visible: true`, `bearsLabel: true`, `bearsMarker: false`, `labelLayer: 'zoneOfAvoidance'`, `detailLabel: 'Zone of Avoidance'`, `shortLabel: 'Zone of Avoidance'`, `plural: 'Zone of Avoidance'`. **Note:** unlike `MILKY_WAY_ENTRY`, this row's `visible: true` is NOT what seeds the settings default — Task 4's `DEFAULT_ZONE_OF_AVOIDANCE_ENABLED` is a plain literal per grill Q7 (there is no on/off precedent to derive from the way `DEFAULT_MILKY_WAY_ENABLED` derives from this same field). Set it `true` anyway for internal consistency; nothing reads it for that purpose.
  - **DIVERGENCE:** `bearsLabel`/`labelLayer`/`detailLabel`/`shortLabel`/`plural` are deferred (`bearsLabel: false`, others omitted) — setting them per the brief breaks `npm run typecheck` via total-`Record` gates in 4 files outside this task's scope (`focusRecession.ts`, `fadeIdToVisibilityKey.ts`, `labelHomeBySourceType.ts` — the last needs Task 4's `setZoneOfAvoidanceLabelEnabled`). See task-2-report.md.
- [x] Add `| ZoneOfAvoidanceSourceEntry` to the `SourceEntry` union in `src/@types/data/SourceEntry.d.ts` (currently 9 arms; `milkyWay` is one of them, not literally "the 9th" by list position — union order is cosmetic).
- [x] In `src/data/sources.ts`: import `ZONE_OF_AVOIDANCE_ENTRY`, add `[Source.ZoneOfAvoidance]: ZONE_OF_AVOIDANCE_ENTRY,` to `SOURCE_REGISTRY` (the `as const satisfies Readonly<Record<SourceType, SourceEntry>>` cast at the bottom of the file makes a missing row a compile error).
- [x] `npm run typecheck` clean. `npm test` green (no behaviour change yet — nothing reads the new row).
- [x] Commit.

### Task 3: `b_limit(ℓ)` pure math + test

**Files:** `src/utils/math/zoneOfAvoidanceBLimitDeg.ts` (new), `tests/utils/math/zoneOfAvoidanceBLimitDeg.test.ts` (new)

Grill Q8's analytic cosine bump: full width at the bulge (`ℓ = 0`), narrow at the anticenter (`ℓ = π`). `galacticLonRad` is galactic longitude in radians (from `worldToGalactic`'s output, `atan2`'d — this function takes the angle, not the vector; the shader-side caller does the `atan2`).

**Signature:**

```ts
export function zoneOfAvoidanceBLimitDeg(
  galacticLonRad: number,
  bulgeDeg: number,
  anticenterDeg: number,
): number;
```

**Behaviour:** `anticenterDeg + (bulgeDeg - anticenterDeg) * (0.5 + 0.5 * Math.cos(galacticLonRad))`. At `galacticLonRad = 0` → `bulgeDeg`. At `galacticLonRad = π` → `anticenterDeg`. At `galacticLonRad = π/2` → the midpoint average.

- [ ] Add the test `zoneOfAvoidanceBLimitDeg returns bulgeDeg at galactic longitude 0` — hand-computed: `zoneOfAvoidanceBLimitDeg(0, 15, 5) === 15`.
- [ ] Add the test `zoneOfAvoidanceBLimitDeg returns anticenterDeg at galactic longitude π` — hand-computed: `zoneOfAvoidanceBLimitDeg(Math.PI, 15, 5)` close to `5` (`toBeCloseTo`, floating-point `cos(π)`).
- [ ] Add the test `zoneOfAvoidanceBLimitDeg returns the midpoint at galactic longitude π/2` — hand-computed: `zoneOfAvoidanceBLimitDeg(Math.PI / 2, 15, 5)` close to `10`.
- [ ] Implement.
- [ ] `npm test -- zoneOfAvoidanceBLimitDeg` green. `npm run typecheck` clean.
- [ ] Commit.

### Task 4: Settings cluster — types, defaults, initial state, reducers, selectors

**Files:** `src/@types/settings/ZoneOfAvoidanceSettings.d.ts` (new), `src/@types/settings/ZoneOfAvoidanceTuning.d.ts` (new), `src/@types/settings/EngineSettingsState.d.ts` (modify), `src/data/defaults.ts` (modify), `src/state/settings/initialState.ts` (modify), `src/state/settings/settingsSlice.ts` (modify), `src/state/settings/selectors.ts` (modify)

**Contract** (exactly the spec's Ground-preparation sketch — `ZoneOfAvoidanceTuning.d.ts` uses `Vec3` for `color`, not a raw tuple, per the project's Vec-alias convention):

```ts
// ZoneOfAvoidanceSettings.d.ts — mirrors MilkyWaySettings.d.ts
import type { ZoneOfAvoidanceTuning } from './ZoneOfAvoidanceTuning';

export type ZoneOfAvoidanceSettings = {
  enabled: boolean; // the band
  labelEnabled: boolean; // the lettering
} & ZoneOfAvoidanceTuning;

// ZoneOfAvoidanceTuning.d.ts — mirrors MilkyWayTuning.d.ts; grill Q10
import type { Vec3 } from '../math/Vec3';

export type ZoneOfAvoidanceTuning = {
  intensity: number; // additive brightness at full presence
  radialFalloff: number; // rim easing width at the inner/outer radial edges
  edgeSharpness: number; // latitude feather width (edgeBandMask's fade param)
  color: Vec3; // veil tint, linear RGB
};
```

- [ ] Add the two type files above.
- [ ] Add `zoneOfAvoidance: ZoneOfAvoidanceSettings;` to `EngineSettingsState` (`src/@types/settings/EngineSettingsState.d.ts`), immediately after the `milkyWay` field — both are singleton overlays, same shape family.
- [ ] In `src/data/defaults.ts`: add `DEFAULT_ZONE_OF_AVOIDANCE_ENABLED: boolean = true` and `DEFAULT_ZONE_OF_AVOIDANCE_LABEL_ENABLED: boolean = true` — both plain literals (mirror `DEFAULT_ORBIT_TRAILS_ENABLED`'s docblock reasoning, not `DEFAULT_MILKY_WAY_ENABLED`'s registry-derived one; see Task 2's note). Add `DEFAULT_ZONE_OF_AVOIDANCE_TUNING: ZoneOfAvoidanceTuning` as one object literal holding starting values for `intensity`/`radialFalloff`/`edgeSharpness`/`color` — these are explicitly **feel-calls dialled live at the Task 9/11 visual checkpoints and the Task 13 DebugPanel section**, not final numbers; pick anything in a physically reasonable range (a dim warm veil, e.g. a muted amber-ish `Vec3`) so Task 8's checkpoint has something to look at. Do not spend time tuning here.
- [ ] In `src/state/settings/initialState.ts`: add `zoneOfAvoidance: { enabled: DEFAULT_ZONE_OF_AVOIDANCE_ENABLED, labelEnabled: DEFAULT_ZONE_OF_AVOIDANCE_LABEL_ENABLED, ...DEFAULT_ZONE_OF_AVOIDANCE_TUNING },` immediately after the `milkyWay:` block (`initialState.ts:153-157`).
- [ ] In `src/state/settings/settingsSlice.ts`: add three reducers mirroring `setMilkyWayEnabled`/`setMilkyWayLabelEnabled`/`setMilkyWayTuning` (`settingsSlice.ts:169-181`): `setZoneOfAvoidanceEnabled(settings, action: PayloadAction<boolean>)`, `setZoneOfAvoidanceLabelEnabled(settings, action: PayloadAction<boolean>)`, `setZoneOfAvoidanceTuning(settings, action: PayloadAction<Partial<ZoneOfAvoidanceTuning>>)` (the last does `Object.assign(settings.zoneOfAvoidance, action.payload)` — a tuning patch can never flip `enabled`/`labelEnabled` by construction, same reasoning as the milkyWay split).
- [ ] In `src/state/settings/selectors.ts`: add `selectZoneOfAvoidanceEnabled`, `selectZoneOfAvoidanceLabelEnabled`, `selectZoneOfAvoidance` (whole cluster), mirroring `selectMilkyWayEnabled`/`selectMilkyWayLabelEnabled`/`selectMilkyWay` (`selectors.ts:157-169`).
- [ ] `npm run typecheck` clean. `npm test` green (no behaviour change — nothing reads these yet beyond the seed itself; `tests/@types/engineState.test.ts`-style smoke tests, if any exist for cluster presence, should pass without modification since they iterate the type structurally — verify, do not add a new one).
- [ ] Commit.

### Task 5: Selection type-arm cascade

One task by construction (per the spec's Ground-preparation section): the compiler forces every table row once the `SelectionRef`/`FocusableTarget` arm exists, so splitting this across multiple commits would leave intermediate commits red. `ZoneOfAvoidanceInfo` carries **no `x`/`y`/`z`** — resolving the spec's open question: the band has no natural "there" for a Focus button, so the InfoCard simply never wires `CardHeader`'s `onFocus` prop for this arm (Task 6), and nothing downstream ever needs a position for it. `SELECTION_HALO_TABLE` (`src/services/engine/helpers/selectionHaloTable.ts`) is touched too — **not named in the spec's Architecture section, but discovered to be compiler-enforced**: it's a hand-typed object indexed by `row.type`, and TypeScript rejects a widened `SelectionRow['type']` index against an object type that doesn't cover every member. The `zoneOfAvoidance` row returns `null`, mirroring the existing `structure` row (renders no ring; the band has no ring center).

**Files:**
`src/@types/engine/ZoneOfAvoidanceInfo.d.ts` (new), `src/data/zoneOfAvoidance/zoneOfAvoidanceInfo.ts` (new), `tests/data/zoneOfAvoidance/zoneOfAvoidanceInfo.test.ts` (new), `src/@types/engine/SelectionRef.d.ts` (modify), `src/@types/engine/SelectionRow.d.ts` (modify), `src/@types/engine/FocusableTarget.d.ts` (modify), `src/services/engine/helpers/resolvePickTable.ts` (modify), `src/services/engine/helpers/extractSelectionRow.ts` (modify), `src/services/engine/helpers/buildFocusable.ts` (modify), `src/services/engine/helpers/refOf.ts` (modify), `src/services/engine/helpers/targetIdentityKey.ts` (modify), `src/services/url/urlHashFor.ts` (modify), `src/services/engine/helpers/selectionHaloTable.ts` (modify)

**Contract:**

```ts
// ZoneOfAvoidanceInfo.d.ts — 6th (now) FocusableTarget arm, static const like MILKY_WAY_INFO
export type ZoneOfAvoidanceInfo = {
  readonly type: 'zoneOfAvoidance';
  readonly displayName: string; // "Zone of Avoidance"
  readonly description: string; // didactic: dust extinction, why surveys are blind here
  readonly distanceNote: string;
};
```

`zoneOfAvoidanceInfo.ts` exports `ZONE_OF_AVOIDANCE_INFO: ZoneOfAvoidanceInfo`, a static const (mirrors `src/data/milkyWay/milkyWayInfo.ts`). Draft the didactic copy here — it is what the InfoCard (Task 6) reads verbatim:
- `displayName`: `'Zone of Avoidance'`
- `description`: explains that interstellar dust in the Milky Way's disk absorbs and reddens light from anything behind it, so optical and near-infrared surveys (SDSS, 2MRS, GLADE) see essentially nothing in this band — it is an observational artifact of our vantage point inside the Galaxy, not a real gap in the universe.
- `distanceNote`: notes the band spans the full surveyed volume (a few Mpc out to the survey shell), since it's a line-of-sight effect, not a distance-limited one.

- [ ] Add the type + const (above) with the copy drafted in full.
- [ ] Add the test `ZONE_OF_AVOIDANCE_INFO carries the 'zoneOfAvoidance' tag`.
- [ ] Add the test `ZONE_OF_AVOIDANCE_INFO displayName is "Zone of Avoidance"`.
- [ ] Add `| { readonly type: 'zoneOfAvoidance' }` to `SelectionRef` (`SelectionRef.d.ts`, beside the `milkyWay` arm).
- [ ] Add `| { readonly type: 'zoneOfAvoidance' }` to `SelectionRow` (`SelectionRow.d.ts`, beside the `milkyWay` arm).
- [ ] Add `| ZoneOfAvoidanceInfo` to `FocusableTarget` (`FocusableTarget.d.ts`); `FocusableTargetType` widens automatically (it's `FocusableTarget['type']`).
- [ ] `resolvePickTable.ts` (`RESOLVE_PICK`, `Partial<Record<...>>`): add `zoneOfAvoidance: () => ({ type: 'zoneOfAvoidance' }),` mirroring the `milkyWay` row.
- [ ] `extractSelectionRow.ts` (`EXTRACT_ROW`, total mapped type): add `zoneOfAvoidance: () => ({ type: 'zoneOfAvoidance' as const }),`.
- [ ] `buildFocusable.ts` (`BUILD_FOCUSABLE`, total mapped type): import `ZONE_OF_AVOIDANCE_INFO`, add `zoneOfAvoidance: () => ZONE_OF_AVOIDANCE_INFO,`.
- [ ] `refOf.ts` (`REF_OF`, hand-typed total object): add the field declaration `zoneOfAvoidance: (t: ZoneOfAvoidanceInfo) => SelectionRef;` and the row `zoneOfAvoidance: () => ({ type: 'zoneOfAvoidance' }),`.
- [ ] `targetIdentityKey.ts` (`TARGET_IDENTITY_KEY`, total `Record<FocusableTargetType, ...>`): add `zoneOfAvoidance: () => 'zoneOfAvoidance',`.
- [ ] `urlHashFor.ts` (`URL_HASH_FOR`): add `zoneOfAvoidance: () => null,` — **diverges from `milkyWay`'s row body** (which returns the fixed `MILKY_WAY_FOCUS_ID` literal); only the row's *existence* mirrors milkyWay, not its contents. No deep link (spec's Non-goals).
- [ ] `selectionHaloTable.ts`: widen the hand-typed `SELECTION_HALO_TABLE` object's field declarations with `zoneOfAvoidance: (row: { readonly type: 'zoneOfAvoidance' }) => null;` and the row `zoneOfAvoidance: (_row) => null,` — mirrors the `structure` row exactly (no ring; comment why: the band has no point center).
- [ ] `npm test -- zoneOfAvoidanceInfo` green. `npm run typecheck` clean — this is the load-bearing check for this task: every table above must compile, and a missed row surfaces as a `tsc` error, not a runtime failure.
- [ ] Commit (one commit for the whole cascade, per the "one task by construction" note above).

### Task 6: InfoCard components + `DETAIL_CARD` row

**Files:** `src/components/InfoCard/ZoneOfAvoidanceDetailCard/ZoneOfAvoidanceDetailCard.tsx` (new), `src/components/InfoCard/ZoneOfAvoidanceDetailCard/ZoneOfAvoidanceDetailCard.module.css` (new), `src/components/InfoCard/CompactZoneOfAvoidanceCard/CompactZoneOfAvoidanceCard.tsx` (new), `src/components/InfoCard/CompactZoneOfAvoidanceCard/CompactZoneOfAvoidanceCard.module.css` (new), `src/components/InfoCard/detailCardTable.ts` (modify), `tests/components/InfoCard/*` (modify/new — match the existing InfoCard test file layout)

Load the `create-component` skill before writing these — own folder per component, `<Name>.tsx` + `<Name>.module.css`, `function Name() {}` + `export default Name`. Mirror `MilkyWayDetailCard.tsx`/`CompactMilkyWayCard.tsx` (`src/components/InfoCard/MilkyWayDetailCard/`) almost exactly, with two differences: no thumbnail-or-glyph "we're inside it" framing (use a different glyph — e.g. a band/haze icon, a feel-call), and **`CardHeader`'s `onFocus` prop is always `undefined`** (never wired to a target position — `ZoneOfAvoidanceInfo` has none, per Task 5). The "Focus"/"Fly here" pill simply doesn't render for this card, the same way `CardHeader` already omits it whenever `onFocus` is absent.

**Contract:**

```ts
// ZoneOfAvoidanceDetailCard.tsx
export type ZoneOfAvoidanceDetailCardProps = {
  target: ZoneOfAvoidanceInfo;
  pinned?: boolean;
  chrome?: boolean;
  onClose?: () => void;
  // No onFocus — see the note above.
};

// CompactZoneOfAvoidanceCard.tsx
export type CompactZoneOfAvoidanceCardProps = { target: ZoneOfAvoidanceInfo };
```

- [ ] Build `ZoneOfAvoidanceDetailCard` — `CardHeader` (eyebrow e.g. `"Guide Layer"`), `CardRow type="headline"` with `target.displayName`, a glyph in place of a thumbnail, `target.distanceNote`, `DescriptionBlock` with `target.description`.
- [ ] Build `CompactZoneOfAvoidanceCard` — glyph + `target.displayName` + a short line (mirrors `CompactMilkyWayCard`).
- [ ] Add `detailCardTable.ts`'s `zoneOfAvoidance` row: `{ Detail: (props) => target.type !== 'zoneOfAvoidance' ? null : createElement(ZoneOfAvoidanceDetailCard, {...}), Compact: (props) => ... }`, mirroring the `milkyWay` rows (`detailCardTable.ts:100-113`) — `DETAIL_CARD`'s `Record<FocusableTargetType, DetailCardEntry>` type makes a missing row a compile error.
- [ ] Add the test `DETAIL_CARD['zoneOfAvoidance'] resolves to the ZoA detail + compact cards` (table-row assertion).
- [ ] Add the test `InfoCard renders the Zone of Avoidance card for a zoneOfAvoidance selection` asserting the headline + description text appear.
- [ ] Add the test `the Zone of Avoidance card renders no Focus/Fly-here affordance` (regression pinning the no-onFocus decision — this is the one behavior worth a targeted assertion, since a future edit re-adding `onFocus` without a real position would silently produce a dead button).
- [ ] `npm test` (InfoCard suite) green. `npm run typecheck` clean.
- [ ] Commit.

### Task 7: Fades + wake wiring

**Files:** `src/services/engine/presentation/scaleFadeBands.ts` (modify), `src/@types/animation/VisibilityLayerKey.d.ts` (modify), `src/@types/animation/FadeId.d.ts` (modify), `src/@types/animation/LabelLayerId.d.ts` (modify), `src/services/engine/wiring/fadeLayers.ts` (modify), `src/services/engine/presentation/zoneOfAvoidanceLayerOpacity.ts` (new), `tests/services/engine/presentation/zoneOfAvoidanceLayerOpacity.test.ts` (new), `src/services/engine/presentation/focusRecession.ts` (modify — see correction below), `src/services/engine/presentation/fadeIdToVisibilityKey.ts` (modify — see correction below)

**Correction (discovered executing Task 2, see `task-2-report.md`):** widening `LabelLayerId` cascades into two more total-`Record`s not in the spec's original file list — `focusRecession.ts`'s `satisfies Record<LabelLayerId, number | undefined>` and `fadeIdToVisibilityKey.ts`'s `satisfies Record<LabelLayerId, VisibilityLayerKey>` (the latter's new row needs the `'zoneOfAvoidanceLabel'` `VisibilityLayerKey` member this task already adds). `tsc` will surface both as compile errors the moment `LabelLayerId` widens; add the rows then, mirroring the `milkyWay` row in each table.

Band and label are **independent** toggles (spec), so they take **two** `FadeId` shapes, mirroring milkyWay's exact split: the band gets a new singleton kind, the label reuses the existing `labelLayer` kind (widen `LabelLayerId`, do not invent a second new `FadeId` kind for it — `{ kind: 'labelLayer', layer: 'zoneOfAvoidance' }` is a real fade-registry entry regardless of which renderer eventually reads its opacity; it does not require participating in the shared MSDF label-producer pipeline).

**Contract:**

```ts
// FadeId.d.ts — new singleton arm, beside milkyWay/filament/constellations
| { readonly kind: 'zoneOfAvoidance' }

// LabelLayerId.d.ts — new member
| 'zoneOfAvoidance'

// VisibilityLayerKey.d.ts — two new literals
| 'zoneOfAvoidance' | 'zoneOfAvoidanceLabel'

// zoneOfAvoidanceLayerOpacity.ts — mirrors constellationLayerOpacity.ts exactly;
// called TWICE per frame with two different layerFadeOpacity inputs (band's vs
// label's FadeId opacity) so both dissolve on the SAME distance band but can
// still be toggled independently.
export function zoneOfAvoidanceLayerOpacity(camDistMpc: number, layerFadeOpacity: number): number;
```

- [ ] Add the `SCALE_FADE_BANDS.zoneOfAvoidance` row (`scaleFadeBands.ts`, beside `constellations` at line ~192): `{ fullAt: <Mpc, larger — e.g. 8, the Local-Group-scale full-presence edge per grill Q6>, goneAt: <Mpc, smaller — e.g. 0.3, clear of the Milky Way's own rendering> }`. `fullAt > goneAt` is required for the "invisible near Earth, full past the Local Group, no far edge" direction (`fadeBand`'s doc: `fullAt > goneAt` → alpha 1 at/above `fullAt`, 0 at/below `goneAt`). Exact Mpc values are a feel-call for the Task 9 checkpoint.
- [ ] Add the `FadeId`/`LabelLayerId`/`VisibilityLayerKey` members above.
- [ ] Add two `fadeLayers.ts` rows mirroring `milkyWayDisk`/`milkyWayLabel` (`fadeLayers.ts:98-105`, `129-135`): `key: 'zoneOfAvoidance', handle: () => ({ kind: 'zoneOfAvoidance' }), seed: (s) => (s.zoneOfAvoidance.enabled ? 1 : 0), intent: (s) => s.zoneOfAvoidance.enabled` and `key: 'zoneOfAvoidanceLabel', handle: () => ({ kind: 'labelLayer', layer: 'zoneOfAvoidance' }), seed: (s) => (s.zoneOfAvoidance.labelEnabled ? 1 : 0), intent: (s) => s.zoneOfAvoidance.labelEnabled` (both `expand: () => [undefined]`, singleton).
- [ ] Add `zoneOfAvoidanceLayerOpacity(camDistMpc, layerFadeOpacity)` — one function, `fadeBand(SCALE_FADE_BANDS.zoneOfAvoidance, camDistMpc) * layerFadeOpacity`, mirroring `constellationLayerOpacity.ts` verbatim in shape.
- [ ] Add the test `zoneOfAvoidanceLayerOpacity is 0 at camDist 0` (hand-computed: any `layerFadeOpacity`, `camDistMpc` at or below `goneAt` → 0).
- [ ] Add the test `zoneOfAvoidanceLayerOpacity is the product of the distance band and the toggle opacity past fullAt` (hand-computed: at `camDistMpc >= fullAt`, result equals `layerFadeOpacity` exactly).
- [ ] `npm test -- zoneOfAvoidanceLayerOpacity` green. `npm run typecheck` clean (a `FadeId`/`VisibilityLayerKey` widen is additive — nothing should break).
- [ ] Commit.

### Task 8: Renderer + shader — band geometry (visual only, no lettering, no pick)

**Load the `wesl-shaders` skill before touching any `.wesl` file.**

**Files:** `src/services/gpu/shaders/zoneOfAvoidance/io.wesl` (new), `src/services/gpu/shaders/zoneOfAvoidance/vertex.wesl` (new), `src/services/gpu/shaders/zoneOfAvoidance/fragment.wesl` (new), `src/services/gpu/renderers/zoneOfAvoidance/zoneOfAvoidanceRenderer.ts` (new), `src/@types/rendering/ZoneOfAvoidanceRenderer.d.ts` (new), `src/services/engine/frame/passes/zoneOfAvoidanceLayer.ts` (new), `src/services/engine/frame/passes/index.ts` (modify), `src/@types/engine/handles/EngineGpuHandles.d.ts` (modify), `src/services/engine/phases/initGpu.ts` (modify), `src/services/engine/engine.ts` (modify)

**Correction to the spec's Architecture section**: the spec cites the 80-byte `CameraUniforms` prefix + `diskAxes`'s proxy-mesh technique as the renderer's template. Those are the right template for the **lettering** (Task 10 — discrete, world-positioned quads). For the **band** itself, the actual closest precedent in the tree is `horizonShellRenderer`/`horizonShell/{vertex,fragment,io}.wesl`: a 6-vertex fullscreen triangle pair in clip space, no `viewProj` multiply, with the fragment stage reconstructing a world-space view ray from a **camera-basis** uniform (`camForward`/`camRight`/`camUp`/`tanHalfFovY`/`aspect`/`cameraPos`) and solving an analytic ray/shape intersection — because a wedge visible "from every viewpoint" (grill Q1) covering a huge angular extent is a ray-marched shell, not a small proxy mesh. Use `horizonShellRenderer.ts` + its three `.wesl` files as the primary template; `worldToGalactic`, `edgeBandMask`, `ADDITIVE_BLEND`, `applyFade` still apply exactly as the spec describes.

**Byte layout — `Uniforms` (mirrors `horizonShell/io.wesl`'s 64-byte camera-basis block, extended with the wedge's own shape + tuning fields):**

```
offset  0..15  camForward    vec3<f32> + tanHalfFovY f32   (16 B)
offset 16..31  camRight      vec3<f32> + aspect      f32   (16 B)
offset 32..47  camUp         vec3<f32> + <spare>     f32   (16 B)
offset 48..63  cameraPosMpc  vec3<f32> + <spare>     f32   (16 B)
offset 64..79  galX          vec3<f32> + innerRadiusMpc f32 (16 B)  — worldToGalactic basis row 1 (see note)
offset 80..95  galY          vec3<f32> + outerRadiusMpc f32 (16 B)  — basis row 2
offset 96..111 galZ          vec3<f32> + bulgeDeg      f32 (16 B)  — basis row 3
offset112..127 color         vec3<f32> + anticenterDeg f32 (16 B)
offset128..143 <tuning>      intensity f32, radialFalloff f32, edgeSharpness f32, fadeAlpha f32 (16 B)
total: 144 bytes
```

Note: `worldToGalactic`'s `GAL_X_EQ`/`GAL_Y_EQ`/`GAL_Z_EQ` are shader-side **constants** (`lib/util.wesl:207-209`) — they do NOT need to ride the uniform buffer at all; drop the `galX`/`galY`/`galZ` rows above and import `worldToGalactic` directly from `lib/util.wesl` (per its existing contract — never re-derive the rotation). Recompute the byte table once that simplification is applied; it will land under 128 bytes. This note exists so the executor doesn't cargo-cult a redundant basis into the uniform.

- [ ] Write `zoneOfAvoidance/io.wesl`: the (corrected, no redundant galactic basis) `Uniforms` struct + `VsOut { @builtin(position) clipPos, @location(0) ndc }` (mirrors `horizonShell/io.wesl`'s `VsOut` exactly).
- [ ] Write `zoneOfAvoidance/vertex.wesl`: fullscreen triangle-pair, verbatim technique from `horizonShell/vertex.wesl`.
- [ ] Write `zoneOfAvoidance/fragment.wesl`: reconstruct the world-space ray from the camera basis (`horizonShell/fragment.wesl`'s pattern); find the ray's intersection with the outer-radius sphere and the inner-radius sphere (two ray-sphere solves, or one analytic annulus test — implementer's choice); on a miss (ray never enters `[innerRadiusMpc, outerRadiusMpc]`), `discard`. At the hit, convert the hit point to galactic coordinates via `worldToGalactic` (`package::lib::util::worldToGalactic`), compute `ℓ = atan2(galactic.y, galactic.x)` and `b = asin(galactic.z / length(galactic))`, compute `bLimitDeg` via the WGSL port of Task 3's formula (`anticenterDeg + (bulgeDeg - anticenterDeg) * (0.5 + 0.5*cos(ℓ))` — inline it; a shared lib fn is only worth extracting once Task 10's lettering also needs it, per `lib/util.wesl`'s promotion-on-second-consumer convention), and `discard` if `abs(degrees(b)) > bLimitDeg`. Shade the survivor: `edgeBandMask` (`package::lib::masks::edgeBandMask`, `edgeSharpness` as the fade param) softens the latitude edge; a radial falloff (`radialFalloff`) softens the inner/outer rim; multiply by `intensity`, `color`, and `applyFade(1.0, fadeAlpha)` (`package::lib::fadeUniforms::applyFade`); return the additive `vec4<f32>`.
- [ ] Write `zoneOfAvoidanceRenderer.ts` — `createZoneOfAvoidanceRenderer(device, targetFormat): ZoneOfAvoidanceRenderer`, one pipeline (`ADDITIVE_BLEND`, no depth test — mirrors `horizonShellRenderer`'s pipeline exactly), a `draw(pass, cam, viewportPx, tuning: ZoneOfAvoidanceTuning, innerRadiusMpc, outerRadiusMpc, bulgeDeg, anticenterDeg, fadeAlpha)` method computing the camera-basis uniform CPU-side (same math `horizonShellRenderer.draw` already does) and one `destroy()`. **Contract** (`ZoneOfAvoidanceRenderer.d.ts`): `{ readonly label: string } & Renderer` extended with the `draw` signature above — `drawLabels`/`drawPick` are added by Tasks 10/12, not stubbed here.
- [ ] Write `zoneOfAvoidanceLayer.ts` (`ContentLayer`): `name: 'zone-of-avoidance'`, `slab: COSMO`, `target: 'hdr'`, `blend: 'additive'`. `enabled(state, ctx)`: `state.gpu.zoneOfAvoidanceRenderer !== null && zoneOfAvoidanceLayerOpacity(camDistMpc, resolveLayerOpacity(state.subsystems.fades, { kind: 'zoneOfAvoidance' }, ctx.focusBlend, ctx.nowMs, state.subsystems.clipPlayer)) > 0` (mirrors `filamentsLayer`'s settings-toggle + fade-registry-opacity shape, composed through the Task 7 helper — NOT `horizonShellLayer`'s bespoke-function shape, which has no settings toggle at all). `draw(...)`: compute the same opacity, pass it + the tuning cluster + placeholder inner/outer radii + bulge/anticenter constants into `renderer.draw(...)`.
- [ ] Add `zoneOfAvoidanceLayer` to `CONTENT_LAYERS` (`passes/index.ts`) in the COSMO/hdr/additive group, beside `filamentsLayer`/`horizonShellLayer`, plus its named re-export.
- [ ] Add `zoneOfAvoidanceRenderer: ZoneOfAvoidanceRenderer | null;` to `EngineGpuHandles.d.ts`.
- [ ] Construct it in `initGpu.ts` alongside `createFilamentRenderer`/`createHorizonShellRenderer`, assign to `state.gpu.zoneOfAvoidanceRenderer`.
- [ ] Teardown in `engine.ts`, mirroring the `filamentRenderer` pattern exactly (`engine.ts:852-853`): `state.gpu.zoneOfAvoidanceRenderer?.destroy(); state.gpu.zoneOfAvoidanceRenderer = null;`.
- [ ] No test for the shader maths (standing refusal — GPU-only, unreachable without a real device; see `docs/superpowers/conventions/testing.md`). `npm run typecheck` clean. `npm run build`.
- [ ] **Visual acceptance**: dev server running (start it if not already — do not kill an existing one), `settings.zoneOfAvoidance.enabled` is true by default, fly out to a few tens of Mpc. Confirm: a translucent additive band appears along the galactic plane (not the ecliptic or equatorial plane — spot-check against the Milky Way disk's own orientation, which is already correctly aligned), widest near the galactic center direction, narrowest near the anticenter, soft-edged, fading out as the camera approaches Earth. Zero `Invalid ShaderModule`/`Invalid RenderPipeline` console lines.
- [ ] Commit.

### Task 9: VISUAL CHECKPOINT — band

**Files:** none.

**STOP. Ask the user to look at the running dev server.** Do not screenshot-verify or self-assess — this is the user's call, per the house convention that the dev server is the user's to look at. Ask them to confirm: the band's galactic orientation reads correctly from a few different camera positions/distances (including from outside the Local Group, per grill Q1 — the whole reason for the radially-extruded-wedge shape over a sky backdrop), the additive veil look is in the right neighborhood (grill Q3 — soft, not garish), and the distance fade feels right (invisible near Earth, present at survey scale). Record any requested tuning-constant changes (`DEFAULT_ZONE_OF_AVOIDANCE_TUNING`, the `SCALE_FADE_BANDS.zoneOfAvoidance` edges, `innerRadiusMpc`/`outerRadiusMpc`/`bulgeDeg`/`anticenterDeg`) and apply them before proceeding — this checkpoint blocks Task 10.

- [ ] User has looked and approved (or requested + received adjustments).

### Task 10: Curved-text mechanism

**Load the `wesl-shaders` skill before touching any `.wesl` file.**

**Files:** `src/services/gpu/shaders/zoneOfAvoidance/label/io.wesl` (new), `src/services/gpu/shaders/zoneOfAvoidance/label/vertex.wesl` (new), `src/services/gpu/shaders/zoneOfAvoidance/label/fragment.wesl` (new), `src/services/gpu/renderers/zoneOfAvoidance/zoneOfAvoidanceRenderer.ts` (modify), `src/data/zoneOfAvoidance/zoneOfAvoidanceLabelText.ts` (new)

Unlike the band (a fullscreen ray-march), the lettering is discrete world-positioned geometry — this is where the spec's `diskAxes`/`texturedDisks` precedent and the standard 80-byte `CameraUniforms` prefix (`camera.wesl` + `writeCameraPrefix`) actually apply. Reuse `layoutLabel` (`src/services/gpu/labelLayout/labelLayout.ts`) unchanged for the pen-space glyph layout of `"ZONE OF AVOIDANCE"`, repeated 2–3× (grill Q5) at evenly-spaced galactic longitudes. The new mechanism is a `bandAxes`-style helper — a per-arc-position world-space tangent/normal basis, analogous to `diskAxes` (`lib/orientation.wesl:123`) but parameterized by galactic longitude instead of a disk's position-angle/inclination — that maps `layoutLabel`'s pen-space X to an arc position (`arcAngleRad = penX / labelRadiusMpc`) and pen-space Y to a small latitude offset, placing each glyph as a world-oriented quad (no billboarding, no camera read in the placement math — mirrors `diskAxes`'s explicit no-camera-parameter contract).

**Known risk (spec, flagged explicitly for this task): flat glyph quads chord the arc** — deviation ~`w²/8R` (glyph width `w`, arc radius `R`), sub-percent at expected proportions but worth eyeballing at whatever size the checkpoint converges on. Do not pre-emptively subdivide glyph quads into strips — that is Escalation Rung 1 from the spec, applied only if Task 11's checkpoint actually shows visible chording.

**Contract:**

```wesl
// package::zoneOfAvoidance::label::io — VsOut mirrors labels/io.wesl's shape
// (localOffset/localSize/uvRect glyph-instance fields unchanged; only the
// vertex STAGE that consumes them differs — see vertex.wesl below)

// bandAxes-style helper (WGSL, likely added to lib/orientation.wesl once it
// has a second consumer, or kept local to this module if it stays
// single-consumer — implementer's call per the promotion-on-second-consumer
// convention lib/util.wesl documents):
struct BandAxes { tangent: vec3<f32>, normal: vec3<f32> };
fn bandAxes(galacticLonRad: f32) -> BandAxes;
```

```ts
// zoneOfAvoidanceLabelText.ts
export const ZONE_OF_AVOIDANCE_LABEL_TEXT = 'ZONE OF AVOIDANCE';
export const ZONE_OF_AVOIDANCE_LABEL_REPEAT_COUNT = 3; // grill Q5: 2–3, pick 3 for even bulge/anticenter coverage
```

- [ ] Write `label/io.wesl` + `label/vertex.wesl` + `label/fragment.wesl` — the vertex stage calls `layoutLabel`'s CPU-built glyph-instance buffer (built ONCE at construction, per the spec's "static content ⇒ one instanced draw, not rebuilt per frame" note — `layoutLabel` itself is a CPU/TS call inside `zoneOfAvoidanceRenderer.ts`'s constructor, not a WGSL function), places each glyph's world position via `bandAxes` + `worldToClip` (the `texturedDisks/vertex.wesl:109`-style `world = center + (tangent * localCorner.x + normal * localCorner.y) * halfSize` shape), and the fragment stage samples the shared MSDF atlas (bind the SAME `state.gpu.fontAtlases` texture/sampler `labelRenderer.ts` uses — construct alongside it in `initGpu.ts`, after the `loadFontAtlases()` call at `initGpu.ts:205`, not a second atlas load).
- [ ] Extend `zoneOfAvoidanceRenderer.ts` with `drawLabels(pass, cam, viewportPx, labelRadiusMpc, fadeAlpha)` — builds the glyph-instance buffer once (constructor-time `layoutLabel(ZONE_OF_AVOIDANCE_LABEL_TEXT, ...)` call, repeated at `ZONE_OF_AVOIDANCE_LABEL_REPEAT_COUNT` evenly-spaced longitudes), issues one instanced draw per frame thereafter.
- [ ] Wire `drawLabels` into `zoneOfAvoidanceLayer.draw`, gated by `state.settings.zoneOfAvoidance.labelEnabled` and the label's own `zoneOfAvoidanceLayerOpacity` call (Task 7's helper, with `{ kind: 'labelLayer', layer: 'zoneOfAvoidance' }`'s opacity as the second argument — the SAME distance band as the geometry, per the spec's lock-step requirement).
- [ ] No test for the shader maths (standing refusal). `npm run typecheck` clean.
- [ ] **Visual acceptance**: with `labelEnabled` true, fly around the band at a distance where it's fully faded in. Confirm the lettering is legible, correctly world-oriented (readable when the camera is roughly in the galactic plane, not upside-down or mirrored), visible from at least 2 of the 3 repeat positions from any single vantage point, and fades with the band. Console clean.
- [ ] Commit.

### Task 11: VISUAL CHECKPOINT — lettering

**Files:** none.

**STOP. Ask the user to look at the running dev server**, specifically the lettering. This is the spec's explicitly flagged risk (flat-glyph-chording) — do not skip or abbreviate this checkpoint. Ask the user to zoom in on the lettering at whatever size it renders at and confirm the glyphs read as smoothly following the band's curve, not visibly faceted/chorded. If chording IS visible: escalate per the spec's rungs — first subdivide glyph quads into vertical strips along the arc (same vertex path, more segments), and only if that's insufficient, the band-space rendering fallback (draw a curved band-segment mesh, map fragments through arc-angle/height → pen-space → atlas UV). Neither escalation changes the `layoutLabel` CPU-side reuse. This checkpoint blocks Tasks 12–14.

- [ ] User has looked and approved (or an escalation rung was applied and re-checked).

### Task 12: Analytic pick

**Load the `wesl-shaders` skill before touching any `.wesl` file.**

**Files:** `src/services/gpu/shaders/zoneOfAvoidance/fragmentPick.wesl` (new), `src/services/gpu/renderers/zoneOfAvoidance/zoneOfAvoidanceRenderer.ts` (modify), `src/services/engine/frame/passes/zoneOfAvoidanceLayer.ts` (modify), `tests/services/gpu/renderers/zoneOfAvoidance/zoneOfAvoidanceRenderer.test.ts` (new — null-device construction smoke, mirroring how other renderer tests exercise the null-device path)

**Correction to the spec's Architecture section**: the spec cites `bodyPickRenderer.ts`/`drawFlooredSpherePick.ts` as "the CPU-side precedent for wiring an analytic-primitive pick draw," and describes threading a new provider into `pickRenderer.ts`'s `recordPickPass`. That wiring model predates the current architecture. Today, `pickProgram.ts` (`pickProgram.ts:236`) auto-discovers **any `ContentLayer` that declares a `drawPick` method** and filters by `(l.pickEnabled ?? l.enabled)(state, ctx)` — see `structureMarkersLayer.ts`'s `drawPick` for the current, much simpler precedent: **no separate pick-renderer registration, no `pickRenderer.ts` edit at all.** `spherePick.wesl`/`analyticSphere.wesl` remain the right precedent for the **shader technique** (analytic ray intersection, discard-on-miss, `@builtin(frag_depth)` from the hit point) — just not for the CPU wiring.

Per-type-fragments convention: `fragmentPick.wesl` is a NEW fragment entry point sharing `zoneOfAvoidance/vertex.wesl` and `zoneOfAvoidance/io.wesl` from Task 8 — do not duplicate the vertex stage.

**Contract** (pick fragment output, mirrors `spherePick.wesl`'s `fsPick`):

```wesl
struct PickFSOut {
  @location(0) id: vec4<u32>,
  @builtin(frag_depth) depth: f32,
};
```

`fsPick` reuses the SAME ray-march + `worldToGalactic` + `bLimitDeg` discard logic as `fragment.wesl` (Task 8) — a fragment outside the wedge or beyond the current fade's effective opacity `discard`s (mirrors `ringPick.wesl:86-94`'s `if (in.alpha <= 0.0) { discard; }` shape: compute the same shading alpha the visual fragment would emit, discard if it's ≤ 0). On a hit, emit `vec4<u32>(packedId, 0u, 0u, 0u)` where `packedId = packSelection(Source.ZoneOfAvoidance, 0) + PICK_SENTINEL_OFFSET` (singleton — `localIdx` is always 0, mirroring the milkyWay pick's `Source.MilkyWay, 0` shape) computed CPU-side once at construction and passed as a uniform (not per-fragment), and `depth` from the hit point transformed through the **standard `CameraUniforms.viewProj`** (bound at `@group(0)` by the pick program, per the pre-bound-by-caller contract every COSMO pick shader shares) — NOT the camera-basis uniform Task 8's visual fragment uses, which has no `viewProj` to derive a depth from. This means `fragmentPick.wesl` binds `@group(0)` = standard `CameraUniforms` (used only for the depth transform) AND its own `@group(1)` = the Task 8 camera-basis + wedge-shape uniform (used for the ray reconstruction) — two different uniform blocks doing two different jobs, both legitimately present.

- [ ] Write `fragmentPick.wesl` per the contract above.
- [ ] Extend `zoneOfAvoidanceRenderer.ts` with `drawPick(pass)` — binds its own `@group(1)` (unchanged from `draw`) plus whatever the pick pipeline needs beyond the caller-bound `@group(0)`; issues the same fullscreen-quad draw against the pick pipeline (`ADDITIVE_BLEND` does not apply here — the pick target is `r32uint`, no blend).
- [ ] Add `drawPick` and (only if the pick visibility set ever needs to differ from the draw visibility set — it doesn't here, per the opacity-0 house rule) skip `pickEnabled` to `zoneOfAvoidanceLayer.ts`; `pickProgram.ts` falls back to `enabled` when `pickEnabled` is absent.
- [ ] Add the test `zoneOfAvoidanceRenderer constructs under a null device` (mirrors the null-device assertions other renderer tests use) and `satisfies the Renderer label contract` (`renderer.label === 'zoneOfAvoidanceRenderer'`).
- [ ] `npm test -- zoneOfAvoidanceRenderer` green. `npm run typecheck` clean.
- [ ] **Visual acceptance** (debug pick view or direct click): with the band visible, click on it and confirm the InfoCard opens with the Zone of Avoidance card (Task 6). Click well outside the band (e.g. near the anticenter, above `bLimitDeg`) and confirm nothing is picked. Fade the band out (fly close to Earth) and confirm clicking where it used to be no longer picks it. Console clean.
- [ ] Commit.

### Task 13: DebugPanel tuning section

**Files:** `src/@types/data/zoneOfAvoidance/ZoneOfAvoidanceSliderKey.d.ts` (new), `src/@types/data/zoneOfAvoidance/ZoneOfAvoidanceSliderField.d.ts` (new), `src/data/zoneOfAvoidance/zoneOfAvoidanceSliderFields.ts` (new), `tests/data/zoneOfAvoidance/zoneOfAvoidanceSliderFields.test.ts` (new), `src/components/DebugPanel/ZoneOfAvoidanceTuningSection.tsx` (new), `src/components/containers/ZoneOfAvoidanceTuningSectionContainer.tsx` (new), `src/components/DebugPanel/DebugPanel.tsx` (modify)

Mirrors the `MilkyWaySliderKey`/`MilkyWaySliderField`/`MILKY_WAY_SLIDER_FIELDS`/`MilkyWayTuningSection`/`MilkyWayTuningSectionContainer` quintet exactly, scoped to the **3 scalar knobs only** (`intensity`, `radialFalloff`, `edgeSharpness`) — `color` (a `Vec3`) is not a `MilkyWaySliderField`-shaped row.

**Contract:**

```ts
// ZoneOfAvoidanceSliderKey.d.ts
export type ZoneOfAvoidanceSliderKey = Exclude<keyof ZoneOfAvoidanceTuning, 'color'>;

// ZoneOfAvoidanceSliderField.d.ts — identical shape to MilkyWaySliderField
export type ZoneOfAvoidanceSliderField = {
  key: ZoneOfAvoidanceSliderKey;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  title?: string;
};
```

- [ ] Add the two type files.
- [ ] Add `ZONE_OF_AVOIDANCE_SLIDER_FIELDS: readonly ZoneOfAvoidanceSliderField[]` (3 rows — `intensity`, `radialFalloff`, `edgeSharpness`) and `zoneOfAvoidanceSliderPatch(key, value): Partial<ZoneOfAvoidanceTuning>`, mirroring `milkyWaySliderFields.ts`'s shape. Ranges/steps are feel-calls; span each field's `DEFAULT_ZONE_OF_AVOIDANCE_TUNING` value (the parity test below enforces this).
- [ ] Add the parity test suite mirroring `tests/data/milkyWay/milkyWaySliderFields.test.ts`: `covers exactly the scalar keys of ZoneOfAvoidanceTuning` (i.e. `keyof ZoneOfAvoidanceTuning` minus `'color'`), `declares no duplicate keys`, `every slider spans its default with a positive step`.
- [ ] Add `ZoneOfAvoidanceTuningSection.tsx` — mirrors `MilkyWayTuningSection.tsx`: iterates `ZONE_OF_AVOIDANCE_SLIDER_FIELDS` through `DebugSlider`, PLUS a bespoke `color` control. Pick whichever is simpler to wire against `DebugSlider`'s numeric-only props — three linear-RGB `DebugSlider` rows (0–1 each) is the lower-effort default; a native `<input type="color">` with an sRGB↔linear conversion is the alternative if the three-slider UX reads poorly at the checkpoint. This is explicitly a feel-call (grill Q10), not a contract — do not block on it. Skip the `MilkyWayTuningSection`'s `CopyButton`/`formatMilkyWayTuningDefaults` diff mirror for this task (the `color` tuple complicates the diff formatter for marginal value at this scope); note it as a deferred nicety if wanted later, not a gap to fix now.
- [ ] Add `ZoneOfAvoidanceTuningSectionContainer.tsx` — mirrors `MilkyWayTuningSectionContainer.tsx`: `selectZoneOfAvoidance` (whole cluster) + `dispatch(setZoneOfAvoidanceTuning(patch))`.
- [ ] Mount `<ZoneOfAvoidanceTuningSectionContainer />` in `DebugPanel.tsx`, beside `<MilkyWayTuningSectionContainer />`.
- [ ] `npm test -- zoneOfAvoidanceSliderFields` green. `npm run typecheck` clean.
- [ ] Commit.

### Task 14: SettingsPanel row

**Files:** `src/@types/data/LabelBearingSourceType.d.ts` (modify), `src/@types/settings/LabelHomes.d.ts` (modify), `src/data/labels/labelHomeBySourceType.ts` (modify), `src/components/containers/LabelsAndGuidesSectionContainer.tsx` (modify), `src/data/sources/zone-of-avoidance.ts` (modify — see correction below)

**Correction (discovered executing Task 2, see `task-2-report.md`):** Task 2's `ZONE_OF_AVOIDANCE_ENTRY` does NOT carry `bearsLabel: true` yet — setting it there broke `npm run typecheck` via total-`Record` gates this task's own edits close (`LabelBearingSourceType` → `labelHomeBySourceType.ts`'s `LABEL_HOME_BY_SOURCE_TYPE`, which needs `setZoneOfAvoidanceLabelEnabled` from Task 4). This task must flip `zone-of-avoidance.ts`'s row to `bearsLabel: true` and add `labelLayer: 'zoneOfAvoidance'`, `detailLabel`, `shortLabel`, `plural` (the values Task 2's brief originally specified) as part of closing this table, not just add the `LabelBearingSourceType` member in isolation.

The band's `enabled` toggle is a hand-authored `SectionRow` (like `toggle-constellations`/`toggle-orbit-trails`, `LabelsAndGuidesSectionContainer.tsx:144-155`) — a flat singleton toggle outside the registry-driven label machinery. `labelEnabled` folds INTO that machinery: once this task flips `bearsLabel: true` on the registry row (see correction above), `LABEL_CATEGORIES`/`CATEGORY_DISPLAY_INFO`/`SOURCE_TYPE_BY_LABEL_CATEGORY` pick up `zoneOfAvoidance` for free (they're derived from `SOURCE_ENTRIES.filter(bearsLabel)`); this task then only needs to give it a `LabelHome`.

- [ ] Add `'zoneOfAvoidance'` to `LabelBearingSourceType` (`LabelBearingSourceType.d.ts`).
- [ ] Add `readonly zoneOfAvoidanceLabelEnabled: boolean;` to `LabelHomes` (`LabelHomes.d.ts`).
- [ ] Add the `zoneOfAvoidance` row to `LABEL_HOME_BY_SOURCE_TYPE` (`labelHomeBySourceType.ts`), mirroring the `milkyWay` row exactly: `{ read: (homes) => homes.zoneOfAvoidanceLabelEnabled, write: (_id, enabled) => setZoneOfAvoidanceLabelEnabled(enabled) }`.
- [ ] In `LabelsAndGuidesSectionContainer.tsx`: select `selectZoneOfAvoidanceLabelEnabled`, add `zoneOfAvoidanceLabelEnabled` to the `labelHomes` `useMemo` bundle and its dep array; add the band's `enabled` hand-authored row (`{ id: 'toggle-zone-of-avoidance', label: 'Zone of Avoidance', enabled: zoneOfAvoidanceEnabled, onChange: onToggleZoneOfAvoidance }`, its own `useAppSelector(selectZoneOfAvoidanceEnabled)` + `useCallback` dispatching `setZoneOfAvoidanceEnabled`), added to the `rows` array + its dep array. The `labelEnabled` row for the "Zone of Avoidance" category now appears automatically via the `LABEL_CATEGORIES.map(...)` spread — no separate hand-authored row for it.
- [ ] `npm test` (settings container / label suites) green. `npm run typecheck` clean.
- [ ] **Visual acceptance**: open the SettingsPanel's Labels & Guides section, confirm a "Zone of Avoidance" band toggle and a "Zone of Avoidance" label toggle both appear and each independently shows/hides the band vs. the lettering.
- [ ] Commit.

### Task 15: Final visual pass + entanglement-radar + verification

**Files:** none (review).

- [ ] `npm test` (full suite green), `npm run typecheck` (both `src` and `tools` tsconfigs), `npm run build`.
- [ ] `npm run format` on touched files only.
- [ ] Run the `entanglement-radar` skill over the whole branch diff. Pay attention to: **the `bLimitDeg` formula has exactly one TS home (Task 3) and one WGSL home (Task 8's `fragment.wesl`, reused by Task 12's `fragmentPick.wesl`)** — not re-derived a third time; **`zoneOfAvoidanceLayerOpacity` is the one home for the distance-band × toggle-opacity product**, called twice (band, label) rather than two near-duplicate functions; **no second branch on the same discriminant** anywhere the type-arm cascade (Task 5) touches; **the two "correction to the spec" notes (Tasks 8, 12) are reflected in the actual code, not just this plan** — the renderer genuinely uses the camera-basis technique and the `ContentLayer.drawPick` wiring, not the proxy-mesh/separate-pick-renderer shapes the spec's prose describes.
- [ ] Address findings or record why deferred; keep the suite green.
- [ ] **Manual smoke test** (dev server, real data — ask the user to look): toggle the band off/on, toggle the lettering off/on independently, fly from Earth out past the Local Group and confirm the fade-in, fly to the far survey edge and confirm no far-edge pop, click the band and confirm the InfoCard + didactic copy, open the DebugPanel and confirm the 4 tuning knobs move the live band.
- [ ] Confirm the Definition of Done below, then run `/feature-done` before merge — it sweeps the backlog (already handled in Task 1, so this should be a no-op check) and relocates the spec + plan into `specs/completed/` + `plans/completed/`.

---

## Definition of Done

- [ ] **Deliverable inventory**: `Source.ZoneOfAvoidance` registry row; `settings.zoneOfAvoidance.{enabled, labelEnabled, intensity, radialFalloff, edgeSharpness, color}`; the full selection type-arm cascade (`SelectionRef`/`SelectionRow`/`FocusableTarget` arms + all 8 dispatch-table rows); `ZoneOfAvoidanceDetailCard`/`CompactZoneOfAvoidanceCard`; the `zoneOfAvoidance` `ContentLayer` (band + lettering + pick); the DebugPanel tuning section; the SettingsPanel band + label toggles.
- [ ] **Named observable behaviours** (manual smoke pass): band renders additively along the galactic plane with the correct bulge/anticenter width variation; band fades in past the Local Group and stays present at survey scale with no far-edge pop; lettering repeats 2–3× around the band and fades in lock-step with (but independently toggleable from) the band; clicking the band opens the InfoCard with the didactic copy; clicking outside the band (or on a fully-faded band) does not pick it; the DebugPanel's 4 tuning knobs move the live band; the SettingsPanel's two Labels & Guides rows independently toggle band vs. lettering.
- [ ] **The deferral boundary**: no Planck/SFD extinction data pipeline (analytic only, per grill Q2); no tour integration; no URL-hash deep link for the band (`URL_HASH_FOR['zoneOfAvoidance']` returns `null`); no Focus/"Fly here" affordance on the InfoCard (no natural anchor point); the `color` tuning knob's exact DebugPanel control shape (three sliders vs. a color picker) and the `CopyButton`/diff-formatter mirror for the tuning section are both explicitly deferred nice-to-haves, not gaps.
