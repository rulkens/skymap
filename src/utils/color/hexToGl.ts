/**
 * hexToGl — parse a `#RRGGBB` or `#RRGGBBAA` hex colour string into a
 * GL-ready normalized `Vec4` `[r, g, b, a]` with each channel in `[0, 1]`.
 *
 * Lets call-sites that read more naturally as `#FFAA55` skip the
 * `[1, 0.667, 0.333, 1]` mental conversion and the eyeball-defeating
 * `[0.7, 0.6, 0.28]` decimal triplets that dot the renderer subsystems.
 *
 * Format rules:
 *   - Leading `#` is required.
 *   - 6 hex chars (`#RRGGBB`) → alpha defaults to 1.
 *   - 8 hex chars (`#RRGGBBAA`) → alpha taken from the trailing pair.
 *   - Case-insensitive (`#ff` and `#FF` both parse).
 *   - Short forms (`#RGB`, `#RGBA`) are NOT supported — see the
 *     HexString docstring for why.
 *
 * Throws on any other shape rather than silently returning a wrong
 * colour: a bad hex literal in a renderer style table is something the
 * author wants to know about loudly at startup, not after spending an
 * hour wondering why a label looks black.
 */

import type { Vec4 } from '../../@types/math/Vec4';
import type { HexString } from '../../@types/math/HexString';

export function hexToGl(hex: HexString): Vec4 {
  // The template-literal type already enforces the leading `#`; the
  // runtime check covers the parts TS can't (length and hex digits).
  // Throwing rather than returning a sentinel keeps the API total —
  // every successful call returns a usable Vec4.
  if (hex.length !== 7 && hex.length !== 9) {
    throw new Error(
      `hexToGl: expected #RRGGBB or #RRGGBBAA, got ${hex} (length ${hex.length})`,
    );
  }
  const body = hex.slice(1);
  if (!/^[0-9a-fA-F]+$/.test(body)) {
    throw new Error(`hexToGl: non-hex character in ${hex}`);
  }
  const r = parseInt(body.slice(0, 2), 16) / 255;
  const g = parseInt(body.slice(2, 4), 16) / 255;
  const b = parseInt(body.slice(4, 6), 16) / 255;
  const a = body.length === 8 ? parseInt(body.slice(6, 8), 16) / 255 : 1;
  return [r, g, b, a];
}
