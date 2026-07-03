/**
 * buildSpiralArms — logarithmic spirals with per-arm personality, waviness,
 * along-arm clumping, secondary spurs, and inner/outer brightness tapers.
 * Ported from galaxy-model.js:282-401.
 *
 * A no-op for `budget.armStarCount <= 0` or `category === 'irregular'` —
 * mirroring the spike's own `if (armStarCount > 0 && category !== 'irregular')`
 * guard around the *entire* block (setup included), so a lenticular/S0 ctx
 * (armStarCount 0) draws nothing from any stream, not just skips the loop.
 * Irregular galaxies use `buildIrregularClumps` instead — they have no
 * exponential disk or logarithmic arms to spring from.
 *
 * The arm-clump and arm-wave noise streams are scoped to this builder alone
 * (model.js:295-296): `clumpSeed`/`waveSeed` seed two fresh `mulberry32`
 * streams here rather than sharing `ctx.rand`/`ctx.asymRand`, so dialling
 * "arm clumpiness" or "arm waviness" in isolation doesn't perturb any other
 * population's determinism. Per-arm personality (phase/pitch/weight/meander)
 * draws from `ctx.asymRand`, *continuing* the stream after
 * `createGalaxyBuildContext`'s four construction draws — draw order across
 * all four streams (main/asym/clump/wave) is part of the ported contract,
 * not an implementation detail.
 *
 * Two `continue` forms appear in the per-star loop and must not be conflated:
 * a clump-gap rejection (`clumpAmount > 0 && rand() > 0.4 + 0.6 * clumpMod`)
 * is a *skip* — it also skips that star's dust-seed draw, so the arm's final
 * record count legitimately undershoots `armStarCount` when clumping is on.
 * HII knots go the other way: they write 2-5 bonus stars (halo glow, core,
 * 1-3 newborns) *beyond* the one-star-per-iteration budget, coloured from
 * `ctx.hii`'s metallicity-driven core/halo palette.
 */
import { mulberry32 } from '../../../../../src/utils/random/mulberry32';
import { tempColor } from '../tempColor';
import type { BarGeometry } from '../../../@types/model/BarGeometry';
import type { DustSeed } from '../../../@types/model/DustSeed';
import type { GalaxyBuildContext } from '../../../@types/model/GalaxyBuildContext';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

export function buildSpiralArms(ctx: GalaxyBuildContext, bar: BarGeometry): DustSeed[] {
  const dustSeeds: DustSeed[] = [];
  const { budget, category } = ctx;
  if (!(budget.armStarCount > 0) || category === 'irregular') return dustSeeds;

  const {
    rand,
    randNormal,
    asymRand,
    asymmetry,
    params,
    outerRadius,
    bulgeRadius,
    diskHeight,
    applyLopsided,
    sampleDiskRadius,
    randomLuminosity,
    starSize,
    addStar,
    hii,
  } = ctx;

  const numArms = Math.max(1, Math.round(params.armCount || 2));
  const pitchDegrees = 8 + 26 * (params.armWinding ?? 0.5); // Sa tight -> Sc loose
  const windTightness = 1 / Math.tan((pitchDegrees * Math.PI) / 180);
  const armStartRadius = Math.max(
    category === 'barred' ? bar.barLength * 0.9 : bulgeRadius * 0.55,
    bulgeRadius * 0.4,
  );
  const armWidthFactor = 0.1 * (params.armWidth ?? 1);
  const subArmAmount = params.subArms ?? 0;
  const waveAmount = params.armWave ?? 0;
  const waveRand = mulberry32(((params.waveSeed ?? 0) | 0 || 777) >>> 0);
  const clumpRand = mulberry32(((params.clumpSeed ?? 0) | 0 || 911) >>> 0);

  const armFadeRadius = outerRadius * Math.max(0.5, 1.7 - 1.05 * (params.armFalloff ?? 0.6));
  const armFullRadius = armFadeRadius * 0.42;
  const armLengthVar = params.armEdgeVar ?? 0;
  const armInnerRampW = Math.max(bulgeRadius * 0.6, outerRadius * 0.14);
  const clumpAmount = params.armClump ?? 0.5;
  const hiiIntensity = params.hii ?? 1;
  const youngFraction = params.youngStars ?? 0.5;

  // Give each arm its own phase, pitch, weight, meander and noise so the
  // arms are not identical copies rotated around the centre.
  const armPhase: number[] = [];
  const armPitch: number[] = [];
  const armWeight: number[] = [];
  const meanderAmp: number[] = [];
  const meanderFreq: number[] = [];
  const meanderPhase: number[] = [];
  const clumpFreq1: number[] = [];
  const clumpPhase1: number[] = [];
  const clumpFreq2: number[] = [];
  const clumpPhase2: number[] = [];
  const waveFreq1: number[] = [];
  const wavePhase1: number[] = [];
  const waveFreq2: number[] = [];
  const wavePhase2: number[] = [];
  const armFadeRadiusPer: number[] = [];
  let weightSum = 0;
  for (let a = 0; a < numArms; a++) {
    armPhase[a] = (a / numArms) * Math.PI * 2 + (asymRand() * 2 - 1) * 0.38 * asymmetry;
    armPitch[a] = windTightness * (1 + (asymRand() * 2 - 1) * 0.3 * asymmetry);
    armWeight[a] = 1 + (asymRand() * 2 - 1) * 0.9 * asymmetry;
    weightSum += armWeight[a]!;
    meanderAmp[a] = asymmetry * (0.05 + 0.14 * asymRand());
    meanderFreq[a] = 1.2 + 1.6 * asymRand();
    meanderPhase[a] = asymRand() * Math.PI * 2;
    clumpFreq1[a] = 2 + 4 * clumpRand();
    clumpPhase1[a] = clumpRand() * Math.PI * 2;
    clumpFreq2[a] = 5 + 6 * clumpRand();
    clumpPhase2[a] = clumpRand() * Math.PI * 2;
    waveFreq1[a] = 3 + 4 * waveRand();
    wavePhase1[a] = waveRand() * Math.PI * 2;
    waveFreq2[a] = 8 + 8 * waveRand();
    wavePhase2[a] = waveRand() * Math.PI * 2;
    armFadeRadiusPer[a] = Math.max(
      armFullRadius * 1.3,
      armFadeRadius * (1 + (asymRand() * 2 - 1) * 0.55 * armLengthVar),
    );
  }

  const rgb: Vec3 = [0, 0, 0];

  for (let i = 0; i < budget.armStarCount; i++) {
    let radius = armStartRadius * 0.5 + sampleDiskRadius(); // smooth start, no pile-up ring
    // Pick which arm this star belongs to (weighted -> uneven arm densities).
    let pick = rand() * weightSum;
    let arm = 0;
    while (arm < numArms - 1 && pick > armWeight[arm]!) {
      pick -= armWeight[arm]!;
      arm++;
    }
    const logRadius = Math.log(radius / armStartRadius); // log spiral is linear in log-radius

    // Some stars belong to a fainter, broader secondary arm/spur offset
    // toward the inter-arm gap.
    const isSubArm = subArmAmount > 0 && rand() < subArmAmount * 0.6;
    let phase = armPhase[arm]!;
    let pitch = armPitch[arm]!;
    let widthMul = 1;
    let brightMul = 1;
    if (isSubArm) {
      const side = rand() < 0.5 ? 1 : -1;
      phase = armPhase[arm]! + side * (Math.PI / numArms) * (0.45 + 0.5 * rand());
      pitch = armPitch[arm]! * (0.82 + 0.42 * rand());
      widthMul = 1.8;
      brightMul = 0.62;
    }

    // Base log-spiral angle + slow meander + high-frequency waviness that
    // breaks the arm into a rippled curve rather than a perfect sweep.
    let angle =
      phase +
      pitch * logRadius +
      meanderAmp[arm]! * Math.sin(meanderFreq[arm]! * logRadius * 2 + meanderPhase[arm]!);
    if (waveAmount > 0) {
      angle +=
        waveAmount *
        (Math.sin(waveFreq1[arm]! * logRadius + wavePhase1[arm]!) * 0.16 +
          Math.sin(waveFreq2[arm]! * logRadius + wavePhase2[arm]!) * 0.09);
    }
    if (isSubArm) angle += randNormal() * 0.14; // extra feathering for spurs
    angle += randNormal() * armWidthFactor * widthMul * (1 + armStartRadius / radius);
    const perpOffset = randNormal() * armWidthFactor * widthMul * radius * 0.5;
    radius = applyLopsided(radius, angle);
    const x = radius * Math.cos(angle) - perpOffset * Math.sin(angle);
    const z = radius * Math.sin(angle) + perpOffset * Math.cos(angle);
    const y = randNormal() * diskHeight * 0.8;

    // Brightness envelope: fade IN near the arm start (no ring) and fade OUT
    // at this arm's own edge radius (steep drop at the rim). Both smoothstep.
    let innerT = (radius - armStartRadius) / armInnerRampW;
    innerT = innerT < 0 ? 0 : innerT > 1 ? 1 : innerT;
    let outerT = (radius - armFullRadius) / Math.max(0.001, armFadeRadiusPer[arm]! - armFullRadius);
    outerT = outerT < 0 ? 0 : outerT > 1 ? 1 : outerT;
    const armFade = innerT * innerT * (3 - 2 * innerT) * (1 - outerT * outerT * (3 - 2 * outerT));

    // Low-frequency modulation -> bright "beads" and faint gaps along the arm.
    let clumpMod = 1;
    if (clumpAmount > 0) {
      const noise =
        Math.sin(logRadius * clumpFreq1[arm]! + clumpPhase1[arm]!) * 0.6 +
        Math.sin(logRadius * clumpFreq2[arm]! + clumpPhase2[arm]!) * 0.4;
      clumpMod = 1 - clumpAmount * (0.5 - 0.5 * noise);
    }

    const isHiiRegion = rand() < 0.011 * hiiIntensity * (isSubArm ? 0.4 : 1);
    if (isHiiRegion) {
      // Physical size (1 world unit ~5,000 ly): a typical HII region is
      // ~150-400 ly and giant complexes (30 Doradus, NGC 604) ~1,000-1,500 ly,
      // vs a ~50,000 ly disk radius.
      const giant = Math.pow(rand(), 2.5);
      const coreSize = outerRadius * (0.006 + 0.022 * giant); // ~300 ly -> ~1,400 ly
      const coreBright = (1.4 + 1.2 * rand()) * (0.7 + 2.0 * giant) * hiiIntensity * armFade;
      addStar(x, y, z, hii.halo[0], hii.halo[1], hii.halo[2], coreSize * 1.9, coreBright * 0.22);
      const cv = 0.1 * rand();
      addStar(
        x,
        y,
        z,
        hii.core[0],
        Math.min(1, hii.core[1] + cv),
        Math.min(1, hii.core[2] + cv),
        coreSize,
        coreBright,
      );
      const newborns = 1 + ((rand() * 3) | 0);
      for (let b = 0; b < newborns; b++) {
        tempColor(0.86 + 0.12 * rand(), rgb);
        addStar(
          x + randNormal() * coreSize * 0.9,
          y + randNormal() * 0.05,
          z + randNormal() * coreSize * 0.9,
          rgb[0],
          rgb[1],
          rgb[2],
          starSize * 0.55,
          (1.1 + 0.7 * rand()) * armFade,
        );
      }
    } else {
      if (clumpAmount > 0 && rand() > 0.4 + 0.6 * clumpMod) continue; // real density gaps
      tempColor(0.6 + 0.36 * youngFraction + 0.1 * rand(), rgb); // hot blue-white arm stars
      addStar(
        x,
        y,
        z,
        rgb[0],
        rgb[1],
        rgb[2],
        starSize * (0.85 + 0.6 * rand()),
        randomLuminosity() * 1.9 * armFade * brightMul * clumpMod,
      );
    }
    // Seed a dust lane here (probability follows the arm brightness).
    if (rand() < 0.55 * armFade) dustSeeds.push({ x, y, z, radius, angle, armFade });
  }

  return dustSeeds;
}
