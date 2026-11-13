/** formatAu — three significant figures, so a close approach (0.0134 AU) reads as plainly as the belt (2.77 AU). */
export function formatAu(au: number): string {
  return `${au >= 100 ? Math.round(au).toLocaleString() : au.toPrecision(3)} AU`;
}
