# Chunked star octree, prep P1: `SlotPool` out of `TextureAtlas`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The key → slot LRU that today lives inside `TextureAtlas` becomes a GPU-free `SlotPool`, and the tile stream takes its slot store as a dependency, so the octree feature can stream chunks through the same loop over a buffer-backed store. Behaviour-neutral: galaxy thumbnails and surface tiles allocate, refuse, evict, upload and draw exactly as before.

**Architecture:**

- `SlotPool` (`src/utils/cache/slotPool.ts`) owns key → slot, LRU by `lastSeenFrame`, the refuse-when-every-slot-was-claimed-this-frame rule, `touch`, `slotOf` and the evict handler. It imports no GPU type.
- `SlotStore` is the contract the tile stream needs from any store. `SlotPool` and `TextureAtlas` both satisfy it; the feature's buffer-backed store will too.
- `TextureAtlas` composes a `SlotPool` and forwards the `SlotStore` methods. It keeps the GPU side (texture, `uploadBitmap`, `getTextureView`) and the atlas-only `slotUv`.
- `createTileStreamSubsystem<T, S extends SlotStore>` takes `slots: S` instead of building an atlas from geometry. It exposes that store as `slots: S`, which replaces its two atlas-only forwarders `slotUv` and `getTextureView`. Callers construct their own `TextureAtlas`.

**Tech stack:** TS, Vitest.

**Spec:** [`docs/superpowers/specs/2026-10-10-chunked-star-octree-design.md`](../specs/2026-10-10-chunked-star-octree-design.md), §8.2 (row "Fixed-slot LRU") and §8.3 (P1).

## Global constraints

- Behaviour-neutral. Moved tests keep their expected values. No consumer's allocation order, refusal, eviction or upload changes.
- No buffer-backed store, no `createBufferStreamSubsystem` and no victim-policy parameter land in this PR.
- `type` aliases, never `interface`. One type per `@types/` file, filename = symbol. No barrels. Types never inline in implementation files.
- Moves use `npm run move-files -- <from> <to>`, renames `npm run refactor -- rename <file>#<symbol> <newName>`, extractions `npm run refactor -- extract <file>#<symbol> <dest>`, never `git mv` and hand-edited imports. Each task spells out its commands.
- Comments explain why, never what: module header ≤ 10 lines, comment lines ≤ half the code lines. When a rationale moves from one file to another, it moves; it is not copied, and no comment narrates the refactor.
- Each task is its own commit. Format with `npx prettier --write <files>`, never `npm run format`. Stage files by path, never `git add -A`. No `Co-Authored-By` lines.
- No perf run: the only hot-path change is one forwarding call per `allocate`/`touch`, against 256 galaxy slots and 64 tile slots.

## Review focus

1. **Refusal rule is the same expression (Task 1).** A resident key always gets its slot back (`touch` first); a new key is refused only when the least-recently-seen slot has `lastSeenFrame === frame` (`textureAtlas.ts:212-236`). An off-by-one here is the stationary-camera refetch loop the Earth tile fix closed.
2. **Evict ordering (Task 1).** The evicted key leaves the key map, then the handler runs inside `try/catch`, then the slot is overwritten (`textureAtlas.ts:238-252`). A handler that runs after the overwrite lets a consumer draw the new occupant under the old key's UVs.
3. **One handler per store (Task 2).** The stream installs its own handler on the store and clears it on `destroy` (`tileStreamSubsystem.ts:59-63`, `:146`). Nothing else may call `setEvictHandler` on a store a stream owns; consumers subscribe through the stream, as today.
4. **Texture creation timing (Task 1).** The atlas texture is created at the same point as before: immediately after the atlas is constructed.

---

### Task 1: Extract `SlotPool`; `TextureAtlas` composes it, `review: yes`

`review: yes` because a landmine memory (Earth tile atlas thrash) names `textureAtlas.ts`'s `allocate`.

**Files:** `src/utils/cache/slotPool.ts` (new), `src/@types/cache/SlotStore.d.ts` (new), `src/@types/cache/SlotEntry.d.ts` (new, extracted), `src/@types/cache/SlotEvictHandler.d.ts` (renamed and moved from `src/@types/rendering/AtlasEvictHandler.d.ts`), `src/@types/rendering/TextureAtlasConfig.d.ts` (new, extracted), `src/services/gpu/resources/textureAtlas.ts`, `src/services/engine/subsystems/tileStreamSubsystem.ts` (drop the `initTexture()` call only), `tests/utils/cache/slotPool.test.ts` (new), `tests/services/gpu/resources/textureAtlas.test.ts`

**Contract:**

```ts
// src/@types/cache/SlotStore.d.ts
export type SlotStore = {
  allocate(key: string, frame: number): number | null;
  touch(key: string, frame: number): number | null;
  slotOf(key: string): number | undefined;
  occupiedCount(): number;
  setEvictHandler(handler: SlotEvictHandler | undefined): void;
};
// src/utils/cache/slotPool.ts
export class SlotPool implements SlotStore {
  constructor(capacity: number);
  lastSeenFrame(key: string): number | undefined; // read by the moved tests only, as today
}
// src/services/gpu/resources/textureAtlas.ts
export class TextureAtlas implements SlotStore {
  constructor(device: GPUDevice, config: TextureAtlasConfig); // now also creates the texture
  uploadBitmap(slotIdx: number, bitmap: ImageBitmap): void;
  getTextureView(): GPUTextureView;
  slotUv(slotIdx: number): Vec4;
}
```

- [x] Rename and move the evict handler type: `npm run refactor -- rename src/@types/rendering/AtlasEvictHandler.d.ts#AtlasEvictHandler SlotEvictHandler`, then `npm run move-files -- src/@types/rendering/SlotEvictHandler.d.ts src/@types/cache/SlotEvictHandler.d.ts`. Rewrite its header to name `SlotPool.allocate` instead of `TextureAtlas.allocate`; the ordering promise it states is unchanged.
- [x] Extract the two inline types: `npm run refactor -- extract src/services/gpu/resources/textureAtlas.ts#SlotEntry src/@types/cache/SlotEntry.d.ts` and `npm run refactor -- extract src/services/gpu/resources/textureAtlas.ts#TextureAtlasConfig src/@types/rendering/TextureAtlasConfig.d.ts`. If the CLI refuses a `.d.ts` destination or a non-exported symbol, create the files by hand and export the types; neither has an importer outside `textureAtlas.ts` today. Drop the "more than one atlas" back-reference from `TextureAtlasConfig.label`'s doc (`textureAtlas.ts:45-51`), since it now points at a different file.
- [x] Create `SlotStore.d.ts` as in the contract.
- [x] Create `SlotPool` from the slot half of `TextureAtlas`: the `slots` array and key map (`textureAtlas.ts:71-83`), `setEvictHandler` (`:96-108`), `allocate` (`:194-254`), `touch` (`:256-267`), `slotOf` (`:269-277`), `lastSeenFrame` (`:279-283`) and `occupiedCount` (`:285-289`). Move their bodies unchanged; `slotCount` becomes the constructor's `capacity`. The console prefix in the catch becomes `[SlotPool]`. The module header takes the eviction and "a slot index is a fact about the frame" paragraphs (`:14-24`), within 10 lines.
- [x] `TextureAtlas` holds `private readonly pool = new SlotPool(slotCount)` and forwards `allocate`, `touch`, `slotOf`, `occupiedCount`, `setEvictHandler` as one-liners. Its `lastSeenFrame` goes: after the test move it has no reader.
- [x] Fold `initTexture` (`:132-149`) into the constructor and delete the method, the `texture | undefined` field and the two "call initTexture() first" throws (`:173`, `:190`). Its only reason was letting the slot tests build an atlas without a device (`:58-59`, `:117-119`, `:125-127`); those tests now build a `SlotPool`. Delete the `atlas.initTexture()` call at `tileStreamSubsystem.ts:42`. The texture is still created at the same point in the run.
- [x] Rewrite the atlas module header (`:1-32`) to ≤ 10 lines: the fixed-grid why, constructor geometry, and one line pointing at `SlotPool` for the LRU and the slot-index rule.
- [x] Move the slot tests to `tests/utils/cache/slotPool.test.ts`, building `new SlotPool(n)` with no device: `textureAtlas.test.ts:23-62` (idempotent, LRU eviction, `slotOf` across evict-and-return), `:64-81` (thrown handler) and `:83-146` (over-budget within a frame, with `newSmallAtlas` becoming `new SlotPool(4)`). They keep their names and assertions. `returns null rather than evicting a slot claimed earlier in the same frame` is the spec §9 "slot-pool refusal" test.
- [x] `textureAtlas.test.ts` keeps only the `slotUv` test (`:148-154`). The atlas constructor now calls `device.createTexture`, so it passes a stub device whose `createTexture` returns `{}`.
- [x] No new test. Every behaviour `SlotPool` exposes is already asserted by a moved test, and the forwarders are covered end to end by the tile stream tests (Task 2).
- [x] Commit.

### Task 2: The tile stream takes its slot store as a dependency

**Files:** `src/@types/engine/subsystems/TileStreamDeps.d.ts`, `src/@types/engine/subsystems/tileStreamSubsystem/TileStreamSubsystem.d.ts`, `src/services/engine/subsystems/tileStreamSubsystem.ts`, `src/layers/galaxyCatalog/subsystems/galaxyAtlasSubsystem.ts`, `src/services/engine/subsystems/surfaceTileSubsystem.ts`, `src/layers/galaxyCatalog/subsystems/texturedDiskSubsystem.ts`, `src/layers/galaxyCatalog/subsystems/proceduralDiskSubsystem.ts`, `src/layers/galaxyCatalog/load/wireImpostorSubsystems.ts`, `src/@types/engine/subsystems/TexturedDiskDeps.d.ts`, `src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime.d.ts`, `src/@types/engine/subsystems/texturedDiskSubsystem/TexturedDiskSubsystem.d.ts` and `src/@types/engine/subsystems/SurfaceTileSubsystem.d.ts` (doc text only), `tests/services/engine/subsystems/tileStreamSubsystem.test.ts`, `tests/layers/galaxyCatalog/subsystems/proceduralDiskSubsystem.test.ts`

**Contract:**

```ts
// TileStreamDeps.d.ts: device, atlasSide, slotSide, format, label (:11-19) go
export type TileStreamDeps<T, S extends SlotStore> = {
  readonly slots: S;
  readonly concurrency?: number;
  readonly requestRender: () => void;
  readonly upload: (slots: S, slotIdx: number, payload: T) => void;
  readonly release: (payload: T) => void;
};
// TileStreamSubsystem.d.ts: slotUv (:32-36) and getTextureView (:80-81) go
export type TileStreamSubsystem<T, S extends SlotStore> = Destroyable & {
  readonly slots: S;
  // allocate, touch, upload, enqueueFetch, isLoaded, isFailed,
  // inFlightCount, occupiedCount, setEvictHandler: signatures unchanged
};
export function createTileStreamSubsystem<T, S extends SlotStore>(
  deps: TileStreamDeps<T, S>,
): TileStreamSubsystem<T, S>;
```

- [x] `createTileStreamSubsystem` reads `deps.slots` where it built `atlas` (`tileStreamSubsystem.ts:24-42`). Every other line that calls the atlas keeps calling the store; `uploadPayload(atlas, …)` (`:88`) passes the store. The stream still owns the store's evict handler (`:59-63`) and clears it on `destroy` (`:146`). Rewrite the module header and the two `@types` headers so none of them says "GPU texture atlas"; the stream is now store-agnostic.
- [x] `createGalaxyAtlasSubsystem` (`galaxyAtlasSubsystem.ts:23-35`) builds `new TextureAtlas(deps.device, { atlasSide, slotSide, format, label })` and passes it as `slots`; it returns `TileStreamSubsystem<ImageBitmap, TextureAtlas>`. `uploadBitmapToAtlas` stays a plain function reference.
- [x] `surfaceTileSubsystem.ts` `engage` (`:257-289`) builds the albedo and height atlases the same way and passes each as `slots`. The `atlas` record's stream fields (`:126-127`) are typed `TileStreamSubsystem<…, TextureAtlas>`.
- [x] Call sites of the removed forwarders read the store: `stream.slotUv(…)` → `stream.slots.slotUv(…)` at `surfaceTileSubsystem.ts:447` and `texturedDiskSubsystem.ts:211`; `.getTextureView()` → `.slots.getTextureView()` at `surfaceTileSubsystem.ts:614-615` and `wireImpostorSubsystems.ts:53`.
- [x] Re-type the remaining annotations: `TexturedDiskDeps.d.ts:7`, `GalaxyCatalogRuntime.d.ts:49`, `wireImpostorSubsystems.ts:24`, `proceduralDiskSubsystem.ts:51`. Use `TextureAtlas` where the file reads `.slots` or hands the stream to a file that does, and `SlotStore` otherwise (`proceduralDiskSubsystem` only calls `isLoaded`).
- [x] Tests: in `tileStreamSubsystem.test.ts`, the `Deps` alias (`:26`) and the two configs (`:28-33`, `:197-202`) become `TextureAtlasConfig`, and each construction passes `slots: new TextureAtlas(device, config)`. The fake devices already provide `createTexture`. Delete `allocate returns distinct slots for distinct keys` (`:73-85`): `SlotPool`'s idempotency test and the stream's recycled-slot test (`:228-282`, which asserts allocate's return values through the stream) catch every bug it could. In `proceduralDiskSubsystem.test.ts`, drop the stub's `slotUv` and `getTextureView` entries (`:187-189`, `:202-204`); the stub's cast hides that they are gone from the type.
- [x] No new test: the stream's behaviour is unchanged, and a store method the stream must not call is a compile error under `S extends SlotStore`.
- [x] Commit.

### Task 3: Docs follow the split

**Files:** `docs/RENDERER.md`, `docs/BACKLOG.md`, `docs/backlog/2026-08-20-hires-famous-lru-substrate.md`, `src/@types/rendering/hiResFamousTexture/HiResFamousTexture.d.ts` (one comment line)

- [ ] `RENDERER.md:59`: the landmine names `SlotPool.allocate` (reached through `TextureAtlas` and the tile stream). `:30`: "`textureAtlas.ts` is the shared LRU slot atlas" becomes the atlas over a `SlotPool` (`utils/cache/slotPool.ts`). `:22`: "LRU eviction" points at `SlotPool`.
- [ ] `BACKLOG.md:141`: the item names `SlotPool` instead of `TextureAtlas`; its text is otherwise unchanged.
- [ ] `HiResFamousTexture.d.ts:16-17`: "(what `TextureAtlas` uses)" names `SlotPool`.
- [ ] The hi-res-famous backlog detail file gains one paragraph under "Approach": `SlotPool` is now the shared substrate, but `hiResFamousTexture` evicts the smallest recent apparent diameter and refuses a newcomer smaller than that victim (`hiResFamousTexture.ts:147-159`), a policy `SlotPool` does not have. Folding it in needs a victim-policy seam, so it is not a one-line change.
- [ ] Commit.

## Definition of Done

**Deliverables**

- `SlotPool` in `src/utils/cache/slotPool.ts` with its moved tests in `tests/utils/cache/slotPool.test.ts`; no GPU type in its import graph.
- `SlotStore`, `SlotEntry`, `SlotEvictHandler` under `src/@types/cache/`; `TextureAtlasConfig` under `src/@types/rendering/`; `AtlasEvictHandler` gone.
- `TextureAtlas implements SlotStore` by composing a `SlotPool`; `initTexture` and `lastSeenFrame` gone from it.
- `createTileStreamSubsystem<T, S extends SlotStore>` takes `slots: S`; `TileStreamSubsystem` exposes `slots` in place of `slotUv` and `getTextureView`.

**Observable behaviours for the smoke pass (all unchanged from main)**

- `#focus=cluster-virgo-m87`: galaxy thumbnails fade in on approach, and with the camera held still they stay put. No flicker and no repeat thumbnail requests in the Network tab.
- `#focus=body-earth`, zoomed to the ground: surface tiles stream in, sharp and correctly placed. Held still, tile requests stop. The surface tile debug readout shows the same used / capacity numbers as on main.
- `#focus=body-mars`, zoomed to the ground: height tiles displace the terrain as on main.

**Out of scope**

- A buffer-backed `SlotStore`, `createBufferStreamSubsystem` and any renaming of the tile stream (the feature PR). After this PR the feature may need no sibling at all: `createTileStreamSubsystem<Chunk, BufferStore>` is the loop.
- A `capacity` member on `SlotStore`: nothing reads one today. The feature adds it with its first reader.
- A victim-policy parameter on `SlotPool`, and folding `hiResFamousSubsystem` into it. That item stays backlogged.
- Atlas sizing, finest-mip-first eviction (`BACKLOG.md:141`).
- A deletion audit (runs once, at the feature's `/feature-done`).
