/**
 * buildLenticularDust — S0's dust-poor nuclear disk plus the Sombrero
 * "hat-brim": a thin, patchy in-plane annulus gated on `dustRingStrength >
 * 0`. Ported from galaxy-model.js:553-583.
 *
 * The 34 cloud centres are drawn from the main `rand` stream up front,
 * unconditionally — even when the nuclear-dust budget itself is zero (e.g.
 * `dust: 0`) — exactly as the spike does, so a caller must not skip this
 * builder to "save" draws. The ring pass's budget and opacity are driven by
 * `dustRingStrength` alone, independent of `dust` — a Sombrero-style galaxy
 * can dial the nuclear disk to zero while keeping a strong ring.
 */
import type { DustField } from '../../../@types/model/DustField';
import type { GalaxyBuildContext } from '../../../@types/model/GalaxyBuildContext';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

const CLOUD_COUNT = 34;

export function buildLenticularDust(ctx: GalaxyBuildContext, field: DustField): void {
  const { params, rand, randNormal, outerRadius, bulgeRadius, diskHeight, grainScale, addDust } =
    ctx;
  const { dustMod, radialFalloff } = field;
  const dustAmount = params.dust ?? 1;

  const cloudCenters: Vec3[] = [];
  for (let c = 0; c < CLOUD_COUNT; c++) {
    const a = rand() * Math.PI * 2;
    const rr = bulgeRadius * (0.25 + 1.5 * rand() * rand());
    cloudCenters.push([Math.cos(a) * rr, Math.sin(a) * rr, rr]);
  }

  const nucDust = Math.floor((12000 * dustAmount) / (grainScale * grainScale));
  for (let i = 0; i < nucDust; i++) {
    const center = cloudCenters[i % CLOUD_COUNT]!;
    const spread = bulgeRadius * 0.22;
    const x = center[0] + randNormal() * spread;
    const z = center[1] + randNormal() * spread;
    const y = randNormal() * diskHeight * 0.5;
    const m = dustMod(x, y, z);
    if (!m.keep) continue;
    addDust(
      x,
      y,
      z,
      outerRadius * (0.007 + 0.012 * rand()) * grainScale * m.sz,
      (0.05 + 0.15 * rand()) * dustAmount * (0.3 + radialFalloff(center[2])) * m.op,
    );
  }

  const ringAmt = params.dustRingStrength ?? 0;
  if (!(ringAmt > 0)) return;

  const ringR = outerRadius * (params.dustRing ?? 0.72);
  const ringW = outerRadius * (params.dustRingWidth ?? 0.12);
  const ringN = Math.floor((34000 * ringAmt) / (grainScale * grainScale));
  for (let i = 0; i < ringN; i++) {
    const th = 2 * Math.PI * rand();
    const r = ringR + randNormal() * ringW;
    const x = r * Math.cos(th);
    const z = r * Math.sin(th);
    const y = randNormal() * diskHeight * 0.3;
    const m = dustMod(x, y, z);
    if (!m.keep) continue;
    addDust(
      x,
      y,
      z,
      outerRadius * (0.008 + 0.014 * rand()) * grainScale * m.sz,
      (0.2 + 0.3 * rand()) * ringAmt * m.op,
    );
  }
}
