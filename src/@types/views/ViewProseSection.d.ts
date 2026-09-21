/**
 * ViewProseSection — a heading over body copy. `text` may wrap a phrase in
 * `<i>…</i>`, the only markup the overlay understands (`emphasisSegments`).
 */

export type ViewProseSection = { kind: 'prose'; heading: string; text: string };
