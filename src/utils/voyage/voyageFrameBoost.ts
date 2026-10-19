/**
 * voyageFrameBoost — the voyage's observer frame at `simDays`: the ship `xLy` from the Sun along
 * the unit direction to the target, with its β, γ and the cluster's toggles; null for the rest
 * frame (no trip set, or not launched). Past arrival the ship rests short of the target at γ = 1.
 */

import type { FrameBoost } from '../../@types/engine/frame/FrameBoost';
import type { VoyageSettings } from '../../layers/voyage/@types/VoyageSettings';
import { SCALE_UNITS } from '../../data/scaleUnits';
import { VOYAGE_DESTINATIONS } from '../../data/voyage/voyageDestinations';
import { normalize3 } from '../math/normalize3';
import { voyageShipState } from './voyageShipState';

export function voyageFrameBoost(voyage: VoyageSettings, simDays: number): FrameBoost | null {
  const ship = voyageShipState(voyage, simDays);
  if (ship === null || voyage.destination === null) return null;
  const dir = normalize3(VOYAGE_DESTINATIONS[voyage.destination].positionMpc);
  const xMpc = ship.xLy * SCALE_UNITS.LY_TO_MPC;
  return {
    shipMpc: [dir[0] * xMpc, dir[1] * xMpc, dir[2] * xMpc],
    dir,
    beta: ship.beta,
    gamma: ship.gamma,
    contraction: voyage.contraction,
    doppler: voyage.doppler,
    headlight: voyage.headlight,
  };
}
