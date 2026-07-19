/**
 * bakeNormalMap — the build's FIRST derived/computed texture output (spec §9.3).
 *
 * Every other texture in the pipeline is a resize of fetched pixels; this one
 * COMPUTES new pixels: it Sobel-differentiates a single-channel elevation
 * heightfield into a tangent-space normal map, encoded as linear RG (the shader
 * reconstructs Z), so relief catches light without a displaced mesh. It is PURE
 * over plain typed arrays — no sharp, no fs — so it unit-tests against
 * hand-computed gradients. The Task-3 build wraps it: sharp reads the elevation
 * raw greyscale, this bakes, `writeLinearTier` tiers + writes the PNG.
 *
 * ## The Sobel kernel
 *
 * At each texel we estimate the heightfield's slope from its 3×3 neighbourhood
 * with the Sobel operator — a central difference smoothed by a (1,2,1) blur
 * across the perpendicular axis, so single-texel noise doesn't shatter the
 * gradient:
 *
 *     Sobel-X (∂/∂column)        Sobel-Y (∂/∂row)
 *       -1  0  +1                  -1 -2 -1
 *       -2  0  +2                   0  0  0
 *       -1  0  +1                  +1 +2 +1
 *
 * Height is normalized to [0,1] (byte / 255) so `exaggeration` means the same
 * thing regardless of the source's bit depth, and each weighted sum is divided
 * by 8 (the kernel's one-sided weight total, 1+2+1 = 4, times the ±1 central
 * span) to read as a per-texel derivative.
 *
 * ## RG encoding + Z reconstruction
 *
 * A heightfield h over tangent coordinates (u, v) has tangent T = (1,0,∂h/∂u)
 * and bitangent B = (0,1,∂h/∂v); the surface normal is N = T×B =
 * normalize(-∂h/∂u, -∂h/∂v, 1). We store only nx, ny (R, G); nz is always
 * positive and recoverable as sqrt(1 - nx² - ny²), so the shader (Task 4)
 * reconstructs it and B is left as a neutral +z hint. This halves the load-
 * bearing channels and lets a lossy tier never corrupt Z.
 *
 *     R = round((nx*0.5 + 0.5) * 255)   nx = -∂h/∂u * exaggeration (pre-normalize)
 *     G = round((ny*0.5 + 0.5) * 255)   ny = -∂h/∂v * exaggeration
 *     B = 255  (spare, neutral +z)      A  = 255  (opaque)
 *
 * ## Equirect edge rule — wrap x, clamp y (essential geometry, not a special case)
 *
 * The heightfield is an equirectangular map, and its edges are not free
 * boundaries: longitude is periodic (the ±180° meridian is a seam where column
 * -1 ≡ column width-1) and latitude terminates at the poles. So the kernel
 * WRAPS in x and CLAMPS in y. This is the same addressing the runtime sampler
 * uses — `addressModeU:'repeat'` / `addressModeV:'clamp-to-edge'`
 * (`earthRenderer.ts`) — so the baked map and the sampled map agree at the seam;
 * a clamp in x instead would smear a spurious gradient down the meridian.
 *
 * ## Row / sign convention (the one thing Task 5 verifies visually)
 *
 * Equirectangular imagery stores the north pole in its TOP row, so in the input
 * array the row index runs north→south as it increases (row 0 = north). The mesh
 * emits +v pointing north (v=0 south, v=1 north) and the albedo/normal textures
 * upload with `flipY:true`, so +v = north = DECREASING row index. The bitangent
 * gradient is therefore the NEGATIVE of the raw over-rows gradient:
 *
 *     gx = sobelX / 8            (∂h/∂u, +u = east = +column)
 *     gv = -(sobelY / 8)         (∂h/∂v, +v = north = -row)
 *
 * With this convention a heightfield rising toward the EAST tilts R below 128
 * (nx < 0), and one rising toward the SOUTH tilts G above 128 (ny > 0). Task 5's
 * visual pass is the final arbiter that this makes relief catch light on the
 * correct side of a ridge; the derivation here is stated so that pass has a
 * fixed thing to confirm rather than a coin to flip.
 */

/**
 * The gradient gain. Earth's real relief is imperceptible at true planetary
 * scale (Everest is ~0.001 of Earth's radius), so the baked slope is deliberately
 * amplified. This is the initial value; Task 5 tunes it against the lit sphere.
 */
export const DEFAULT_EXAGGERATION = 4;

/**
 * Sample the heightfield with equirect addressing: wrap the column (longitude
 * seam) and clamp the row (poles). Returns the byte value at the resolved texel.
 */
function sampleWrapClamp(
  data: Uint8Array,
  width: number,
  height: number,
  col: number,
  row: number,
): number {
  const c = ((col % width) + width) % width;
  const r = row < 0 ? 0 : row >= height ? height - 1 : row;
  // c ∈ [0,width) and r ∈ [0,height) by construction, so the index is in range.
  return data[r * width + c]!;
}

export function bakeNormalMap(
  height: { readonly data: Uint8Array; readonly width: number; readonly height: number },
  exaggeration: number,
): { data: Buffer; info: { width: number; height: number; channels: 4 } } {
  const { data, width, height: h } = height;
  const out = Buffer.allocUnsafe(width * h * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < width; x++) {
      // 3×3 neighbourhood, normalized to [0,1], with the equirect edge rule.
      const tl = sampleWrapClamp(data, width, h, x - 1, y - 1) / 255;
      const tc = sampleWrapClamp(data, width, h, x, y - 1) / 255;
      const tr = sampleWrapClamp(data, width, h, x + 1, y - 1) / 255;
      const ml = sampleWrapClamp(data, width, h, x - 1, y) / 255;
      const mr = sampleWrapClamp(data, width, h, x + 1, y) / 255;
      const bl = sampleWrapClamp(data, width, h, x - 1, y + 1) / 255;
      const bc = sampleWrapClamp(data, width, h, x, y + 1) / 255;
      const br = sampleWrapClamp(data, width, h, x + 1, y + 1) / 255;

      const sobelX = tr + 2 * mr + br - (tl + 2 * ml + bl);
      const sobelY = bl + 2 * bc + br - (tl + 2 * tc + tr); // over +row (southward)

      const gx = sobelX / 8; // ∂h/∂u  (+u = east)
      const gv = -(sobelY / 8); // ∂h/∂v  (+v = north = -row)

      const nxRaw = -gx * exaggeration;
      const nyRaw = -gv * exaggeration;
      const len = Math.hypot(nxRaw, nyRaw, 1);
      const nx = nxRaw / len;
      const ny = nyRaw / len;

      const i = (y * width + x) * 4;
      out[i] = Math.round((nx * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[i + 2] = 255; // spare — neutral +z hint
      out[i + 3] = 255; // opaque
    }
  }

  return { data: out, info: { width, height: h, channels: 4 } };
}
