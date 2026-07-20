import type { DepthIntent } from '../../@types/rendering/DepthIntent';

/**
 * resolveDepthCompare — the single source of the occlusion direction for every
 * depth-drawing pipeline.  It resolves *what the pipeline wants* (a
 * `DepthIntent`: draw the nearer fragment, or nearer-or-tied for the coplanar
 * atmosphere shell) against *how depth is encoded on its slab* (the per-slab
 * `reversedZ` flag) into the concrete `GPUCompareFunction` the descriptor needs.
 *
 * Non-reversed depth is smaller-z-wins, so "nearer" is `'less'`; reversed-Z
 * swaps near↔far, so "nearer" becomes `'greater'`.  Both branches are valid
 * `GPUCompareFunction`s, which is the danger: an inverted entry would silently
 * flip every NEAR0 body's occlusion with **no type error**.  That is precisely
 * why the four-cell truth table earns a unit test rather than being a bare
 * constant restatement.
 *
 * The rejected alternative was leaving each renderer to hardcode its own
 * `depthCompare: 'less'` literal — the pre-refactor state this replaces.  With
 * ~14 replicated sites, flipping the convention meant editing every one and
 * missing a single site produced inverted occlusion on one body with no
 * compiler signal.  Funnelling all of them through this one function makes the
 * convention a single derived attribute instead of a scattered constant.
 */
export function resolveDepthCompare(intent: DepthIntent, reversedZ: boolean): GPUCompareFunction {
  if (intent === 'nearer') return reversedZ ? 'greater' : 'less';
  return reversedZ ? 'greater-equal' : 'less-equal';
}
