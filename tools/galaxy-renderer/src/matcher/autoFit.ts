/**
 * autoFit — coordinate-descent optimiser that drives a `GalaxyEngineHandle`
 * toward a reference `GalaxyDescriptor`. Ported from the spike's
 * `galaxy-matcher.js`: for spirals/barred it first sweeps the discrete arm
 * count (1..6), accepting strictly-better counts as it goes, then runs
 * `passes` rounds of ±1D descent over `fitPlan`'s param ranges with a
 * shrinking step (`(hi-lo)·0.32·0.5^pass` per pass), accepting any trial that
 * beats the current loss by more than `1e-6`.
 *
 * One deliberate deviation from the spike: `engine.setParams` is awaited
 * before `grab` reads the frame. The spike's bespoke engine updated its
 * canvas synchronously enough for the race to not matter in practice, but
 * `GalaxyEngineHandle.setParams` packs the generation UBO and dispatches the
 * GPU compute passes, resolving only once that work is submitted — so
 * skipping the await would score whatever frame was on screen from the
 * *previous* candidate.
 *
 * Runs at a reduced `fitStars` budget (default 220000, well under the
 * spike's normal 600000) so each candidate renders fast enough for a live
 * fit loop; `finish()` restores the seed's full star count on the winning
 * params so the caller doesn't have to re-render before showing the result.
 */
import type { GalaxyEngineHandle } from '../../@types/engine/GalaxyEngineHandle';
import type { GalaxyDescriptor } from '../../@types/matcher/GalaxyDescriptor';
import type { GalaxyLegacyParams } from '../../../../src/@types/galaxy/GalaxyLegacyParams';
import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';
import type { GalaxySharedParams } from '../../../../src/@types/galaxy/GalaxySharedParams';
import type { GalaxyCategory } from '../../../../src/@types/galaxy/GalaxyCategory';
import type { AutoFitOptions } from '../../@types/matcher/AutoFitOptions';
import type { FitResult } from '../../@types/matcher/FitResult';
import type { NumericGalaxyParamKey } from '../../@types/matcher/NumericGalaxyParamKey';
import { GALAXY_LEGACY_PARAM_KEYS } from '../data/galaxyLegacyParamKeys';
import { fitPlan } from './fitPlan';
import { computeDescriptor } from './computeDescriptor';
import { descriptorLoss } from './descriptorLoss';

/**
 * A `GalaxyParams` copy with `legacy` pinned present (the descent always
 * carries a working star budget on it) and both bags' fields writable — the
 * arm-count sweep below mutates `shared.armCount` in place rather than
 * rebuilding the whole object on every accepted step.
 */
type MutableGalaxyParams = Omit<
  { -readonly [K in keyof GalaxyParams]: GalaxyParams[K] },
  'shared' | 'legacy'
> & {
  shared: { -readonly [K in keyof GalaxySharedParams]: GalaxySharedParams[K] };
  legacy: GalaxyLegacyParams;
};

function isLegacyParamKey(key: NumericGalaxyParamKey): boolean {
  return (GALAXY_LEGACY_PARAM_KEYS as ReadonlySet<string>).has(key);
}

/**
 * `fitPlan`'s param keys are `FitParamRange`'s `NumericGalaxyParamKey` — a
 * flat name filtered, at the type level, to fields whose value is a `number`
 * across BOTH `shared` and `legacy` — but which bag actually owns a given key
 * (and the field's value) is only known at runtime via
 * `GALAXY_LEGACY_PARAM_KEYS`, so plain dotted access can't be statically
 * typed here. These three helpers localise the one unsafe cast the generic
 * bag access needs; `FitParamRange` is what makes the cast reflect an actual
 * invariant rather than a type-system workaround — widen that type (e.g. back
 * to a bare `keyof GalaxySharedParams | keyof GalaxyLegacyParams`) and a key
 * naming a non-number field would again compile and get clobbered by a
 * scalar.
 */
function paramValue(p: GalaxyParams, key: NumericGalaxyParamKey): number {
  const bag = isLegacyParamKey(key) ? p.legacy : p.shared;
  return (bag as unknown as Record<string, number>)[key]!;
}
function setParamValue(p: MutableGalaxyParams, key: NumericGalaxyParamKey, v: number): void {
  const bag = isLegacyParamKey(key) ? p.legacy : p.shared;
  (bag as unknown as Record<string, number>)[key] = v;
}
function withParamValue(p: GalaxyParams, key: NumericGalaxyParamKey, v: number): GalaxyParams {
  return isLegacyParamKey(key)
    ? { ...p, legacy: { ...p.legacy, [key]: v } }
    : { ...p, shared: { ...p.shared, [key]: v } };
}

type Candidate = { readonly loss: number; readonly d: GalaxyDescriptor | null };

export async function autoFit(
  engine: GalaxyEngineHandle,
  reference: GalaxyDescriptor,
  seed: GalaxyParams,
  category: GalaxyCategory,
  opts: AutoFitOptions = {},
): Promise<FitResult> {
  const size = opts.size || 116;
  const passes = opts.passes || 3;
  const fitStars = opts.fitStars || 220000;
  const plan = fitPlan(category, reference.q);
  const params: MutableGalaxyParams = { ...seed, legacy: { ...seed.legacy, starCount: fitStars } };
  let iter = 0;
  const history: number[] = [];

  const score = async (pr: GalaxyParams): Promise<Candidate> => {
    await engine.setParams(pr);
    const { S, data } = await engine.grab(size);
    const d = computeDescriptor(data, S);
    if (!d) return { loss: 1e9, d: null };
    return { loss: descriptorLoss(reference, d, plan.w), d };
  };
  const yield_ = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

  let cur = await score(params);
  const report = async (note: string): Promise<void> => {
    history.push(cur.loss);
    if (opts.onStep) {
      opts.onStep({ iter, loss: cur.loss, params: { ...params }, desc: cur.d, note });
    }
    await yield_();
  };
  await report('start');

  const finish = (): FitResult => ({
    params: {
      ...params,
      legacy: { ...params.legacy, starCount: seed.legacy?.starCount || 600000 },
    },
    loss: cur.loss,
    desc: cur.d,
    iters: iter,
    history,
  });

  // discrete arm count first (spirals) — the loop restores params.shared.armCount
  // to the current best after every trial, per the spike, so a rejected
  // count doesn't leak into the next candidate's baseline.
  if (plan.arms) {
    let bestN = params.shared.armCount;
    let bestL = cur.loss;
    for (const n of plan.arms) {
      const trial = { ...params, shared: { ...params.shared, armCount: n } };
      const s = await score(trial);
      iter++;
      if (s.loss < bestL) {
        bestL = s.loss;
        bestN = n;
        cur = s;
      }
      params.shared.armCount = bestN;
      await report('arms=' + n);
      if (opts.signal && opts.signal.stop) return finish();
    }
    params.shared.armCount = bestN;
    cur = await score(params);
  }

  for (let pass = 0; pass < passes; pass++) {
    const frac = 0.32 * Math.pow(0.5, pass);
    for (const [key, lo, hi] of plan.params) {
      const step = (hi - lo) * frac;
      for (const dir of [1, -1]) {
        const v = Math.max(lo, Math.min(hi, paramValue(params, key) + dir * step));
        if (v === paramValue(params, key)) continue;
        const trial = withParamValue(params, key, v);
        const s = await score(trial);
        iter++;
        if (s.loss < cur.loss - 1e-6) {
          cur = s;
          setParamValue(params, key, v);
        }
        await report(key + (dir > 0 ? '+' : '-'));
        if (opts.signal && opts.signal.stop) return finish();
      }
    }
  }
  return finish();
}
