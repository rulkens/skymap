/**
 * classifyHubbleType — maps a raw Hubble-sequence type string to the
 * generative family the model actually shapes stars for. Extracted from
 * `classify()` in the spike's `galaxy-model.js` (also duplicated as `CAT` in
 * its `Galaxy Renderer.dc.html`). This is now the single source of truth —
 * plans 02/03 import it rather than re-implementing the mapping.
 *
 * The five families ('elliptical', 'lenticular', 'irregular', 'barred',
 * 'spiral') don't line up one-to-one with Hubble's own tuning-fork labels —
 * 'S0' (lenticular) and unbarred 'Sa'..'Sc' (spiral) both start with 'S', so
 * the checks below are ordered most-specific-first. Any string that doesn't
 * match a known prefix falls back to 'spiral', matching the spike's default.
 */
import type { GalaxyCategory } from '../../../../@types/galaxy/GalaxyCategory';

export function classifyHubbleType(type: string): GalaxyCategory {
  if (type[0] === 'E') return 'elliptical'; // E0..E7 — smooth spheroids
  if (type === 'S0') return 'lenticular'; // bulge + featureless disk
  if (type === 'Irr') return 'irregular'; // chaotic dwarfs (e.g. the LMC)
  if (type[0] === 'S' && type[1] === 'B') return 'barred'; // SBa..SBc — barred spirals
  if (type[0] === 'S') return 'spiral'; // Sa..Sc — unbarred spirals
  return 'spiral';
}
