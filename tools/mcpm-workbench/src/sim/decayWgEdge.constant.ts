// importParams.ts's grid-dims validation quotes this rather than restating 8 a second
// place — encodeStep's decay dispatch has no bounds tail, so a dims value that isn't an
// exact multiple silently truncates it.
export const DECAY_WG_EDGE = 8; // constants.wesl DECAY_WG_* — dims are multiples of 8
