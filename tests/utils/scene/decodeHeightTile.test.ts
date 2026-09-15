import { describe, expect, it } from 'vitest';

import {
  HEIGHT_POSTS_PER_TILE,
  HEIGHT_TILE_BYTES,
  HEIGHT_TILE_HEADER_BYTES,
  HEIGHT_TILE_MAGIC,
  HEIGHT_TILE_POST_COUNT,
  HEIGHT_TILE_VERSION,
} from '../../../src/data/scene/heightTileFormat';
import { decodeHeightTile } from '../../../src/utils/scene/decodeHeightTile';
import { encodeHeightTile } from '../../../tools/utils/textures/encodeHeightTile';

function sampleHeights(): Float32Array {
  const heightM = new Float32Array(HEIGHT_TILE_POST_COUNT);
  for (let i = 0; i < heightM.length; i++) heightM[i] = Math.fround(Math.sin(i) * 3000);
  return heightM;
}

describe('decodeHeightTile', () => {
  it('round-trips a tile through encode/decode', () => {
    const heightM = sampleHeights();
    const bytes = encodeHeightTile({
      subtreeMinM: -431.5,
      subtreeMaxM: 8848.25,
      geometricResidualM: 12.5,
      heightM,
    });
    expect(bytes.byteLength).toBe(HEIGHT_TILE_BYTES);

    const tile = decodeHeightTile(bytes.buffer as ArrayBuffer, bytes.byteOffset);
    expect(tile.subtreeMinM).toBe(-431.5);
    expect(tile.subtreeMaxM).toBe(8848.25);
    expect(tile.geometricResidualM).toBe(12.5);
    for (let i = 0; i < heightM.length; i++) {
      expect(Object.is(tile.heightM[i], heightM[i])).toBe(true);
    }
  });

  it('decodes from an unaligned byteOffset', () => {
    const bytes = encodeHeightTile({
      subtreeMinM: 0,
      subtreeMaxM: 1,
      geometricResidualM: 0,
      heightM: sampleHeights(),
    });
    const shifted = new Uint8Array(HEIGHT_TILE_BYTES + 2);
    shifted.set(bytes, 2);

    const tile = decodeHeightTile(shifted.buffer as ArrayBuffer, 2);
    expect(tile.subtreeMaxM).toBe(1);
    expect(tile.heightM[7]).toBe(Math.fround(Math.sin(7) * 3000));
  });

  it('rejects a payload with a non-finite post', () => {
    for (const bad of [Number.NaN, Number.NEGATIVE_INFINITY]) {
      const heightM = sampleHeights();
      heightM[1234] = bad;
      const bytes = encodeHeightTile({
        subtreeMinM: 0,
        subtreeMaxM: 0,
        geometricResidualM: 0,
        heightM,
      });
      expect(() => decodeHeightTile(bytes.buffer as ArrayBuffer, bytes.byteOffset)).toThrow(
        /non-finite/,
      );
    }
  });

  it('rejects a wrong magic', () => {
    const bytes = encodeHeightTile({
      subtreeMinM: 0,
      subtreeMaxM: 0,
      geometricResidualM: 0,
      heightM: sampleHeights(),
    });
    new DataView(bytes.buffer, bytes.byteOffset).setUint32(0, 0x44464353, true);
    expect(() => decodeHeightTile(bytes.buffer as ArrayBuffer, bytes.byteOffset)).toThrow(/magic/);
  });

  it('rejects a wrong version', () => {
    const bytes = encodeHeightTile({
      subtreeMinM: 0,
      subtreeMaxM: 0,
      geometricResidualM: 0,
      heightM: sampleHeights(),
    });
    new DataView(bytes.buffer, bytes.byteOffset).setUint16(4, HEIGHT_TILE_VERSION + 1, true);
    expect(() => decodeHeightTile(bytes.buffer as ArrayBuffer, bytes.byteOffset)).toThrow(
      /version/,
    );
  });

  it('rejects a truncated payload', () => {
    const bytes = encodeHeightTile({
      subtreeMinM: 0,
      subtreeMaxM: 0,
      geometricResidualM: 0,
      heightM: sampleHeights(),
    });
    const short = bytes.slice(0, HEIGHT_TILE_BYTES - 4);
    expect(() => decodeHeightTile(short.buffer as ArrayBuffer, short.byteOffset)).toThrow(/bytes/);
  });

  // The on-disk byte table itself (spec §5.3): written by hand at the
  // documented offsets, so a re-ordered header fails here and nowhere else.
  it('reads the header fields at their documented offsets', () => {
    const buf = new ArrayBuffer(HEIGHT_TILE_BYTES);
    const view = new DataView(buf);
    view.setUint32(0, HEIGHT_TILE_MAGIC, true);
    view.setUint16(4, HEIGHT_TILE_VERSION, true);
    view.setUint16(6, HEIGHT_POSTS_PER_TILE, true);
    view.setUint16(8, HEIGHT_POSTS_PER_TILE, true);
    view.setUint16(10, 0, true);
    view.setFloat32(12, -100.5, true);
    view.setFloat32(16, 200.25, true);
    view.setFloat32(20, 3.75, true);
    view.setFloat32(HEIGHT_TILE_HEADER_BYTES, 42.5, true);
    view.setFloat32(HEIGHT_TILE_BYTES - 4, -7.25, true);

    expect(HEIGHT_TILE_HEADER_BYTES).toBe(24);
    expect(HEIGHT_TILE_BYTES).toBe(66588);
    const tile = decodeHeightTile(buf);
    expect(tile.subtreeMinM).toBe(-100.5);
    expect(tile.subtreeMaxM).toBe(200.25);
    expect(tile.geometricResidualM).toBe(3.75);
    expect(tile.heightM.length).toBe(HEIGHT_TILE_POST_COUNT);
    expect(tile.heightM[0]).toBe(42.5);
    expect(tile.heightM[HEIGHT_TILE_POST_COUNT - 1]).toBe(-7.25);
  });

  it('rejects a post count the header disagrees with', () => {
    const bytes = encodeHeightTile({
      subtreeMinM: 0,
      subtreeMaxM: 0,
      geometricResidualM: 0,
      heightM: sampleHeights(),
    });
    new DataView(bytes.buffer, bytes.byteOffset).setUint16(6, 128, true);
    expect(() => decodeHeightTile(bytes.buffer as ArrayBuffer, bytes.byteOffset)).toThrow(/posts/);
  });
});
