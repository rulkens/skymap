/**
 * Parity guard: the tile constants mirrored into `bodies/earth/fragment.wesl`
 * must equal the authoritative TS exports in `earthTileParams.ts`.
 *
 * `?static` WESL linking is pure build-time TEXT linking with no value
 * injection, so the shader-side values are a hand mirror and nothing in the
 * toolchain compares them. A drift here is invisible in every other check and
 * catastrophic on screen: the window side is the divisor the fragment's cell
 * lookup clamps against, so a shader still on 128 after the TS side moved to 256
 * would address a quarter of the page table and read someone else's ground for
 * the rest. Same shape as the flow-field parity test beside this one.
 *
 * The same parse also guards the shader's debug switch, for the same reason: the
 * value that ships is a fact about the file that no compiler check can see.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  EARTH_EQUIRECT_BASE_WIDTH_PX,
  EARTH_TILE_ATLAS_SIDE,
  EARTH_TILE_PX,
  EARTH_TILE_WINDOW_SIDE,
} from '../../../../src/data/bodies/earthTileParams';

/** Every `const NAME: (u32|f32) = <number>;` in the Earth fragment. Derived
 *  constants (`TILE_SLOT_SCALE`, `TILE_HALF_TEXEL`) declare an expression rather
 *  than a literal, so they are not matched — which is the point: they cannot
 *  drift from the three below because they are computed from them. */
function parseWeslConstants(): Map<string, number> {
  const path = join(process.cwd(), 'src/services/gpu/shaders/bodies/earth/fragment.wesl');
  const text = readFileSync(path, 'utf-8');
  const re = /const\s+(\w+)\s*:\s*(?:u32|f32)\s*=\s*([0-9]+(?:\.[0-9]+)?)[uf]?\s*;/g;
  const map = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    map.set(m[1]!, parseFloat(m[2]!));
  }
  return map;
}

describe('earth/fragment.wesl ↔ earthTileParams.ts parity', () => {
  it('each mirrored WESL constant matches the TS export of the same name', () => {
    const wesl = parseWeslConstants();
    const cases: Array<[string, number]> = [
      ['EARTH_TILE_WINDOW_SIDE', EARTH_TILE_WINDOW_SIDE],
      ['EARTH_TILE_PX', EARTH_TILE_PX],
      ['EARTH_TILE_ATLAS_SIDE', EARTH_TILE_ATLAS_SIDE],
    ];
    for (const [name, tsValue] of cases) {
      const weslValue = wesl.get(name);
      expect(weslValue, `WESL constant ${name} is missing from earth/fragment.wesl`).toBeDefined();
      expect(weslValue, `WESL ${name} (${weslValue}) does not match TS ${name} (${tsValue})`).toBe(
        tsValue,
      );
    }
  });

  it('ships with the false-colour tile probe switched off', () => {
    // `TILE_DEBUG` is a probe a human flips while chasing a window bug, and its
    // non-zero arms replace the shaded surface with flat false colour. Nothing else
    // in the suite reads it, so a shader committed with the probe left on renders a
    // magenta-tinted Earth and every check still passes.
    expect(
      parseWeslConstants().get('TILE_DEBUG'),
      'earth/fragment.wesl has TILE_DEBUG left on — that draws the page table in false colour instead of Earth. Set it back to 0u.',
    ).toBe(0);
  });

  it('the tile edge equals the level-0 equirect width, which is what lets the shader use 1 << zWin', () => {
    // The fragment derives the window level's column count as `1u << zWin`. That
    // is the ladder's `(EARTH_EQUIRECT_BASE_WIDTH_PX << z) / tilePx` with the two
    // cancelled, and it cancels at this tile edge and at no other. Moving either
    // constant without the other silently puts every cell in the window a factor
    // of two out — with no error, and a picture that still looks like Earth.
    expect(EARTH_TILE_PX).toBe(EARTH_EQUIRECT_BASE_WIDTH_PX);
  });
});
