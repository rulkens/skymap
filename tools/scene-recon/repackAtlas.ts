#!/usr/bin/env node
/**
 * repack-atlas — re-packs one mesh asset's UV atlas with xatlas-wasm at a fixed
 * output size (`--group <id> --asset <assetId> --size 4096|2048`), publishing
 * the sibling `<assetId>-4k` / `-2k` (spec §3). A scale-1 fit blits the source
 * pixel-exact; a smaller fit resamples a pre-shrunk copy — exact-vs-resampled
 * follows from `fitAtlasScale`'s result, never a flag.
 */
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { blitChartsExact } from './atlas/blitChartsExact';
import { chartPlacements } from './atlas/chartPlacements';
import { dilateAtlas } from './atlas/dilateAtlas';
import { fitAtlasScale } from './atlas/fitAtlasScale';
import { packCharts, XATLAS_WASM_VERSION } from './atlas/packCharts';
import { paintOrphanBlocks } from './atlas/paintOrphanBlocks';
import { repackedGeometry } from './atlas/repackedGeometry';
import { resampleCharts } from './atlas/resampleCharts';
import { uvCoverage } from './crop/uvCoverage';
import { publishDerivedMesh } from './derive/publishDerivedMesh';
import { readSourceMesh } from './derive/readSourceMesh';
import { sceneGroupFromArgv } from './groups/sceneGroupFromArgv';
import { argValue } from '../utils/cli/argValue';
import type { AtlasImage } from './@types/AtlasImage';
import type { RepackAtlasReport } from './@types/RepackAtlasReport';
import type { SceneGroupDefinition } from './@types/SceneGroupDefinition';

const JPEG_QUALITY = 90;

export async function repackAtlas(
  group: SceneGroupDefinition,
  assetId: string,
  sizePx: 2048 | 4096,
): Promise<RepackAtlasReport> {
  const { source, geometry } = await readSourceMesh(group, assetId);

  const meta = await sharp(geometry.image.bytes).metadata();
  const sourceSizePx = meta.width ?? 0;
  if (sourceSizePx === 0 || sourceSizePx !== meta.height) {
    throw new Error(`repackAtlas: source atlas must be square, got ${meta.width}x${meta.height}`);
  }

  const usedTexels = uvCoverage(geometry.uvs, geometry.indices) * sourceSizePx * sourceSizePx;
  const { scale, packed } = await fitAtlasScale(sizePx, usedTexels, (trial) =>
    packCharts(geometry.uvs, geometry.indices, sourceSizePx, sizePx, trial),
  );

  const { data: sourceRgb } = await sharp(geometry.image.bytes)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sourceImage: AtlasImage = { sizePx: sourceSizePx, rgb: sourceRgb };

  const placements = chartPlacements(packed, geometry.uvs, sourceSizePx, scale);

  let atlas: AtlasImage;
  let claims: Int32Array;
  if (scale === 1) {
    ({ atlas, claims } = blitChartsExact(sourceImage, packed, placements, sizePx));
  } else {
    const shrunkSizePx = Math.round(sourceSizePx * scale);
    const { data: shrunkRgb } = await sharp(geometry.image.bytes)
      .removeAlpha()
      .resize(shrunkSizePx, shrunkSizePx, { fit: 'fill', kernel: 'lanczos3' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const shrunk: AtlasImage = { sizePx: shrunkSizePx, rgb: shrunkRgb };
    ({ atlas, claims } = resampleCharts(shrunk, sourceSizePx, packed, placements, sizePx));
  }

  const { uvPxByVertex, blocks: orphanBlocks } = paintOrphanBlocks(
    atlas,
    claims,
    sourceImage,
    packed,
    geometry.uvs,
  );
  dilateAtlas(atlas, claims);

  const jpeg = await sharp(atlas.rgb, { raw: { width: sizePx, height: sizePx, channels: 3 } })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  const derivedGeometry = repackedGeometry(
    geometry,
    sourceSizePx,
    packed,
    placements,
    uvPxByVertex,
    sizePx,
    { bytes: jpeg, mimeType: 'image/jpeg' },
  );

  const asset = await publishDerivedMesh(group, source, {
    idSuffix: sizePx === 4096 ? '4k' : '2k',
    labelSuffix: sizePx === 4096 ? '4K atlas' : '2K atlas',
    step: {
      step: 'repackAtlas',
      version: `${sizePx}@${scale.toFixed(3)} xatlas-wasm@${XATLAS_WASM_VERSION} q${JPEG_QUALITY}`,
    },
    geometry: derivedGeometry,
  });

  return {
    asset,
    sizePx,
    scale,
    chartCount: packed.chartCount,
    orphanVertices: packed.vertices.filter((v) => v.chartIndex < 0).length,
    orphanBlocks,
    bytes: jpeg.length,
    sourceBytes: geometry.image.bytes.length,
  };
}

async function main(): Promise<void> {
  const group = sceneGroupFromArgv(process.argv);
  const assetId = argValue(process.argv, '--asset');
  if (!assetId) throw new Error('repackAtlas: --asset <assetId> is required');

  const sizeArg = argValue(process.argv, '--size');
  let sizePx: 2048 | 4096;
  if (sizeArg === '4096') sizePx = 4096;
  else if (sizeArg === '2048') sizePx = 2048;
  else throw new Error(`repackAtlas: --size must be 2048 or 4096, got ${sizeArg}`);

  const report = await repackAtlas(group, assetId, sizePx);
  const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(2);
  process.stderr.write(
    `repackAtlas: ${assetId} → ${report.asset.id} ${report.sizePx}² scale ${report.scale.toFixed(3)} | ` +
      `${report.chartCount.toLocaleString()} charts, ${report.orphanVertices.toLocaleString()} orphan verts ` +
      `(${report.orphanBlocks} block${report.orphanBlocks === 1 ? '' : 's'}) | ` +
      `${report.asset.triangleCount.toLocaleString()} tris | ${mb(report.bytes)} MB (source ${mb(report.sourceBytes)} MB)\n`,
  );
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
