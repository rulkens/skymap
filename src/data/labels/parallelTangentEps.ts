/**
 * Below this length the tangent from a label's direction toward the lift
 * direction is treated as undefined (the two are parallel within ~1e-6 rad,
 * still resolvable in f32). Mirrored in `lib/projectLabel.wesl`; the
 * `projectLabel.parity` test holds the two equal.
 */
export const PARALLEL_TANGENT_EPS = 1e-6;
