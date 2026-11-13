// antiqueLook/decor/vertex.wesl — the ornaments, SCATTERED: one instanced quad per
// placed ornament, turned and sized as `placeAntiqueOrnaments` placed it, its
// atlas rect sampled only where it lands. Max-blended into two rows the plate
// reads with one tap each (a per-pixel loop over the list cost ~0.9 ms):
//   `antique-decor`   r figure ink, g plate ink, b clear-to-paper, a wash;
//   `antique-decor-hue` rgb the wash's pigment.
// Edges fade over the outer tenth so a cropped engraving never ends square.

import package::antiqueLook::io::AntiqueUniforms;
import package::antiqueLook::shared::ornaments::AntiqueOrnaments;
import package::antiqueLook::decor::io::DecorOut;

@group(0) @binding(0) var<uniform> u: AntiqueUniforms;
@group(0) @binding(1) var<uniform> orn: AntiqueOrnaments;

/** A figure's lattice: cells a side (`ANTIQUE_ORNAMENT_GRID`), and its points padded to whole vec4s (82). */
const GRID: u32 = 8u;
const GRID_POINTS: u32 = 82u;

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> DecorOut {
  var o: DecorOut;
  o.pos = vec4<f32>(2.0, 2.0, 0.0, 1.0);
  o.item = ii;
  if (ii >= orn.count) {
    return o;
  }
  // A triangle strip over the lattice: a strip per cell row, joined by two
  // degenerate vertices (the row's last, the next row's first).
  let perRow = 2u * GRID + 4u;
  let k = vi % perRow;
  let band = vi / perRow;
  let tail = k >= 2u * GRID + 2u;
  let col = select(k >> 1u, select(GRID, 0u, k == 2u * GRID + 3u), tail);
  let row = band + select(k & 1u, 1u, tail);
  let cell = vec2<f32>(f32(col), f32(row)) / f32(GRID);
  let local = cell * 2.0 - 1.0;
  var px: vec2<f32>;
  if (orn.items[ii].gridded > 0.5) {
    // A sky figure: the lattice corner, already through the view's projection.
    let at = ii * GRID_POINTS + row * (GRID + 1u) + col;
    let pair = orn.grid[at >> 1u];
    px = select(pair.xy, pair.zw, (at & 1u) == 1u);
  } else {
    let rot = orn.items[ii].rot;
    let half = orn.items[ii].half;
    // The plate's inverse: screen y runs down, so a counter-clockwise turn by θ
    // sends the sprite's right to (cos θ, −sin θ) and its down to (sin θ, cos θ).
    px = orn.items[ii].centre
      + vec2<f32>(rot.x, -rot.y) * local.x * half.x
      + vec2<f32>(rot.y, rot.x) * local.y * half.y;
  }
  o.pos = vec4<f32>(px.x / u.res.x * 2.0 - 1.0, 1.0 - px.y / u.res.y * 2.0, 0.0, 1.0);
  o.local = local;
  return o;
}
