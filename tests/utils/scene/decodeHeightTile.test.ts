import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import type { HeightTile } from '../../../src/@types/scene/HeightTile';
import {
  HEIGHT_CODE_MAX,
  HEIGHT_POSTS_PER_TILE,
  HEIGHT_TILE_CHUNK_BYTES,
  HEIGHT_TILE_CHUNK_FOURCC,
  HEIGHT_TILE_POST_COUNT,
  HEIGHT_TILE_VERSION,
  HEIGHT_TILE_VERSION_OFFSET,
} from '../../../src/data/scene/heightTileFormat';
import { readRiffChunk } from '../../../src/utils/image/readRiffChunk';
import { mulberry32 } from '../../../src/utils/random/mulberry32';
import { codeHeightM } from '../../../src/utils/scene/codeHeightM';
import { decodeHeightTile } from '../../../src/utils/scene/decodeHeightTile';
import { heightCode } from '../../../src/utils/scene/heightCode';
import { encodeHeightTile } from '../../../tools/utils/textures/encodeHeightTile';

// Above 2^20 m an f32 is spaced 0.125 m, coarser than the 0.1 m step, so
// neighbouring codes collapse onto one float; no real relief comes near it.
const F32_EXACT_CODE_LIMIT = Math.floor((2 ** 20 + 32768) / 0.1);

function quantisedTile(): HeightTile {
  const heightM = new Float32Array(HEIGHT_TILE_POST_COUNT);
  const lo = heightCode(-430);
  const hi = heightCode(8848.9);
  for (let i = 0; i < heightM.length; i++) {
    heightM[i] = codeHeightM(lo + ((i * 7919) % (hi - lo + 1)));
  }
  heightM[0] = codeHeightM(lo);
  heightM[1] = codeHeightM(hi);
  return {
    subtreeMinM: Math.fround(-430),
    subtreeMaxM: Math.fround(8848.9),
    geometricResidualM: Math.fround(12.3),
    heightM,
  };
}

async function decodeWithSharp(bytes: Uint8Array): Promise<{ tile: HeightTile; rgb: Buffer }> {
  const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  const chunk = readRiffChunk(bytes, HEIGHT_TILE_CHUNK_FOURCC);
  if (!chunk) throw new Error('missing SHGT chunk');
  expect(info.channels).toBe(3);
  const pixels = { data, width: info.width, height: info.height, channels: 3 as const };
  return { tile: decodeHeightTile(pixels, chunk), rgb: data };
}

function expectSameTile(actual: HeightTile, expected: HeightTile): void {
  expect(Object.is(actual.subtreeMinM, expected.subtreeMinM)).toBe(true);
  expect(Object.is(actual.subtreeMaxM, expected.subtreeMaxM)).toBe(true);
  expect(Object.is(actual.geometricResidualM, expected.geometricResidualM)).toBe(true);
  for (let i = 0; i < HEIGHT_TILE_POST_COUNT; i++) {
    if (!Object.is(actual.heightM[i], expected.heightM[i])) {
      throw new Error(`post ${i}: ${actual.heightM[i]} !== ${expected.heightM[i]}`);
    }
  }
}

function validChunk(): Uint8Array {
  const chunk = new Uint8Array(HEIGHT_TILE_CHUNK_BYTES);
  const view = new DataView(chunk.buffer);
  view.setUint16(HEIGHT_TILE_VERSION_OFFSET, HEIGHT_TILE_VERSION, true);
  view.setUint16(2, HEIGHT_POSTS_PER_TILE, true);
  return chunk;
}

function flatPixels(size: number) {
  return { data: new Uint8Array(size * size * 3), width: size, height: size, channels: 3 as const };
}

describe('heightCode', () => {
  it('heightCode inverts codeHeightM across the code range', () => {
    const rand = mulberry32(42);
    const codes = [0, 1, 2 ** 23, F32_EXACT_CODE_LIMIT];
    for (let i = 0; i < 10_000; i++) codes.push(Math.floor(rand() * F32_EXACT_CODE_LIMIT));
    for (const c of codes) expect(heightCode(codeHeightM(c))).toBe(c);
    // Past the f32 limit codes are no longer unique, but quantising stays idempotent.
    for (const c of [F32_EXACT_CODE_LIMIT + 2, HEIGHT_CODE_MAX - 1, HEIGHT_CODE_MAX]) {
      expect(codeHeightM(heightCode(codeHeightM(c)))).toBe(codeHeightM(c));
    }
  });

  it('heightCode rejects a height below the offset, above the range, and NaN', () => {
    expect(() => heightCode(-32768.1)).toThrow(/range/);
    expect(() => heightCode(codeHeightM(HEIGHT_CODE_MAX) + 1)).toThrow(/range/);
    expect(() => heightCode(Number.NaN)).toThrow(/range/);
  });
});

describe('encodeHeightTile / decodeHeightTile', () => {
  it('round-trips a quantised tile bit-exactly through encode, sharp decode and decodeHeightTile', async () => {
    const tile = quantisedTile();
    const { tile: decoded } = await decodeWithSharp(await encodeHeightTile(tile));
    expectSameTile(decoded, tile);
  });

  it('decodes 4-channel pixels identically to 3-channel', async () => {
    const tile = quantisedTile();
    const bytes = await encodeHeightTile(tile);
    const { rgb } = await decodeWithSharp(bytes);
    const rgba = new Uint8ClampedArray(HEIGHT_TILE_POST_COUNT * 4);
    for (let i = 0; i < HEIGHT_TILE_POST_COUNT; i++) {
      rgba.set(rgb.subarray(i * 3, i * 3 + 3), i * 4);
      rgba[i * 4 + 3] = 255;
    }
    const chunk = readRiffChunk(bytes, HEIGHT_TILE_CHUNK_FOURCC)!;
    const pixels = { data: rgba, width: HEIGHT_POSTS_PER_TILE, height: HEIGHT_POSTS_PER_TILE };
    expectSameTile(decodeHeightTile({ ...pixels, channels: 4 }, chunk), tile);
  });

  it('encodeHeightTile refuses a post off the 0.1 m grid', async () => {
    const tile = quantisedTile();
    tile.heightM[500] = Math.fround(12.34);
    await expect(encodeHeightTile(tile)).rejects.toThrow(/off the height-code grid/);
  });

  it('encodeHeightTile refuses a wrong post count', async () => {
    const tile = { ...quantisedTile(), heightM: new Float32Array(128 * 128) };
    await expect(encodeHeightTile(tile)).rejects.toThrow(/posts/);
  });

  it('decodeHeightTile rejects a short chunk, a wrong version and a 128² image', () => {
    const pixels = flatPixels(HEIGHT_POSTS_PER_TILE);
    expect(() => decodeHeightTile(pixels, validChunk().subarray(0, 12))).toThrow(/bytes/);

    const wrongVersion = validChunk();
    new DataView(wrongVersion.buffer).setUint16(0, HEIGHT_TILE_VERSION + 1, true);
    expect(() => decodeHeightTile(pixels, wrongVersion)).toThrow(/version/);

    const wrongPosts = validChunk();
    new DataView(wrongPosts.buffer).setUint16(2, 128, true);
    expect(() => decodeHeightTile(pixels, wrongPosts)).toThrow(/posts/);

    expect(() => decodeHeightTile(flatPixels(128), validChunk())).toThrow(/image/);
  });
});
