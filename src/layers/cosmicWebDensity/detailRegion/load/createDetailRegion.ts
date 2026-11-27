/**
 * createDetailRegion — one field's detail region (spec §6.4–6.6): loads the sidecar and its format's
 * brick index, then each frame plans the box, touches every shown brick before it allocates (so a
 * slab still drawn, fading out included, keeps its slot), writes empty bricks as the zero brick and
 * streams the rest. Owns the store, and so the texture it lends the renderer.
 */
import type { ArchiveEntry } from '../../../../@types/archive/ArchiveEntry';
import type { ArchiveIndex } from '../../../../@types/archive/ArchiveIndex';
import type { VolumePyramidFormatRow } from '../../../../@types/data/volume/VolumePyramidFormatRow';
import type { VolumePyramidSidecar } from '../../../../@types/data/volume/VolumePyramidSidecar';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { mat4, vec3 } from 'wgpu-matrix';
import { ARCHIVE_FETCH_DEADLINE_MS } from '../../../../data/archive/archiveFetchDeadlineMs';
import { TEXTURE_BYTES_PER_TEXEL } from '../../../../data/gpu/textureBytesPerTexel';
import { VOLUME_BRICK_EDGE } from '../../../../data/volume/volumeBrickEdge';
import { createTileStreamSubsystem } from '../../../../services/engine/subsystems/tileStreamSubsystem';
import { dataUrl, HttpError } from '../../../../services/loading/fetchWithProgress';
import { fetchVolumePyramidSidecar } from '../../../../services/loading/volume/fetchVolumePyramidSidecar';
import { decodeArchiveIndex } from '../../../../utils/archive/decodeArchiveIndex';
import { findArchiveEntry } from '../../../../utils/archive/findArchiveEntry';
import { levelByteLength } from '../../../../utils/gpu/memory/levelByteLength';
import { buildCubeModelMatrix } from '../../../../utils/math/buildCubeModelMatrix';
import { brickId } from '../../../../utils/volume/brickId';
import { pickVolumePyramidFormat } from '../../../../utils/volume/pickVolumePyramidFormat';
import { volumeBrickArchivePath } from '../../../../utils/volume/volumeBrickArchivePath';
import { volumePyramidPlacement } from '../../../../utils/volume/volumePyramidPlacement';
import type { BrickTextureStore } from '../@types/BrickTextureStore';
import type { DetailRegion } from '../@types/DetailRegion';
import type { DetailRegionDeps } from '../@types/DetailRegionDeps';
import type { DetailRegionState } from '../@types/DetailRegionState';
import { DETAIL_REGION_FADE_MS } from '../data/detailRegionFadeMs';
import { DETAIL_REGION_FETCH_CONCURRENCY } from '../data/detailRegionFetchConcurrency';
import { DETAIL_REGION_ZERO_BRICKS_PER_FRAME } from '../data/detailRegionZeroBricksPerFrame';
import { detailRegionDraw } from '../plan/detailRegionDraw';
import { planDetailRegion } from '../plan/planDetailRegion';
import { bricksOf } from '../utils/bricksOf';
import { createBrickTextureStore } from './createBrickTextureStore';
import { fetchVolumeBrick } from './fetchVolumeBrick';

export function createDetailRegion(deps: DetailRegionDeps): DetailRegion {
  const abort = new AbortController();
  let running: DetailRegion | null = null;
  let loading = true;

  void (async () => {
    try {
      // A stalled request would hold `busy`, and so the planner's wake vote, forever. Inside the
      // try so a throw here clears `loading` too.
      const signal = AbortSignal.any([
        abort.signal,
        AbortSignal.timeout(ARCHIVE_FETCH_DEADLINE_MS),
      ]);
      const sidecar = await fetchVolumePyramidSidecar(deps.binBaseName, signal);
      const format = pickVolumePyramidFormat(deps.device.features);
      const url = dataUrl(volumeBrickArchivePath(deps.binBaseName, format.format));
      const res = await fetch(url, { signal });
      if (!res.ok) throw new HttpError(res.status, url);
      const index = decodeArchiveIndex(new Uint8Array(await res.arrayBuffer()));
      const grid = sidecar.dataBox.dims.map((d) => Math.ceil(d / VOLUME_BRICK_EDGE)) as Vec3;
      const count = grid[0] * grid[1] * grid[2];
      // Every id listed, so a frame never meets a brick the index lacks.
      const ids = Array.from({ length: count }, (_, b) => b);
      if (index.entryCount !== count || !ids.every((b) => findArchiveEntry(index, b))) {
        throw new Error(`${url} lists ${index.entryCount} bricks, the grid has ${count}`);
      }
      if (!abort.signal.aborted) running = runDetailRegion(deps, sidecar, format, index, grid);
    } catch (error) {
      // No region until the host rebuilds it (spec §6.5); the base draws on.
      if (!abort.signal.aborted) console.warn(`[detailRegion] ${deps.id}: no region`, error);
    }
    loading = false;
    deps.requestRender();
  })();

  return {
    frame(eye, gatePxPerRad, frameIndex, nowMs) {
      return running?.frame(eye, gatePxPerRad, frameIndex, nowMs) ?? { draw: null, busy: loading };
    },
    destroy() {
      abort.abort();
      running?.destroy();
      running = null;
    },
  };
}

function runDetailRegion(
  deps: DetailRegionDeps,
  sidecar: VolumePyramidSidecar,
  format: VolumePyramidFormatRow,
  index: ArchiveIndex,
  grid: Vec3,
): DetailRegion {
  const { device, renderer, requestRender, id, binBaseName, bricksPerAxis } = deps;
  const { dims } = sidecar.dataBox;
  const geometry = { dims, bricksPerAxis, voxelMpc: sidecar.voxelMpc };
  // World to the stored box's local [0,1]³: the base's own placement, so a rotated frame needs no
  // second path.
  const toLocal = mat4.inverse(buildCubeModelMatrix(volumePyramidPlacement(sidecar, 1).placement));
  const brickBytes = levelByteLength(
    VOLUME_BRICK_EDGE,
    VOLUME_BRICK_EDGE,
    VOLUME_BRICK_EDGE,
    TEXTURE_BYTES_PER_TEXEL[format.gpuFormat]!,
  );
  // An all-zero ASTC block is an error block, so an empty brick is the format's zero block repeated.
  const zeroBrick = new Uint8Array(brickBytes);
  for (let at = 0; at < brickBytes; at += format.zeroBlock.length)
    zeroBrick.set(format.zeroBlock, at);

  const store = createBrickTextureStore(device, binBaseName, format, grid, bricksPerAxis);
  const stream = createTileStreamSubsystem<Uint8Array, BrickTextureStore>({
    slots: store,
    concurrency: DETAIL_REGION_FETCH_CONCURRENCY,
    requestRender,
    upload: (slots, slot, bytes) => slots.write(slot, bytes),
    release: () => {},
  });
  renderer.attachRegion(id, store.texture);

  let warnedNoRange = false;
  let warnedFailed = false;
  const fetchBrick = async (entry: ArchiveEntry): Promise<Uint8Array | null> => {
    const url = dataUrl(volumeBrickArchivePath(binBaseName, format.format, entry.part));
    const bytes = await fetchVolumeBrick(url, entry, brickBytes);
    if (bytes === 'no-range') {
      if (!warnedNoRange) console.warn(`[detailRegion] ${id}: ${url} ignored Range`);
      warnedNoRange = true;
      return null;
    }
    if (bytes === null && !warnedFailed) console.warn(`[detailRegion] ${id}: a brick failed`);
    warnedFailed ||= bytes === null;
    return bytes;
  };

  let state: DetailRegionState = { target: null, settled: null, fade: null, inReach: false };
  let lastEyeVox: Vec3 | null = null;
  let lastMs: number | null = null;

  return {
    frame(eye, gatePxPerRad, frameIndex, nowMs) {
      const local = vec3.transformMat4(eye, toLocal);
      const eyeVox = dims.map((d, a) => local[a]! * d) as Vec3;
      const travel = lastEyeVox ? Math.hypot(...eyeVox.map((v, a) => v - lastEyeVox![a]!)) : 0;
      const dt = lastMs === null ? 0 : nowMs - lastMs;
      lastEyeVox = eyeVox;
      lastMs = nowMs;

      const plan = planDetailRegion(state, {
        grid,
        dims,
        bricksPerAxis,
        eyeVox,
        // A pixel d voxels away spans d / pxPerRad voxels: beyond pxPerRad none is finer than one.
        gateVox: gatePxPerRad,
        held: (b) => stream.isLoaded(String(b)),
        failed: (b) => stream.isFailed(String(b)),
        rampStep: Math.max(dt / DETAIL_REGION_FADE_MS, travel / (VOLUME_BRICK_EDGE / 2)),
      });
      state = plan.state;

      for (const box of plan.shown) {
        for (const c of bricksOf(box)) stream.touch(String(brickId(c, grid)), frameIndex);
      }
      let zeroWrites = 0;
      plan.wanted.forEach((b, rank) => {
        const key = String(b);
        const entry = findArchiveEntry(index, b)!; // every id is listed (checked at load)
        if (entry.length === 0 && zeroWrites >= DETAIL_REGION_ZERO_BRICKS_PER_FRAME) return;
        if (stream.allocate(key, frameIndex, frameIndex) === null) return;
        if (entry.length === 0) {
          stream.upload(key, zeroBrick);
          zeroWrites++;
          return;
        }
        stream.enqueueFetch({
          key,
          priority: plan.wanted.length - rank,
          fetcher: () => fetchBrick(entry),
          onResult: (bytes) => {
            if (bytes) stream.upload(key, bytes);
          },
        });
      });
      return { draw: detailRegionDraw(state, geometry), busy: plan.busy };
    },
    destroy() {
      // Detach first: the renderer borrows the texture the stream's destroy frees.
      renderer.attachRegion(id, null);
      stream.destroy();
    },
  };
}
