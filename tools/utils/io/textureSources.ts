/**
 * textureSources — one row per `(body|ring, kind)` naming the raw file that
 * feeds it; `fetchTextures` (download) and `buildTextures` (tier) both derive
 * from THIS table, so the two can't drift.
 *
 * `as const` is load-bearing, not style: `RawDataEntry.upstream` is OPTIONAL on
 * the union and narrows to `string` only for a LITERAL key.
 */

import type { BodyTextureId } from '../../../src/@types/data/BodyTextureId';
import type { RingTextureId } from '../../../src/@types/data/RingTextureId';
import type { TextureKind } from '../../../src/@types/data/TextureKind';
import type { RawDataKey } from './rawDataRegistry';

/**
 * `--dev` variant: its own registry row (`devKey`) or a loose file in
 * `textures.dir` (`devFilename`); the USGS moons have neither. `chroma` is a
 * `panSharpen` body's SECOND input — `native` is luminance, `chroma` is hue.
 */
export type TextureSourceEntry = {
  readonly native: RawDataKey;
  readonly devKey?: RawDataKey;
  readonly devFilename?: string;
  readonly chroma?: RawDataKey;
};

// Uranus/Neptune keep a `devFilename` though their native IS the 2k file: fetch
// swap and build candidate both resolve back to native — a no-op, not a second
// download.
export const TEXTURE_SOURCES = {
  mercury: { surface: { native: 'textures.sssMercury8k', devFilename: '2k_mercury.jpg' } },
  venus: { surface: { native: 'textures.sssVenus4k', devFilename: '2k_venus_atmosphere.jpg' } },
  earth: {
    surface: { native: 'textures.nasaBmng', devKey: 'textures.nasaBmngDev' },
    night: { native: 'textures.earthNight' },
    material: { native: 'textures.earthWaterMask' },
    // `normal`'s `native` is the ELEVATION heightfield, not the normal map's own
    // pixels — the build bakes a Sobel gradient from it (same for the Moon below).
    normal: { native: 'textures.earthElevation' },
    clouds: { native: 'textures.earthClouds' },
  },
  mars: { surface: { native: 'textures.sssMars8k', devFilename: '2k_mars.jpg' } },
  jupiter: { surface: { native: 'textures.sssJupiter4k', devFilename: '2k_jupiter.jpg' } },
  saturn: { surface: { native: 'textures.sssSaturn4k', devFilename: '2k_saturn.jpg' } },
  uranus: { surface: { native: 'textures.sssUranus2k', devFilename: '2k_uranus.jpg' } },
  neptune: { surface: { native: 'textures.sssNeptune2k', devFilename: '2k_neptune.jpg' } },
  moon: {
    surface: { native: 'textures.sssMoon8k', devFilename: '2k_moon.jpg' },
    normal: { native: 'textures.moonElevation' },
  },
  io: { surface: { native: 'textures.usgsIo' } },
  europa: { surface: { native: 'textures.usgsEuropa' } },
  ganymede: { surface: { native: 'textures.usgsGanymede' } },
  callisto: { surface: { native: 'textures.usgsCallisto' } },
  // Pluto's chroma map is enhanced, not natural, colour (grounds in its
  // `RAW_DATA` row); the `panSharpen` calibration undoes that stretch.
  pluto: { surface: { native: 'textures.usgsPluto', chroma: 'textures.nasaPlutoColor' } },
  charon: { surface: { native: 'textures.usgsCharon' } },
  'saturn-ring': {
    surface: { native: 'textures.sssRing', devFilename: '2k_saturn_ring_alpha.png' },
  },
} as const satisfies Record<
  BodyTextureId | RingTextureId,
  Partial<Record<TextureKind, TextureSourceEntry>>
>;

/** One value of `TEXTURE_SOURCES`, key literals intact — from `typeof`, not the
 *  widened `TextureSourceEntry`, which loses the `upstream` narrowing above. */
export type TextureSourceRow = {
  [Body in keyof typeof TEXTURE_SOURCES]: (typeof TEXTURE_SOURCES)[Body][keyof (typeof TEXTURE_SOURCES)[Body]];
}[keyof typeof TEXTURE_SOURCES];
