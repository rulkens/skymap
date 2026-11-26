/** The normalised bob (−1…1) at clip time `t`; the evaluator's `oscOffset` divided by amp, envelope aside. */
import type { OscWave } from '../../@types/rows/OscWave';

export function oscWaveAt(wave: OscWave, t: number): number {
  return Math.sin((2 * Math.PI * (t - wave.zeroSec)) / wave.periodSec);
}
