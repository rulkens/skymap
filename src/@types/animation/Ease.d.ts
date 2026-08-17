/**
 * Ease — named easing curve for a clip's CameraAction segments, matching
 * easings.net's naming: `'linear'` plus `easeIn/easeOut/easeInOut` × ten
 * curve families (Sine, Quad, Cubic, Quart, Quint, Expo, Circ, Back, Elastic,
 * Bounce) = 31 members. `easeIn` accelerates from rest, `easeOut` decelerates
 * to rest, `easeInOut` is the symmetric S-curve combining both.
 *
 * The runtime table keyed by this type — including the input/output clamp
 * contract for the overshoot families — lives in
 * `src/services/engine/animation/ease.ts` (`EASE`).
 */
export type Ease =
  | 'linear'
  | 'easeInSine'
  | 'easeOutSine'
  | 'easeInOutSine'
  | 'easeInQuad'
  | 'easeOutQuad'
  | 'easeInOutQuad'
  | 'easeInCubic'
  | 'easeOutCubic'
  | 'easeInOutCubic'
  | 'easeInQuart'
  | 'easeOutQuart'
  | 'easeInOutQuart'
  | 'easeInQuint'
  | 'easeOutQuint'
  | 'easeInOutQuint'
  | 'easeInExpo'
  | 'easeOutExpo'
  | 'easeInOutExpo'
  | 'easeInCirc'
  | 'easeOutCirc'
  | 'easeInOutCirc'
  | 'easeInBack'
  | 'easeOutBack'
  | 'easeInOutBack'
  | 'easeInElastic'
  | 'easeOutElastic'
  | 'easeInOutElastic'
  | 'easeInBounce'
  | 'easeOutBounce'
  | 'easeInOutBounce';
