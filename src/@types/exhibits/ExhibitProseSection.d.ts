/**
 * ExhibitProseSection — a heading over body copy. `text` may carry `<i>…</i>`
 * and `<a href="…">…</a>`; those two are all the overlay parses (`inlineSegments`).
 */

export type ExhibitProseSection = { kind: 'prose'; heading: string; text: string };
