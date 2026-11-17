/**
 * Most screen px a lifted label's gap above its subject's rim may grow to, however many
 * radii the style asks for: a big sphere's `radii` lift would otherwise float the text far
 * off. Mirrored in `lib/projectLabel.wesl`; the `projectLabel.parity` test holds the two equal.
 */
export const LABEL_LIFT_MAX_GAP_PX = 60;
