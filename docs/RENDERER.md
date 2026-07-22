# Skymap — renderer map & WebGPU landmines

Read this before touching `src/services/gpu/`, `engine`, shaders, or debugging anything about rendering.

## Renderer quick map

- **`pointRenderer.ts` + `shaders/points/*.wesl`**: instanced billboards. Vertex stride is 52 bytes / 13 slots (xyz, magnitude, colorIndex, axisRatio + sign-bit fallback flag, baked paCos/paSin, radiusMpc, vMaxWeight, schechterRatio, angularDensityWeight, baked absMag). Galaxy-static values (PA rotation, absolute magnitude) are baked at upload, not recomputed per vertex. Identity is composed on the GPU from a per-draw `SourceUniforms.sourceCode` + `@builtin(instance_index)`, NOT baked per-vertex.
- **`pickRenderer.ts`**: r32uint pick texture. The fragment writes `(sourceCode << 27) | (localIdx + PICK_SENTINEL_OFFSET)`; see `src/data/selectionEncoding.ts` for the encoding (5 bits source, 27 bits localIdx, code 31 reserved as the all-ones sentinel). Source codes are append-only (the rule lives in `sources.ts`'s docstring) — same hygiene as enum values that get persisted to .bin, applied to POI-only codes too. Read the texture with `copyTextureToBuffer` for hover/click.
- **`textureAtlas.ts` + `texturedDiskRenderer.ts` + `shaders/texturedDisks/*.wesl`**: 2048×2048 atlas of 128×128 slots for galaxy thumbnails. LRU eviction.
- **`engine/subsystems/galaxyAtlasSubsystem.ts`**: the shared atlas + fetch infrastructure — LRU clock, priority-queued concurrency-limited bitmap fetcher, and the `bitmapReady`/`bitmapFailed` memoisation pair. Enqueue is idempotent (don't re-add in-flight keys — see the module header for the bug history). Thumbnail URLs are built by `src/utils/math/{sdss,dss}ThumbnailUrl.ts`: SDSS DR18 ImgCutout (CORS-safe) for SDSS galaxies; CDS hips2fits (CORS-safe DSS proxy) for 2MRS/GLADE.
- **`engine.ts`**: per-frame loop. Per-galaxy `apparentSizePx` gates thumbnail enqueue — but the inner loop hoists `Math.tan` and pre-computes `maxCamDistForVisibility` to avoid 2.5M trig calls per frame.
- **`renderScheduler.ts` + `engine.ts` frame tail**: render-on-demand. `requestRender()` from event handlers wakes the loop; the frame body re-schedules only while `autoRotate || currentTween || hasAnyAxis || queue.inFlightCount > 0 || recent-fade` is true.

## Things that have bitten us before

- **WebGPU `queue.writeBuffer` race**: interleaving `writeBuffer` with `submit` in the same frame doesn't preserve order — bake per-instance data into the vertex buffer instead of a uniform you mutate per draw.
- **Selection halo on wrong galaxy**: same root cause — selection index must come from a per-vertex attribute, not a uniform updated mid-frame.
- **CORS on DSS thumbnails**: ESO's DSS endpoint blocks browsers. Use CDS hips2fits (`https://alasky.cds.unistra.fr/hips-image-services/hips2fits`).
- **Retry storms on failed thumbnails**: the engine has BOTH a `bitmapReady` and `bitmapFailed` Set — the per-frame gate must check both. The image queue's `enqueue` is idempotent for in-flight keys.
- **`<details>` element collapsing on hover**: keep the InfoCard's outer wrapper element identical across renders so React doesn't remount and reset the `open` state.
- **iOS WebGPU is stricter than Chrome's Tint — a bad shader freezes the _whole_ canvas**: `texture_1d` sampling (`textureSampleLevel` has no 1D overload) is one example WebKit rejects but Chrome accepts. Because all HDR passes share one command encoder, an invalid pipeline makes `encoder.finish()` produce an invalid command buffer and `queue.submit()` silently drops the _entire_ frame — the loop ticks and the camera moves, but nothing ever presents. Symptom: navigation/toggles do nothing on iOS while the React UI updates fine, no thrown errors. Diagnosis: `createShaderModuleWithDevLog` (in `shaderCompileLogger.ts`) prints the real `getCompilationInfo()` error + offending line. Store 1D LUTs as N×1 `texture_2d`.
