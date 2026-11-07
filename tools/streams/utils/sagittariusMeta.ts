import { arrayMean } from '../../../src/utils/math/arrayMean';
import { raDecDistToEqCart } from '../../../src/utils/math/raDecDistToEqCart';
import { cumulativeLengths } from '../../utils/math/cumulativeLengths';
import { percentile } from '../../utils/perf/percentile';
import type { StellarStreamMeta } from '../../../src/layers/stellarStreams/catalog/@types/StellarStreamMeta';
import type { StreamParticles } from '../@types/StreamParticles';
import type { StreamWikipedia } from '../@types/StreamWikipedia';
import type { VasilievStar } from '../@types/VasilievStar';
import { streamArticleFields } from './streamArticleFields';
import { streamCentreline } from './streamCentreline';
import { cappedFrameRadiusKpc } from './cappedFrameRadiusKpc';
import { sagittariusCentrelines } from './sagittariusCentrelines';
import { streamFocusBoost } from './streamFocusBoost';

const MPC_TO_KPC = 1e3;
/** The extent ignores the farthest 1% of the snapshot, so one stray particle cannot set it. */
const EXTENT_PERCENTILE = 99;
/** Focus frames the remnant and both inner arms; the sparse outer trailing arm would push the camera ~2.5× farther. */
const FRAME_PERCENTILE = 90;

/** The meta row of Sagittarius; its label and focus sit at the bound remnant's mean position. */
export function sagittariusMeta(
  stars: readonly VasilievStar[],
  p: StreamParticles,
  wikipedia: StreamWikipedia | null,
): StellarStreamMeta {
  const positionsMpc = stars.map((s) =>
    raDecDistToEqCart({ raHours: s.ra / 15, decDeg: s.dec, distMpc: s.distanceKpc / MPC_TO_KPC }),
  );
  const bound = positionsMpc.filter((_, i) => stars[i]!.tStripGyr === 0);
  const anchorMpc = [0, 1, 2].map((c) => bound.reduce((sum, v) => sum + v[c]!, 0) / bound.length);
  const fromAnchorKpc = positionsMpc.map(
    (v) =>
      Math.hypot(v[0] - anchorMpc[0]!, v[1] - anchorMpc[1]!, v[2] - anchorMpc[2]!) * MPC_TO_KPC,
  );
  const { leadingKpc, trailingKpc, widthKpc } = sagittariusCentrelines(stars);
  const leading = streamCentreline(leadingKpc, widthKpc);
  const trailing = streamCentreline(trailingKpc, widthKpc);
  let [near, far] = [Infinity, 0];
  for (let i = 0; i < p.luminosity.length; i++) {
    const [x, y, z] = p.positionsMpc.subarray(i * 3, i * 3 + 3);
    const d = Math.hypot(x!, y!, z!) * MPC_TO_KPC;
    [near, far] = [Math.min(near, d), Math.max(far, d)];
  }
  return {
    id: 'sagittarius',
    names: ['Sagittarius', 'Sagittarius stream'],
    ...streamArticleFields(wikipedia),
    source: 'vasiliev2021',
    reference: 'Vasiliev, Belokurov & Erkal 2021',
    // An extent (diameter around the remnant) here; for galstreams streams an arc length.
    lengthKpc: 2 * percentile(fromAnchorKpc, EXTENT_PERCENTILE),
    frameRadiusKpc: cappedFrameRadiusKpc(
      percentile(fromAnchorKpc, FRAME_PERCENTILE),
      Math.hypot(...anchorMpc) * MPC_TO_KPC,
    ),
    distanceKpc: [near, far],
    widthDeg: null,
    particleCount: p.luminosity.length,
    colourT: arrayMean(p.colourT),
    // Its arms' arc length, not the extent: the debris lies along them.
    focusBoost: streamFocusBoost(
      p,
      [leadingKpc, trailingKpc].reduce((sum, arm) => sum + (cumulativeLengths(arm).at(-1) ?? 0), 0),
      widthKpc,
    ),
    // A gradient along the debris, not one value (`sagittariusFeh`).
    metallicity: null,
    // Published values are ranges or limits (see streamStellarMass.constants).
    stellarMass: null,
    anchorMpc: [anchorMpc[0]!, anchorMpc[1]!, anchorMpc[2]!],
    // One line, leading tip to trailing tip through the remnant both arms start at.
    centrelineMpc: [...leading.centrelineMpc.reverse(), ...trailing.centrelineMpc.slice(1)],
    ribbonWidthKpc: Math.max(leading.ribbonWidthKpc, trailing.ribbonWidthKpc),
  };
}
