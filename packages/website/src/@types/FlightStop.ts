/**
 * A place on the flight. `atSec` is the second in the recording where it is on
 * screen: the still is that frame and the film rests there. `factId` names the
 * fact whose `short` is its caption. The portrait still is a 9:16 crop centred
 * at `portraitX` (share of the frame width, default 0.5); `portraitZoom` below
 * 1 takes a wider crop and pads it with black, so only use it on a black edge.
 */
export type FlightStop = {
  id: string;
  atSec: number;
  name: string;
  factId?: string;
  portraitX?: number;
  portraitZoom?: number;
};
