import { describe, it, expect } from 'vitest';
import { basename } from 'node:path';

import {
  requiresConfirm,
  textureSourcesFor,
  type TextureSource,
} from '../../../tools/fetch/fetchTextures';

/** Destination basenames of a source list — the identity we assert on
 *  (paths are absolute, so the filename is the stable, readable key). */
function filenames(sources: readonly TextureSource[]): string[] {
  return sources.map((s) => basename(s.destPath));
}

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
        'world.topo.bathy.200412.3x5400x2700.jpg',
      ].sort(),
    );
  });

  it('the full pull selects the native tiers + full BMNG + the four USGS moons', () => {
    const full = textureSourcesFor(false);
    expect(filenames(full).sort()).toEqual(
      [
        '8k_mercury.jpg',
        '4k_venus_atmosphere.jpg',
        '8k_mars.jpg',
        '8k_jupiter.jpg',
        '8k_saturn.jpg',
        '8k_saturn_ring_alpha.png',
        '2k_uranus.jpg',
        '2k_neptune.jpg',
        '8k_moon.jpg',
        'world.topo.bathy.200412.3x21600x10800.jpg',
        'Io_GalileoSSI-Voyager_Global_Mosaic_ClrMerge_1km.tif',
        'Europa_Voyager_GalileoSSI_global_mosaic_500m.tif',
        'Ganymede_Voyager_GalileoSSI_Global_ClrMosaic_1435m.tif',
        'Callisto_Voyager_GalileoSSI_global_mosaic_1km.tif',
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
