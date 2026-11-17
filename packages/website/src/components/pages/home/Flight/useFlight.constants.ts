// How much larger a still starts than it ends, over the two legs it is on screen: scrolling pulls it back.
export const PULL_BACK = 0.12;
// The same for a stop's words, kept small so they stay sharp: they draw back with their picture.
export const WORDS_PULL_BACK = 0.1;
// As shares of a leg: a stop's caption starts to leave here, and the next one's starts to
// arrive once it has gone, so two captions never share the corner they are both set in.
// The change is short, so wherever the page stops a caption is nearly always at full strength.
export const CAPTION_LEAVES = 0.44;
export const CAPTION_ARRIVES = 0.5;
export const CAPTION_FADE = 0.06;
// Pixels of scroll before the pinned stage lets go, over which the top bar's ground comes back:
// the closing words and the spine then scroll up under a bar that has its ground.
export const GROUND_RETURN_PX = 160;
// Per second: the picture settles on a new scroll position in about a quarter of a second.
export const FOLLOW_RATE = 14;
// The path is measured from Earth's centre; the readout says "from Earth", so it counts from the surface.
export const EARTH_RADIUS_KM = 6371;
