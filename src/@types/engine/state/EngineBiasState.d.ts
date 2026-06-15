/**
 * EngineBiasState — Malmquist-bias bake-output sub-bag of the canonical
 * `EngineState`.
 *
 * ### What is Malmquist bias and why a sub-bag?
 *
 * Catalog galaxies are flux-limited — anything fainter than the galaxy catalog's
 * apparent-magnitude limit at a given distance is missing entirely.  The
 * net result is a sample skewed toward intrinsically bright galaxies at
 * large distances, which makes raw counts unsuitable for cosmological
 * inference.  The engine offers a few correction modes (volume-limited
 * cut, Schechter reweighting, angular reweighting) selectable via
 * `state.settings.bias.mode`; the parameters baked from each per-source
 * worker run land here.
 *
 * ### Field semantics
 *
 *   - `apparentMagLimit` — Schechter / angular modes' apparent-mag cap;
 *                          stays 0 until the corresponding worker bake
 *                          completes (see `setBiasMode` in engine.ts).
 *   - `schechterMStar` / `schechterAlpha` — Schechter LF parameters baked
 *                                            in from the worker and used
 *                                            for the per-galaxy weighting
 *                                            term.  Sentinels (0, 0) until
 *                                            the lazy bake fires.
 *
 * ### Why split from `state.settings.bias`?
 *
 * The user-facing knobs (`mode`, `absMagLimit`) live on
 * `state.settings.bias` because they're SettingsPanel-surfaced inputs.
 * The fields here are worker *outputs* — derived values the shader
 * consumes after the bake resolves.  Keeping them on a sibling sub-bag
 * makes the dataflow obvious: settings → setBiasMode → biasCorrection
 * subsystem → state.bias outputs → shader.  Mixing inputs and outputs
 * in one bag would blur who writes what.
 */

export type EngineBiasState = {
  apparentMagLimit: number;
  schechterMStar: number;
  schechterAlpha: number;
};
