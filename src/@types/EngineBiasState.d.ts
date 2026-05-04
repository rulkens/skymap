/**
 * EngineBiasState — Malmquist-bias correction tuning sub-bag of the
 * canonical `EngineState`.
 *
 * ### What is Malmquist bias and why a sub-bag?
 *
 * Catalog galaxies are flux-limited — anything fainter than the survey's
 * apparent-magnitude limit at a given distance is missing entirely.  The
 * net result is a sample skewed toward intrinsically bright galaxies at
 * large distances, which makes raw counts unsuitable for cosmological
 * inference.  The engine offers a few correction modes (volume-limited
 * cut, Schechter reweighting, angular reweighting) and each needs its
 * own tuning parameters.  Grouping the mode + parameters into one bag
 * keeps the relationship visible: changing `mode` selects which of the
 * other fields the vertex shader actually consults.
 *
 * ### Field semantics
 *
 *   - `mode` — selector consumed by `points.wgsl` to choose between
 *              discard / weight strategies.  See `data/biasMode.ts`.
 *   - `absMagLimit` — threshold for `BiasMode.VolumeLimited`.  Galaxies
 *                     with M > absMagLimit (fainter = larger M) drop out
 *                     in the vertex stage.
 *   - `apparentMagLimit` — Schechter / angular modes' apparent-mag cap;
 *                           stays 0 until the corresponding worker bake
 *                           completes (see `setBiasMode` in engine.ts).
 *   - `schechterMStar` / `schechterAlpha` — Schechter LF parameters baked
 *                                            in from the worker and used
 *                                            for the per-galaxy weighting
 *                                            term.  Sentinels (0, 0) until
 *                                            the lazy bake fires.
 *
 * ### Why a separate type rather than inline in EngineState?
 *
 * Same rationale as `EngineSettingsState` — letting the bias-mode
 * setter accept a typed bag rather than five free arguments keeps the
 * engine's setter signatures honest, and matches the style the other
 * sub-bags follow.
 */

import type { BiasMode } from '../data/biasMode';

export type EngineBiasState = {
  mode: BiasMode;
  absMagLimit: number;
  apparentMagLimit: number;
  schechterMStar: number;
  schechterAlpha: number;
};
