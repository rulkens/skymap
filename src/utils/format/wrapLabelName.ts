/**
 * wrapLabelName — break a long structure name onto two balanced lines.
 *
 * The MSDF label renderer honours '\n' (see `labelLayout`), but deciding
 * WHERE to break is a presentation policy, not a layout concern — so it
 * lives here, applied by the label producer, and the unwrapped name keeps
 * serving the palette / InfoCard.
 *
 * The break goes at the space that best balances the two lines (not the
 * first space that fits): "Corona Borealis Supercluster" reads as
 * "Corona Borealis / Supercluster", never "Corona / Borealis Supercluster".
 * Two lines is the cap — these are floating scene labels, not paragraphs —
 * and a spaceless over-long name is left alone rather than hyphenated.
 */
export function wrapLabelName(name: string, maxChars: number = 18): string {
  if (name.length <= maxChars) return name;

  const mid = name.length / 2;
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = name.indexOf(' '); i !== -1; i = name.indexOf(' ', i + 1)) {
    const dist = Math.abs(i - mid);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  if (bestIdx === -1) return name;
  return `${name.slice(0, bestIdx)}\n${name.slice(bestIdx + 1)}`;
}
