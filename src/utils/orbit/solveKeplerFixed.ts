/**
 * solveKeplerFixed — E from M = E − e·sin E in a fixed number of steps, the exact algorithm
 * `shaders/lib/kepler.wesl` runs, so the CPU mirror and the GPU agree step for step. A fixed count
 * suits the GPU (no divergent loop) and Danby's start E₀ = M + 0.85·e·sign(M) keeps 5 Halley steps
 * enough up to e = 0.99; the |ΔE| ≤ 1 clamp stops an overshoot near e → 1, M → 0. `round` emulates
 * f32 in tests (pass Math.fround). E is on the branch of M reduced to [−π, π].
 */
const STEPS = 5;
const MAX_STEP = 1;

export function solveKeplerFixed(
  meanAnomalyRad: number,
  e: number,
  round: (x: number) => number = (x) => x,
): number {
  const r = round;
  const TAU = r(2 * Math.PI);
  const m = r(meanAnomalyRad - r(TAU * Math.floor(r(r(meanAnomalyRad / TAU) + 0.5))));
  let E = r(m + r(r(0.85 * e) * Math.sign(m)));
  for (let k = 0; k < STEPS; k++) {
    const s = r(e * r(Math.sin(E)));
    const c = r(e * r(Math.cos(E)));
    const f = r(r(E - s) - m);
    const df = r(1 - c);
    const step = r(f / r(df - r(r(f * s) / r(2 * df))));
    E = r(E - Math.min(MAX_STEP, Math.max(-MAX_STEP, step)));
  }
  return E;
}
