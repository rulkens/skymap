import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import {
  downloadGetOnly,
  requiresConfirm,
  textureSourcesFor,
  type FetchTransport,
  type TextureSource,
} from '../../../tools/fetch/fetchTextures';
import { BMNG_QUADRANT_KEYS } from '../../../tools/utils/io/bmngQuadrantKeys';
import { BMNG_VINTAGE } from '../../../tools/utils/io/bmngVintage';
import { rawDataPath } from '../../../tools/utils/io/rawDataRegistry';
import { TEXTURE_SOURCES } from '../../../tools/utils/io/textureSources';

/** Destination basenames of a source list — the identity we assert on
 *  (paths are absolute, so the filename is the stable, readable key). */
function filenames(sources: readonly TextureSource[]): string[] {
  return sources.map((s) => basename(s.destPath));
}

/** The BMNG filenames carry the vintage stamp, and the vintage is a one-constant
 *  decision (`BMNG_VINTAGE`) — so these expectations interpolate it rather than
 *  restating a month, which would turn switching vintage into a test edit. What
 *  is asserted stays the SHAPE of the two subsets: which BMNG publications each
 *  mode pulls. */
const bmng = (variant: string): string => `world.topo.bathy.${BMNG_VINTAGE.stamp}.${variant}.jpg`;

describe('textureSourcesFor', () => {
  it('--dev selects exactly the 2k SSS variants + the NASA 5400x2700 sibling', () => {
    const dev = textureSourcesFor(true);
    expect(filenames(dev).sort()).toEqual(
      [
        '2k_mercury.jpg',
        '2k_venus_atmosphere.jpg',
        '2k_mars.jpg',
        '2k_jupiter.jpg',
        '2k_saturn.jpg',
        '2k_saturn_ring_alpha.png',
        '2k_uranus.jpg',
        '2k_neptune.jpg',
        '2k_moon.jpg',
        bmng('3x5400x2700'),
      ].sort(),
    );
  });

  it('the full pull selects the native tiers + both BMNG publications + the six USGS mosaics', () => {
    const full = textureSourcesFor(false);
    expect(filenames(full).sort()).toEqual(
      [
        '8k_mercury.jpg',
        '4k_venus_atmosphere.jpg',
        '8k_mars.jpg',
        // Jupiter and Saturn are 4096×2048 despite upstream's `8k_` filename;
        // the ring beside them genuinely is 8k.
        '4k_jupiter.jpg',
        '4k_saturn.jpg',
        '8k_saturn_ring_alpha.png',
        '2k_uranus.jpg',
        '2k_neptune.jpg',
        '8k_moon.jpg',
        bmng('3x21600x10800'),
        // The eight deep quadrants: read only by `build-earth-tiles`, but part of
        // the full pull, because a raw nothing can download is a raw that gets
        // curl'd by hand.
        ...Object.keys(BMNG_QUADRANT_KEYS).map((quadrant) => bmng(`3x21600x21600.${quadrant}`)),
        'world.watermask.21600x10800.png',
        'gebco_08_rev_elev_21600x10800.png',
        'ldem_16_uint.tif',
        'BlackMarble_2016_3km.jpg',
        'cloud_combined_8192.tif',
        'Io_GalileoSSI-Voyager_Global_Mosaic_ClrMerge_1km.tif',
        'Europa_Voyager_GalileoSSI_global_mosaic_500m.tif',
        'Ganymede_Voyager_GalileoSSI_Global_ClrMosaic_1435m.tif',
        'Callisto_Voyager_GalileoSSI_global_mosaic_1km.tif',
        'Pluto_NewHorizons_Global_Mosaic_300m_Jul2017_8bit.tif',
        'Charon_NewHorizons_Global_Mosaic_300m_Jul2017_8bit.tif',
        // Pluto's second (chroma) input and the true-colour reference its
        // calibration is fitted against: neither is a `native`, so both ride the
        // full pull the way the BMNG quadrants do (see CHROMA_SOURCES).
        'PIA11707.tif',
        'BIG_P_COLOR_2_TRUE_COLOR1.png',
      ].sort(),
    );
  });

  it('derives the dev URL by swapping the SSS resolution prefix, not a hand-typed link', () => {
    const dev = textureSourcesFor(true);
    const mars = dev.find((s) => basename(s.destPath) === '2k_mars.jpg');
    expect(mars?.url).toBe('https://www.solarsystemscope.com/textures/download/2k_mars.jpg');
  });

  it('never lists a source twice — one dest path per source in either mode', () => {
    for (const dev of [true, false]) {
      const paths = textureSourcesFor(dev).map((s) => s.destPath);
      expect(new Set(paths).size).toBe(paths.length);
    }
  });

  it('Uranus/Neptune resolve to their native 2k registry path in BOTH modes (2k IS the native tier)', () => {
    const devUranus = textureSourcesFor(true).find((s) => basename(s.destPath) === '2k_uranus.jpg');
    const fullUranus = textureSourcesFor(false).find(
      (s) => basename(s.destPath) === '2k_uranus.jpg',
    );
    expect(devUranus?.destPath).toBe(fullUranus?.destPath);
    expect(devUranus?.url).toBe(fullUranus?.url);
  });

  // Drift guard for the (body, kind) rewire: the full pull must fetch the native
  // raw of EVERY (body, kind) authored in TEXTURE_SOURCES, not just the `surface`
  // ones. It passes today (every kind is `surface`) and goes red the moment a
  // non-surface source row (Earth's `material`) is added but the fetch still
  // iterates surface-only — the exact regression this rewire prevents.
  it('the full pull covers every (body,kind) native in TEXTURE_SOURCES', () => {
    const destPaths = new Set(textureSourcesFor(false).map((s) => s.destPath));
    for (const [bodyId, kinds] of Object.entries(TEXTURE_SOURCES)) {
      for (const [kind, entry] of Object.entries(kinds)) {
        expect(destPaths.has(rawDataPath(entry.native)), `${bodyId}:${kind}`).toBe(true);
      }
    }
  });
});

/** A transport whose body streams `chunks` then closes cleanly. */
function completingTransport(chunks: Uint8Array[]): FetchTransport {
  return async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(c);
        controller.close();
      },
    }),
  });
}

/** A transport that emits `prefix`, then errors the stream mid-flight —
 *  the "connection dropped after a partial body" case. */
function erroringTransport(prefix: Uint8Array): FetchTransport {
  return async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(prefix);
        controller.error(new Error('connection reset mid-stream'));
      },
    }),
  });
}

describe('downloadGetOnly', () => {
  // The whole point of the .part -> renameSync dance: the final path only
  // ever appears when the body fully streamed. These drive that gate with a
  // fake transport, no network.
  it('a clean stream lands the exact bytes at the final path, leaving no .part behind', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fetchTextures-ok-'));
    try {
      const dest = join(dir, 'body.jpg');
      const bytes = new Uint8Array([1, 2, 3, 4, 5]);
      const { totalBytes } = await downloadGetOnly(
        'https://example.test/body.jpg',
        dest,
        completingTransport([bytes.subarray(0, 2), bytes.subarray(2)]),
      );
      expect(totalBytes).toBe(5);
      expect(new Uint8Array(readFileSync(dest))).toEqual(bytes);
      expect(existsSync(`${dest}.part`)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a stream that errors mid-flight never produces the final file (no truncated pass-through)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fetchTextures-err-'));
    try {
      const dest = join(dir, 'body.jpg');
      await expect(
        downloadGetOnly(
          'https://example.test/body.jpg',
          dest,
          erroringTransport(new Uint8Array([9, 9, 9])),
        ),
      ).rejects.toThrow();
      // The rename is gated on a clean finish — a half-streamed body must
      // not masquerade as a complete download. (A .part remnant is fine.)
      expect(existsSync(dest)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a non-2xx response throws and writes no final file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fetchTextures-404-'));
    try {
      const dest = join(dir, 'body.jpg');
      const notFound: FetchTransport = async () => ({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        body: null,
      });
      await expect(
        downloadGetOnly('https://example.test/missing.jpg', dest, notFound),
      ).rejects.toThrow(/404/);
      expect(existsSync(dest)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('requiresConfirm', () => {
  it('blocks the full pull unless --confirm is passed', () => {
    expect(requiresConfirm(false, false)).toBe(true); // full, no flag -> blocked
    expect(requiresConfirm(false, true)).toBe(false); // full, --confirm -> allowed
  });

  it('never blocks the --dev subset', () => {
    expect(requiresConfirm(true, false)).toBe(false);
    expect(requiresConfirm(true, true)).toBe(false);
  });
});
