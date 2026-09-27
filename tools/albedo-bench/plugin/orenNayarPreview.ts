/**
 * orenNayarPreview — the bench's lighting-preview relight factor, eye
 * straight down, normalised so flat ground under an overhead sun reads 1
 * (matching the renderer's own tile shading). Ported verbatim from the F4
 * prototype's `shadeFactor` (mars-terrain-feature worktree,
 * `.superpowers/sdd/2026-09-17-terrain-f4-mars/albedo-bench-prototype/lightjs.txt:139`);
 * preview only — F4 points the real constants at `MARS_SURFACE_SHADING` later.
 */
const DEG_TO_RAD = Math.PI / 180;

export function orenNayarPreview(
  sx: number,
  sy: number,
  light: {
    readonly azDeg: number;
    readonly elDeg: number;
    readonly roughness: number;
    readonly ambient: number;
  },
): number {
  // N ≈ (−sx, −sy, 1), normalised (design §4).
  const norm = Math.hypot(sx, sy, 1);
  const nx = -sx / norm;
  const ny = -sy / norm;
  const nz = 1 / norm;

  const az = light.azDeg * DEG_TO_RAD;
  const el = light.elDeg * DEG_TO_RAD;
  const lx = Math.cos(el) * Math.sin(az);
  const ly = Math.cos(el) * Math.cos(az);
  const lz = Math.sin(el);

  const s2 = light.roughness * light.roughness;
  const A = 1 - (0.5 * s2) / (s2 + 0.33);
  const B = (0.45 * s2) / (s2 + 0.09);

  const cosI = nx * lx + ny * ly + nz * lz;
  let v = 0;
  if (cosI > 0) {
    const cosR = nz; // eye straight down: view vector is (0, 0, 1)
    const hx = lx - nx * cosI,
      hy = ly - ny * cosI,
      hz = lz - nz * cosI;
    const vx = -nx * cosR,
      vy = -ny * cosR,
      vz = 1 - nz * cosR;
    const hl = Math.hypot(hx, hy, hz);
    const vl = Math.hypot(vx, vy, vz);
    const cosPhi = hl > 1e-6 && vl > 1e-6 ? (hx * vx + hy * vy + hz * vz) / (hl * vl) : 0;
    const ti = Math.acos(Math.min(1, cosI));
    const tr = Math.acos(Math.min(1, cosR));
    const alpha = Math.max(ti, tr);
    const beta = Math.min(ti, tr);
    v = (cosI * (A + B * Math.max(0, cosPhi) * Math.sin(alpha) * Math.tan(beta))) / A;
  }
  return light.ambient + (1 - light.ambient) * v;
}
