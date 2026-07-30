# Photoreal Earth — Prep 2: single texture source table

> **Spec.** `docs/superpowers/specs/2026-07-18-photoreal-earth-design.md` §2 (Ground
> preparation → "Prep 2 — Single texture source table"), §9. This plan implements **Prep 2
> only** — one of the two prep refactors that land before the feature PRs.
>
> **Style.** Refactor plan — terse per `docs/superpowers/conventions/plan-style.md`
> ("Refactor vs green-field"). Contract code only; cite `file:line`, don't paste.
>
> **Retires.** `docs/backlog/2026-07-17-texture-source-table-single-home.md` + its
> `docs/BACKLOG.md` index line — in this PR (Task 5).

## Goal

Collapse the two duplicated texture-SOURCE tables — `SSS_BODIES` + `USGS_KEYS` + the
inline Earth/ring splices on the **fetch** side (`tools/fetch/fetchTextures.ts:91-163`) and
`BODY_SOURCE_KEYS` on the **build** side (`tools/textures/buildTextures.ts:94-108`) — into
**one** body→source table with a single home, keyed by the same family key space the
runtime uses. Both `fetchTextures.ts` and `buildTextures.ts` become derived views over it.

**Behavior-neutral.** After the refactor, `npm run fetch-textures` (dev + full) and
`npm run build-textures` must produce the identical raw-file set + built tiers as before.
The existing `tests/tools/fetch/fetchTextures.test.ts:20-82` assertions (exact dev + full
filename sets, incl. the ring and Earth) are the behavior-neutral fetch regression guard
and must stay **green without edits to their assertions**.

### The drift bug this closes

`SSS_BODIES` is a flat array **not** keyed by body id, so adding a textured body compiles
clean while the fetch list silently omits it → the raw never downloads → `buildTextures`
logs a skip → the body renders untextured with **no error** (spec §2 table; backlog detail).
The single table is keyed by the runtime family key, so a body with no source becomes a
type/test failure, not a silent skip.

## Architecture

### Key space — coupled to Prep 1's `TextureKind` (decision)

The single table is keyed **`(family key, kind)`**, mirroring the runtime `bodyTextures`
family:

```ts
Record<BodyTextureId | RingTextureId, Partial<Record<TextureKind, TextureSourceEntry>>>
```

- Top-level key = `BodyTextureId | RingTextureId` — the exact key space of
  `ALL_BODY_TEXTURE_KEYS` (`src/data/bodies/bodyTextureKeys.ts:18-21`): the 13 textured
  bodies plus `'saturn-ring'`. `satisfies Record<…>` makes a **missing body/ring key a
  compile error**.
- Second-level key = `TextureKind` — the `'surface' | 'night' | 'clouds' | 'material' |
  'normal'` union introduced by **Prep 1** (sibling plan `2026-07-18-photoreal-earth-prep-01-*`,
  texture-kind axis). Today every entry populates only `surface` (the ring's one map is
  `surface` too). `Partial<…>` means "has a `surface` source" is **not** compiler-checked —
  that gap is what Task 1's drift test covers.

**Why kind-keyed now, taking a Prep 1 dependency:** the whole point of Prep 2 (spec §2, §9)
is that Earth's future `night`/`clouds`/`material`/`normal` source rows are added *once*, in
this table. A bodyId-only key can't host them (`earth` is taken by the surface map). So the
table **must** be kind-keyed, which means importing Prep 1's `TextureKind`. **Prep 1 lands
first** (spec §12 dependency order: "Prep 1, Prep 2 → A"). This plan imports exactly one
Prep 1 symbol — `TextureKind` — and nothing else.

We **reject** the backlog's suggested shape ("registry rows gain native/dev raw-data keys" —
i.e. fold source keys into the runtime `BODY_TEXTURE_REGISTRY`): that would drag `RawDataKey`
(a `tools/` type) into runtime `src/`, and the fetch's literal-key narrowing needs the tools
`RawDataKey`. The single home stays a **tools-side** module; the runtime registry stays
runtime-only.

### Filename-ownership coupling with Prep 1 (resolved)

Two distinct "filenames" exist, and the two preps own different ones:

| Filename | Owner | This plan |
|---|---|---|
| **Raw source** files (`8k_mars.jpg`, `2k_mars.jpg`, BMNG, USGS `.tif`) | registry (`rawDataRegistry.ts`) | referenced by key only — unchanged |
| **Built output tier** file `${id}-${px}.jpg` (`buildTextures.ts:233`) / `saturn-ring-${px}.png` (`:247`), read at runtime by `bodyTextureFetcher` | **Prep 1** (routes both sides through one `bodyTextureFilename` helper; `surface` stays unsegmented so the name is byte-identical) | **untouched** |

Prep 2 rewires only the *input source* enumeration; it does **not** touch `buildTextures`'s
output-filename lines (`:233`, `:247`). Prep 1 owns the output/runtime name via the shared
`bodyTextureFilename` helper and keeps `surface` **unsegmented** (only non-surface kinds get
a `-${kind}-` segment), so the deployed surface filenames are unchanged. The two preps are
therefore orthogonal on filenames and land in either code-order once Prep 1's `TextureKind`
type exists (Prep 1 first for the type dependency only).

### Literal-narrowing (the backlog "care" item)

The fetch reads `RAW_DATA[nativeKey].upstream`, and `upstream` is **optional** on the
`RawDataEntry` union (`rawDataRegistry.ts:32`). It only narrows to `string` when `nativeKey`
is a string **literal** (or union of literals), not the widened `RawDataKey`. The current
`SSS_BODIES` preserves this with `as const satisfies` (`fetchTextures.ts:78-101`); `RAW_DATA`
itself does the same (`rawDataRegistry.ts:681`). The new table **must** use the same
`as const satisfies Record<…>` form so `TEXTURE_SOURCES[key].surface.native` stays a
union-of-literals and `RAW_DATA[native].upstream` still narrows.

### Module home

`tools/utils/io/textureSources.ts` — beside `rawDataRegistry.ts`, which **both** consumers
already import from (`fetchTextures.ts:59`, `buildTextures.ts:69`), so no new cross-dir
dependency direction. A data-registry module (const table + its type) is the same
multi-symbol shape as `rawDataRegistry.ts` in the same folder — the one-function-per-file
`tools/utils/` rule targets helper grab-bags, not registry data modules (precedent:
`rawDataRegistry.ts` exports `RAW_DATA` + `rawDataPath` + `RawDataKey` + `RawDataEntry`).

## Tech stack

TypeScript (tools tsconfig), Vitest. No new deps. `type` aliases not `interface`; raw paths
via `rawDataPath()` never literals.

## Tasks

### Task 1: The single source table module + drift test

**Files:** `tools/utils/io/textureSources.ts` (new),
`tests/tools/utils/io/textureSources.test.ts` (new).

**Depends on:** Prep 1's `TextureKind` type existing (Prep 1 lands first).

**Contract:**

```ts
// one entry = the raw sources for one (body|ring, kind) texture
export type TextureSourceEntry = {
  readonly native: RawDataKey;      // full-res registry row
  readonly devKey?: RawDataKey;     // dev source is its OWN registry row (Earth's BMNG sibling)
  readonly devFilename?: string;    // dev source is a loose file in textures.dir (SSS bodies, ring)
};

export const TEXTURE_SOURCES = {
  mercury:  { surface: { native: 'textures.sssMercury8k', devFilename: '2k_mercury.jpg' } },
  venus:    { surface: { native: 'textures.sssVenus4k',   devFilename: '2k_venus_atmosphere.jpg' } },
  earth:    { surface: { native: 'textures.nasaBmng',     devKey: 'textures.nasaBmngDev' } },
  // …mars/jupiter/saturn/moon: SSS native + devFilename (values from BODY_SOURCE_KEYS + SSS_BODIES)
  uranus:   { surface: { native: 'textures.sssUranus2k',  devFilename: '2k_uranus.jpg' } },
  neptune:  { surface: { native: 'textures.sssNeptune2k', devFilename: '2k_neptune.jpg' } },
  io:       { surface: { native: 'textures.usgsIo' } },       // no dev source
  // …europa/ganymede/callisto: USGS native only
  'saturn-ring': { surface: { native: 'textures.sssRing', devFilename: '2k_saturn_ring_alpha.png' } },
} as const satisfies Record<BodyTextureId | RingTextureId, Partial<Record<TextureKind, TextureSourceEntry>>>;
```

- The values are the **exact** superset of today's two tables. Source them by reading:
  fetch `SSS_BODIES` (`fetchTextures.ts:91-101`) + `USGS_KEYS` (`:106-111`) + the inline
  Earth (`:153-156, :160`) and ring (part of `SSS_BODIES`); build `BODY_SOURCE_KEYS`
  (`buildTextures.ts:94-108`) + `RING_SOURCE_FILENAME_DEV` (`:111`).
- **Note the Uranus/Neptune superset:** `SSS_BODIES` carries a `devFilename` for them
  (their native IS the 2k file, so the dev pull lists them at the native path — see the
  no-op swap at `fetchTextures.ts:130-132`), while `BODY_SOURCE_KEYS` carries none. The
  union **keeps** the `devFilename` so the dev pull still includes Uranus/Neptune
  (`fetchTextures.test.ts:32-33`, `:74-81`); on the build side the extra dev candidate
  resolves to the same on-disk path as native, so build stays behavior-neutral.
- `as const satisfies` is mandatory (see Architecture → literal-narrowing).

**Test — `every textured-body/ring family key has a surface source`:**
Iterate `ALL_BODY_TEXTURE_KEYS` (`src/data/bodies/bodyTextureKeys.ts`); assert
`TEXTURE_SOURCES[key].surface?.native` is defined for each. This is the **drift-prevention**
property (spec §2): add a textured body/ring, forget its source → red test, not a silent
untextured render. It is a cross-table invariant (runtime family ⊆ table's `surface`
entries), not a restatement of the table — and `Partial<…>` means the compiler does **not**
already guarantee it (per `docs/superpowers/conventions/testing.md`).

- [x] Add `tools/utils/io/textureSources.ts` with `TextureSourceEntry` + `TEXTURE_SOURCES`.
- [x] Add the drift test above.
- [x] `npx tsc --noEmit` (tools) clean — confirms the `satisfies` completeness check + the
      `TextureKind` import resolve.
- [x] `npm test -- textureSources` → green.

### Task 2: Fetch side derives from the table

**Files:** `tools/fetch/fetchTextures.ts` (modify),
`tests/tools/fetch/fetchTextures.test.ts` (regression — assertions unchanged).

Delete `SSS_BODIES` (`:91-101`), `SssBody` (`:103`), `USGS_KEYS` (`:106-111`), and the
inline Earth splices inside `textureSourcesFor` (`:153-156, :160`). Rewrite the SSS
full/dev source helpers (`sssFullSource` `:114-116`, `sssDevSource` `:126-137`) as
table-driven `fullSource(entry)` / `devSource(entry)` that read a `TextureSourceEntry`:

- **full pull** = every `TEXTURE_SOURCES[key].surface.native` for all `ALL_BODY_TEXTURE_KEYS`
  (bodies + ring). `{ url: RAW_DATA[native].upstream, destPath: rawDataPath(native) }`.
- **dev pull** = entries whose `surface` has a dev source (`devKey` **or** `devFilename`);
  `devKey` → `{ url: RAW_DATA[devKey].upstream, destPath: rawDataPath(devKey) }` (the Earth
  branch, replacing the inline splice); `devFilename` → the existing resolution-prefix
  URL-swap + `textures.dir` dest (`:126-137` logic), incl. the Uranus/Neptune no-op swap.

`TextureSource` (`:73-76`) stays — it is the fetch OUTPUT (resolved url+dest), distinct from
the authored `TextureSourceEntry`.

**Regression:** the existing `textureSourcesFor` tests (`fetchTextures.test.ts:20-82`) pin
the exact dev + full filename sets, dedup, and the Uranus/Neptune-both-modes property — they
are the behavior-neutral guard. Do **not** touch their assertions; the import block may add
`TextureSource` from the same module if needed but assertions stay byte-identical.

- [x] Rewire `textureSourcesFor` per above; delete the three dead tables + `SssBody`.
- [x] `npm test -- fetchTextures` → all existing assertions green, unchanged.
- [x] `npx tsc --noEmit` clean (confirms literal-narrowing survived — no `upstream` optional
      error at the `fullSource`/`devSource` call sites).

### Task 3: Build side derives from the table

**Files:** `tools/textures/buildTextures.ts` (modify).

Delete `BodySourceKeys` (`:88-92`), `BODY_SOURCE_KEYS` (`:94-108`), and
`RING_SOURCE_FILENAME_DEV` (`:111`). Rewrite `sourcePathsFor` (`:114-123`) and
`ringSourcePaths` (`:126-131`) to read a `TextureSourceEntry` from `TEXTURE_SOURCES`:
`sourcePathsFor(id)` reads `TEXTURE_SOURCES[id].surface`; `ringSourcePaths()` reads
`TEXTURE_SOURCES['saturn-ring'].surface`. Path derivation is otherwise **unchanged**
(native `rawDataPath(native)`, then `devKey` via `rawDataPath` or `devFilename` via
`join(rawDataPath('textures.dir'), …)` — same as `:117-121`).

**Do NOT change** the output loop or output filenames (`${id}-${px}.jpg` `:233`,
`saturn-ring-${px}.png` `:247`) — those are Prep 1's (the `-${kind}` segment). The body loop
still iterates `BODY_TEXTURE_REGISTRY` (`:217`); only its source-key *input* changes.

Behavior-neutrality here is covered by Task 1's drift test (every body has a `surface`
source that build now reads) + typecheck; no build assertion changes and no sharp run is
added (the tier/tint logic is untouched).

- [x] Rewire `sourcePathsFor` + `ringSourcePaths`; delete the dead build table + type.
- [x] `npx tsc --noEmit` clean.
- [x] `npm test -- textures` → existing build tests (`emittedTiersForBody`,
      `tiersFittingSourceWidth`, `writeTintedMonoTier`) green.

### Task 4: Update the registry docstring that documented the drift

**Files:** `src/data/bodies/bodyTextureRegistry.ts` (modify).

The module docstring at `:18-27` currently states the fetcher "authors its own source list
(`SSS_BODIES` / `USGS_KEYS`) … so the download set and this registry can drift (see the
backlog item …)". After the collapse this is stale. Rewrite that paragraph to state that
fetch and build now derive their source sets from the single `TEXTURE_SOURCES` table
(`tools/utils/io/textureSources.ts`), so a body with no source is a type/test failure rather
than a silent drift. Keep the didactic tone; drop the backlog reference.

- [x] Update the `:18-27` paragraph; remove the drift/backlog callout.
- [x] No test — doc-only.

### Task 5: Retire the backlog item

**Files:** `docs/backlog/2026-07-17-texture-source-table-single-home.md` (delete),
`docs/BACKLOG.md` (modify — remove the index line at `:41`).

Per the Backlog-hygiene convention: picking up an item deletes its index line **and** its
detail file in the same change. This plan IS the pickup.

- [x] `rm -f docs/backlog/2026-07-17-texture-source-table-single-home.md`.
- [x] Delete the `docs/BACKLOG.md:41` "Texture source table single home" index line.

### Task 6: Full gate + commit

- [ ] `npm run typecheck` (both src + tools tsconfigs) clean.
- [ ] `npm test` → whole suite green.
- [ ] `npm run format` on **touched files only** (the new module, the two rewired tools, the
      registry docstring, the new test).
- [ ] Commit with the standard trailer.

## Out of scope

- Prep 1's `TextureKind` axis, the `-${kind}` output/runtime filename, `BodyTextureReq`
  changes, the slot/commit dispatch — all owned by the sibling Prep 1 plan.
- Any new Earth source rows (`night`/`clouds`/`material`/`normal`) or their `rawDataRegistry`
  entries — those land with feature PRs B/C/D, added once to `TEXTURE_SOURCES` (the payoff
  this refactor enables).
- No R2 sync, no raw fetches, no `bin`/tier rebuild — behavior-neutral code-only refactor.
