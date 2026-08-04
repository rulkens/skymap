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
import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';
import type { GalaxyCategory } from '../../../../src/@types/galaxy/GalaxyCategory';
import type { AutoFitOptions } from '../../@types/matcher/AutoFitOptions';
import type { FitResult } from '../../@types/matcher/FitResult';
import { fitPlan } from './fitPlan';
import { computeDescriptor } from './computeDescriptor';
import { descriptorLoss } from './descriptorLoss';

/** A `GalaxyParams` copy with the `readonly` modifiers stripped, so the
 * descent loop can mutate its working set of params in place instead of
 * rebuilding the whole object on every accepted step. */
type MutableGalaxyParams = { -readonly [K in keyof GalaxyParams]: GalaxyParams[K] };

/**
 * `fitPlan`'s param keys are `FitParamRange`'s `NumericGalaxyParamKey` — a
 * key filtered, at the type level, to fields whose value is a `number` — but
 * the field being read/written is only known at runtime (it comes off the
 * plan's table), so plain dotted access can't be statically typed here.
 * These two helpers localise the one unsafe cast the generic access needs;
 * `FitParamRange` is what makes the cast reflect an actual invariant rather
 * than a type-system workaround — widen that type (e.g. back to a bare
 * `keyof GalaxyParams`) and a key naming a nested object field (`dust`,
 * `GalaxyDustParams`) would again compile and get clobbered by a scalar.
 */
function paramValue(p: GalaxyParams, key: keyof GalaxyParams & string): number {
  return (p as unknown as Record<string, number>)[key]!;
}
function setParamValue(p: MutableGalaxyParams, key: keyof GalaxyParams & string, v: number): void {
  (p as unknown as Record<string, number>)[key] = v;
}
function withParamValue(
  p: GalaxyParams,
  key: keyof GalaxyParams & string,
  v: number,
): GalaxyParams {
  return { ...p, [key]: v } as GalaxyParams;
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
  const params: MutableGalaxyParams = { ...seed, starCount: fitStars };
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
    params: { ...params, starCount: seed.starCount || 600000 },
    loss: cur.loss,
    desc: cur.d,
    iters: iter,
    history,
  });

  // discrete arm count first (spirals) — the loop restores params.armCount
  // to the current best after every trial, per the spike, so a rejected
  // count doesn't leak into the next candidate's baseline.
  if (plan.arms) {
    let bestN = params.armCount;
    let bestL = cur.loss;
    for (const n of plan.arms) {
      const trial = { ...params, armCount: n };
      const s = await score(trial);
      iter++;
      if (s.loss < bestL) {
        bestL = s.loss;
        bestN = n;
        cur = s;
      }
      params.armCount = bestN;
      await report('arms=' + n);
      if (opts.signal && opts.signal.stop) return finish();
    }
    params.armCount = bestN;
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
