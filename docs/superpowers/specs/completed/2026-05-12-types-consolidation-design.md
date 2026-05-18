# Types Consolidation Design

**Status:** Draft, awaiting user review
**Date:** 2026-05-12
**Author:** Alexander Rulkens (with Claude)

## Problem

Type aliases are scattered across the codebase. `src/@types/` already holds 41
files (engine state, handles, camera, data, GPU primitives, math), but ~172
additional `export type` declarations live in ~100 files outside it. Some are
purely cross-module shared vocabulary (`LoadState`, `Pass`, `AssetSlot`); others
are domain-data shapes co-located with runtime constants (`BandLabels`,
`BiasMode`, `SettingsDescriptor`); and a few are renderer-internal instance
layouts (e.g., `GlyphQuad`, vertex shapes). The split is historical, not
principled.

The result: discovering "where is the type for X?" requires either knowing the
file or grepping. Refactors that touch a domain (e.g., loading) require editing
both the runtime file and any type it exports, in disparate places.

## Goal

Consolidate every type alias used at module scope into `src/@types/`, organized
in domain-driven subfolders so the directory listing reads as the data model of
the app. One file, one type.

## Non-goals

- Do **not** move component prop types (`{ComponentName}Props`). They stay in
  the component's `.tsx` file alongside the component.
- Do **not** move types declared in a component file (`.tsx`) that are
  consumed only by sibling files in the same component folder. The component
  folder is an exception zone — types that don't escape it stay co-located.
  Example: a type declared in `InfoCard.tsx` and imported only by
  `CompactCard.tsx`, `FullCard.tsx`, and `Thumbnail.tsx` (all in
  `components/InfoCard/`) stays put. The moment a consumer outside
  `components/InfoCard/` imports it, it moves to `@types/`.
- Do **not** move types that are private to a single file (declared as `type`
  without `export`, or used only within their declaring module's internals).
- Do **not** refactor any runtime code beyond what's needed to extract a type.
  Constants, classes, and functions stay where they are.
- Do **not** introduce a barrel. Imports are always deep.
- Do **not** introduce a tsconfig path alias for `@types/`. Imports use
  relative paths throughout, matching the rest of the codebase.

## Scope: what moves

A type alias moves to `src/@types/` if **all** of these are true:

1. It is declared with `export type` (or `export interface` — but the project
   convention is `type`, so this is rare).
2. It lives at module scope, not inside a function or class body.
3. It is not a `{ComponentName}Props` type.
4. If it is declared in a `.tsx` file, at least one consumer outside its
   component folder imports it. Types consumed only by sibling components in
   the same folder stay put.

That is: every non-prop, non-file-local, non-component-folder-local exported
type alias moves. Estimated count: ~150 files after the move (41 existing +
~110 new).

Types declared as `export type X = ...` immediately above the only file that
uses them — e.g., a renderer's private instance shape — also move, on the
principle that the move is mechanical and consistent: "every exported type
alias has exactly one canonical home in `@types/`." If a type is genuinely
private, drop the `export`.

## Taxonomy

```
src/@types/
  data/
    PointCloud.d.ts
    FilamentCloud.d.ts
    ScalarCube.d.ts
    Tier.d.ts
    LodMode.d.ts
    GalaxyTypeInfo.d.ts
    BandLabels.d.ts
    BiasMode.d.ts
    ColourIndex.d.ts
    SurveyFluxLimit.d.ts
    ToneMapCurve.d.ts
    SyntheticScalarField.d.ts
    VolumeFieldDefaults.d.ts
    CloudSource.d.ts
    ClusterAnchor.d.ts
    ...
  engine/
    EngineHandle.d.ts
    EngineState.d.ts
    EngineStatus.d.ts
    EngineCallbacks.d.ts
    state/
      EngineSettingsState.d.ts
      EngineBiasState.d.ts
      EngineSourceState.d.ts
      EnginePickingState.d.ts
    handles/
      EngineCameraHandle.d.ts
      EnginePointsHandle.d.ts
      EngineSourcesHandle.d.ts
      EngineSettingsHandle.d.ts
      EngineSelectionHandle.d.ts
      EngineThumbnailsHandle.d.ts
      EngineFilamentsHandle.d.ts
      EngineMilkyWayHandle.d.ts
      EngineTonemapHandle.d.ts
      EngineVolumesHandle.d.ts
      EngineBiasHandle.d.ts
      EngineInputHandle.d.ts
      EngineSpaceMouseHandle.d.ts
      EngineGpuHandles.d.ts
      EngineSubsystemHandles.d.ts
    frame/
      Pass.d.ts
      PassDeps.d.ts
      FrameContext.d.ts
    subsystems/
      (subsystem-specific types: LabelProducer, PoiSnapshot, etc.)
    wiring/
      PointSourceRegistry.d.ts
      SettingsCallbackSeed.d.ts
  rendering/
    GpuContext.d.ts
    Renderer.d.ts
    Destroyable.d.ts
    ThumbnailInstance.d.ts
    ProceduralDiskInstance.d.ts
    GlyphQuad.d.ts
    LabelAlign.d.ts
    PostProcessConfig.d.ts
    (instance/vertex shapes for each renderer)
  loading/
    LoadState.d.ts
    LoadEvent.d.ts
    AssetSlot.d.ts
    Fetcher.d.ts
    Committer.d.ts
    RetryPolicy.d.ts
    RetryDecision.d.ts
    SlotFactory.d.ts
  camera/
    OrbitCamera.d.ts
    OrbitCameraInit.d.ts
    CameraTween.d.ts
    FocusTarget.d.ts
    FocusUrl.d.ts
  input/
    MousePos.d.ts
    SpaceMouseAxes.d.ts
    SpaceMouseBindings.d.ts
  settings/
    SettingsTableKey.d.ts
    SettingsDescriptor.d.ts
  math/
    Vec.d.ts
    Mat.d.ts
  index.d.ts   (DELETED — see "no barrel" below)
  wesl.d.ts    (kept at root — ambient module declaration, not a domain type)
```

Final subfolder list is fixed: `data/`, `engine/`, `rendering/`, `loading/`,
`camera/`, `input/`, `settings/`, `math/`. The `engine/` folder has internal
sub-grouping (`state/`, `handles/`, `frame/`, `subsystems/`, `wiring/`) because
otherwise it would hold 30+ files at one level.

When a type doesn't fit cleanly, prefer the **consumer** domain over the
**producer**. Example: `BandLabels` is defined in `src/data/sources.ts` but
describes data shape used by the engine and UI; it goes in `data/` because the
type describes data, not because of where the constant is declared.

## File format

- Extension: `.d.ts`. Matches the existing convention in `src/@types/`.
- One `export type` per file. The filename is the type name (PascalCase),
  matching what's already in `src/@types/` today.
- A short module-header comment explaining the type's role is encouraged
  (consistent with the project's didactic-comment convention), but not
  required when the type name is self-explanatory.
- If a type references another type from `@types/`, it imports via
  relative path: `import type { Vec3 } from '../math/Vec';`.

## No barrel

The root `src/@types/index.d.ts` is **deleted**. All consumers do deep imports:

```ts
// Before:
import type { PointCloud, Tier } from '../@types';

// After:
import type { PointCloud } from '../@types/data/PointCloud';
import type { Tier } from '../@types/data/Tier';
```

Rationale: explicit dependencies, no chance of circular-type-import edge cases
or accidental "everything depends on everything via the barrel", and the import
line itself documents which subsystem a type belongs to.

### Import paths are relative

No tsconfig path alias. Imports use relative paths matching the rest of the
codebase. From `src/services/gpu/renderers/pointRenderer.ts`:

```ts
import type { PointCloud } from '../../../@types/data/PointCloud';
```

Verbose, but consistent with every other import in the project.

## Migration strategy

One PR per domain. Order chosen so each PR's churn is localized and the harder
ones come after the easier ones have validated the workflow.

1. **Foundation: `math/`, `data/`** — smallest, most-imported types. Validates
   the deep-import convention and (if chosen) the path alias.
2. **`loading/`** — well-isolated subsystem; ~10 types in `services/loading/`.
3. **`camera/`** — small, mostly already in `@types/`.
4. **`input/`** — small.
5. **`rendering/`** — large; includes renderer instance types. Group by
   producing renderer where it helps reviewability.
6. **`settings/`** — small but cross-cuts engine wiring.
7. **`engine/state/` + handles cleanup** — most of these already exist;
   normalize any stragglers.
8. **`engine/frame/`, `engine/subsystems/`, `engine/wiring/`** — engine
   internals; depends on prior PRs landing.

### Per-PR checklist

For each domain PR:

1. Identify every `export type` in the source files that belongs to the
   domain (using `grep` + manual review).
2. Create new `src/@types/<domain>/<TypeName>.d.ts` files; move the type
   declaration verbatim. Preserve any explanatory comment.
3. In the source file, **delete** the type declaration but **keep** the
   runtime code untouched. If the source file becomes type-only (no runtime
   exports), delete the file.
4. Update every import site:
   - Barrel imports (`from '../@types'`) split into one deep import per type.
   - Same-file usages become an `import type { ... } from '...'` at top.
5. Run `npm run typecheck` — must pass.
6. Run `npm test` — must pass (no test logic changes; only that types still
   resolve).
7. Commit. PR title: `refactor(types): consolidate <domain> types into @types/<domain>`.

### Files that mix runtime + types

Many source files export both runtime constants and types. Example pattern:

```ts
// src/data/sources.ts (before)
export type BandLabels = { ... };
export const SOURCES = [ ... ];
```

After migration:

```ts
// src/@types/data/BandLabels.d.ts (new)
export type BandLabels = { ... };

// src/data/sources.ts (after)
import type { BandLabels } from '../@types/data/BandLabels';
export const SOURCES = [ ... ];
```

The runtime file imports its own former type back from `@types/`.

### Test files

Tests in `tests/` may currently import types from runtime files. After the
move, their imports should point to `@types/` directly. Update as part of the
domain PR; do not leave tests importing types from runtime files.

## Verification

- `npm run typecheck` passes on every PR.
- `npm test` passes on every PR (590+ tests).
- A spot check: after each PR, run `git grep "export type"` against the moved
  source files — should show zero matches for the migrated types.
- Final PR: confirm `src/@types/index.d.ts` is deleted and no file imports
  from the root barrel.

## Risks and mitigations

- **Circular type imports.** Deep imports make this less likely, but a type
  in `engine/handles/` that references one in `engine/state/` is fine
  (TypeScript handles type-only cycles). If a real cycle appears, it's a
  signal the types should be co-located in the same file or one should be
  generalized.
- **Stale comments referencing old paths.** Module headers and CLAUDE.md
  mention `src/@types`. The directory still exists; only the contents
  reorganize. CLAUDE.md may need a one-line update at the end of the
  migration to mention subfolder layout.
- **In-flight branches.** Other plans in `docs/superpowers/plans/` (rhizome,
  cosmic-zoom-plan) may add new types while this migration runs. The
  per-domain PR cadence limits the blast radius — each PR rebases cleanly
  unless an active branch is touching the exact same domain.
- **Renamed type collisions.** Two scattered types may share a name (e.g.,
  multiple `Options` types). The PR review should catch these; resolve by
  prefixing with their domain (`LoadingOptions`, `RendererOptions`) before
  moving.

## Next steps

After user approval of this spec, invoke `writing-plans` to produce a
detailed implementation plan with one task per domain PR.
