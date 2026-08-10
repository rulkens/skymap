/**
 * classifyHubbleType — maps a raw Hubble-sequence type string to the
 * generative family the model shapes stars for. The five families don't line
 * up one-to-one with Hubble's own tuning-fork labels — 'S0' (lenticular) and
 * unbarred 'Sa'..'Sc' (spiral) both start with 'S' — so the checks below are
 * ordered most-specific-first. An unrecognised string falls back to 'spiral'.
 */
import type { GalaxyCategory } from '../../../../@types/galaxy/GalaxyCategory';

export function classifyHubbleType(type: string): GalaxyCategory {
  if (type[0] === 'E') return 'elliptical';
  if (type === 'S0') return 'lenticular';
  if (type === 'Irr') return 'irregular';
  if (type[0] === 'S' && type[1] === 'B') return 'barred'; // SBa..SBc
  if (type[0] === 'S') return 'spiral'; // Sa..Sc
  return 'spiral';
}
