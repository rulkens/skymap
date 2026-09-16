import { describe, expect, it } from 'vitest';

import { readRiffChunk } from '../../../src/utils/image/readRiffChunk';

type Chunk = { fourcc: string; payload: number[] };

// Hand-built RIFF so the pad-byte rule is exercised independently of the encoder.
function riffWebp(chunks: Chunk[]): Uint8Array {
  const body: number[] = [];
  for (const { fourcc, payload } of chunks) {
    const n = payload.length;
    body.push(...ascii(fourcc), n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24);
    body.push(...payload);
    if (n & 1) body.push(0xee);
  }
  const size = body.length + 4;
  return Uint8Array.from([
    ...ascii('RIFF'),
    size & 0xff,
    (size >> 8) & 0xff,
    0,
    0,
    ...ascii('WEBP'),
    ...body,
  ]);
}

function ascii(s: string): number[] {
  return [...s].map((ch) => ch.charCodeAt(0));
}

describe('readRiffChunk', () => {
  it('readRiffChunk returns null for non-RIFF bytes (an HTML error page) and for a WebP without the chunk', () => {
    const html = new TextEncoder().encode('<!doctype html><title>404</title>');
    expect(readRiffChunk(html, 'SHGT')).toBeNull();
    expect(readRiffChunk(riffWebp([{ fourcc: 'VP8L', payload: [1, 2, 3, 4] }]), 'SHGT')).toBeNull();
  });

  it('readRiffChunk skips the pad byte after an odd-sized chunk', () => {
    const bytes = riffWebp([
      { fourcc: 'VP8L', payload: [1, 2, 3] },
      { fourcc: 'SHGT', payload: [9, 8, 7, 6] },
    ]);
    expect(Array.from(readRiffChunk(bytes, 'SHGT') ?? [])).toEqual([9, 8, 7, 6]);
  });
});
