/**
 * FadeBand — the two edges of a directional crossfade over some scalar
 * quantity (a distance, an apparent size, …).
 *
 * `fullAt` is the value at which the content is at full strength (alpha 1);
 * `goneAt` is the value at which it has fully dissolved (alpha 0). The band's
 * DIRECTION is carried by the ordering of the two edges rather than a separate
 * flag: `fullAt > goneAt` fades OUT as the value drops (an approach fade),
 * `fullAt < goneAt` fades OUT as the value rises (a recede fade). Encoding the
 * direction in the edges — rather than a `{ full, gone, invert }` triple —
 * keeps the band a pair of anchor values a reader can read off directly and
 * makes an inconsistent "invert says rise but edges say drop" state
 * unrepresentable.
 */
export type FadeBand = { fullAt: number; goneAt: number };
