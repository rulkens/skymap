/** How far short of `up3` a label's lift stops: past it the anchor lands on the far side of
 *  the zenith, upside down, and exactly on it no image-up is defined. Under a pixel on any
 *  dome. Mirrored in `lib/projectLabel.wesl` (`projectLabel.parity`). */
export const LIFT_ZENITH_MARGIN_RAD = 0.001;
