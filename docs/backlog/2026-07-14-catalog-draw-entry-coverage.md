# `CatalogDrawEntry` bind-group coverage

`deferred` · surfaced by the GPU-renderers-reorg final review (2026-07-14)

## The gap

`catalogStore.entries()` (`src/services/gpu/renderers/galaxyCatalog/catalogStore.ts`) yields one
`CatalogDrawEntry` per loaded catalog, in `GALAXY_CATALOG_SOURCES` draw order:

```ts
export type CatalogDrawEntry = {
  source: SourceType;
  count: number;
  vertexBuffer: GPUBuffer;
  fadeBuffer: GPUBuffer;
  fadeBindGroup: GPUBindGroup;
  sourceBindGroup: GPUBindGroup;
};
```

`galaxyPointRenderer.draw()` binds those groups verbatim — it never reaches into the store's private
map, which is the whole point of the projection. The consequence is that the **only** thing
standing between a mis-wired entry and the screen is the store: if `entriesGen()` yielded
2MRS's `fadeBindGroup` alongside SDSS's `sourceBindGroup`, every draw would still encode
cleanly (the bind groups are structurally interchangeable — same layouts, same 16-byte
uniforms), and the bug would surface only as SDSS points fading on the 2MRS slider and
picking as the wrong source.

Today's tests don't close that. The store's own tests cover draw **order**, the loaded/unloaded
skip rule, and buffer lifecycle; the `galaxyPointRenderer` draw test only smoke-checks the encoded
command list (`expect(commands).toContain('setPipeline')`). Neither ever compares an entry's
bind groups against the ones that source's buffers were created with.

## Why this is not a regression

The reorg extracted `catalogStore` out of `galaxyPointRenderer`, but the exposure predates it: the
same fade/source bind groups were selected from the same per-source map inside the single-file
renderer, and the same smoke-level draw test was the only thing exercising the selection. The
extraction did not widen the gap — it made it visible by giving the projection a name and a
public type. Filing it here rather than fixing it in the reorg keeps that PR a pure move.

## What a real test would assert

In `tests/services/gpu/renderers/galaxyCatalog/catalogStore.test.ts`, with the existing stub
device: make `createBuffer` / `createBindGroup` return **identity-bearing** stubs (echo the
descriptor `label`, and have the bind-group stub retain the buffer it was built around). Then
upload two catalogs with different ids and assert, per yielded entry:

- `entry.fadeBindGroup` is the bind group whose backing buffer is `entry.fadeBuffer` — i.e. the
  fade group belongs to _this_ entry's source, not a sibling's;
- `entry.sourceBindGroup` is the group built around the `SourceUniforms` buffer whose first u32
  is `entry.source`'s code (the store already writes it, so the stub can read it back);
- `entry.vertexBuffer` is the buffer written with that source's baked interleaved bytes.

That is a genuine wrong-source-mix-up detector: a swap between two loaded catalogs' groups fails
it, and no compiler check or existing test catches such a swap. Assertions that merely restate
the field list (`expect(entry).toHaveProperty('fadeBindGroup')`) are worthless here and are
explicitly out of scope — see `docs/superpowers/conventions/testing.md`.
