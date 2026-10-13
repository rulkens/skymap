# GPU memory audit — 2026-10-13

What every GPU-resident asset costs, when it is allocated, and when (if ever) it is
freed. Read-only review of `src/` at `9aa63cc2`, by code reading plus the byte sizes
in `docs/grill-sessions/boot-load-priority-2026-07-24.md` and `docs/DATA.md`; nothing
was measured in a browser. `trackGpuMemory` (Debug panel → Memory, or
`__skymapPerf.memory()`) is the tool to confirm any number here.

Sizes: 1080p = 1920×1080; 4K = 3840×2160 (CSS 1080p at the DPR-2 clamp). Tier
`medium` is the desktop default; boot is at Earth.

## Verdict

Load is demand-driven and careful; **unload barely exists**. A `ready` slot keeps its
GPU resources and its decoded CPU value until `release()`, and only five row families
have a `release` predicate — body textures, mesh bodies, galaxy catalogs (only when the
tier excludes them), `localBubble` (distance) and Gaia (declared, never fires). **No
release predicate reads a setting**, so switching a layer off frees nothing.

Resize, grow-on-demand buffers and readback staging are clean: no per-frame
allocation, no grow path that skips destroying the old buffer, no use-after-destroy.

## Fixed in the same change as this doc

| Finding | VRAM | Fix |
|---|---|---|
| `TextureAtlas` had no `destroy()`; `tileStreamSubsystem.destroy()` dropped the store to GC | surface tiles 256 MiB + 68 MB per body switch; galaxy atlas 16 MiB per layer teardown | `SlotStore.destroy()`, called by the stream |
| Earth's maps and the cloud shell's copy were never released (`releaseBodyTexture` cleared textured bodies only) | ~270 MB at medium, ~805 MB at large, after leaving Earth | `earthRenderer.clearMap`, `cloudShellRenderer.clearTexture` |
| Decoded `ImageBitmap`s kept by the slot after every sink had copied them | up to 128 MiB per 8k map (outside the GPU ledger) | `close()` after commit: body textures, mesh textures, body atlas |

Ring strips stay resident on purpose: three small copies, not worth a clear surface on
each consumer.

## Budget at the default (medium, 1080p)

| Bucket | MB | Notes |
|---|---|---|
| Star pool (records + nodes + cut lists) | ~46 | fixed 128 slots × 32,768 records, sized at index arrival |
| Galaxy point buffers | 34–45 | 56 B/row; loaded at boot though faded out at Earth |
| Hi-res famous array | 32 | 8 × 1024² rgba8, eager at boot |
| Flow particles | 26.6 | allocated at layer `create`; layer is off by default |
| MCPM r16f 3D | 19.4 | on by default; reads only at the widest rung |
| Galaxy thumbnail atlas | 16 | boot |
| Always-on render targets | ~51 | ~204 at 4K |
| Pick targets | up to 66 | up to 265 at 4K |
| Other boot pools (MSDF ×2, body placeholders, LUTs) | ~30 | |
| **One Earth close approach** | **+~605** | tile atlases 336 + Earth maps 224 + cloud copy 45 |

## Open findings (backlog)

1. **Layer off frees nothing.** Galaxy catalogs, the three density volumes, flow
   cube, filaments, constellations, structures. Widens
   [`volume-field-vram-release`](../../backlog/2026-09-13-volume-field-vram-release.md);
   its fade-gated `release` design is the general one.
2. **Pick targets are canvas-sized to read one texel.** Up to four r32uint + depth
   pairs (`pickProgram.ts:162`, readback at `:428`), never released; debug pick
   targets survive the overlay being turned off. A small target with an off-centre
   projection saves 66 MB (1080p) / 265 MB (4K) and a full-viewport raster per hover.
3. **Eager allocations for off or invisible features.** Flow particles (26.6 MB);
   bloom pyramid with bloom disabled; `cosmic-web-density`, `zoa`, `star-aggregates`,
   `mw-aggregate` targets with their layers hidden (no `allocateWhen`); hi-res famous
   and galaxy atlas before any galaxy is visible (that half rides
   [scale-gated demand](../../backlog/2026-07-24-scale-gated-asset-demand.md)).
4. **Star catalog.** A tier switch refetches and re-decodes the tier-independent
   octree index (`resizeStarPools` could resize in place); the cut's capture copy
   (6–13 MB) outlives the capture; the slot's `onRelease` would destroy only the chunk
   stream, not the records/cut buffers, if a release row were ever added.
5. **`AssetSlot` keeps every committed value; superseded values are never disposed.**
   CPU copies nothing reads after upload: volume voxels (155 MB at large), flow cube,
   filaments, `ShellMesh` (views into the whole ~11 MB fetched buffer). Superseded
   fetches drop their value without disposal: a hi-res famous texture allocated in
   `fetch` leaks to GC (`wireHiResFamousSlot.ts:27`), superseded bitmaps go unclosed.
6. **Galaxy point record is 56 B of f32.** Position needs f32; the rest packs to
   snorm16/f16 for 32 B (−43%, 60–84 MB at large). The full CPU `interleaved` mirror
   kept for bias splices costs the same again in JS heap.
7. **Body maps are uncompressed rgba8.** No BC/ETC/ASTC; the device requests only
   `timestamp-query`. ~4× on the largest textures in the app.
8. **Small.** MSDF font atlas array uploaded twice (`labelRenderer`, `label3DRenderer`);
   thumbnail atlas and hi-res array have no mips (minified 5–8×, shimmer);
   `star-aggregates` and `bloom1` are the same size and never live at once.
