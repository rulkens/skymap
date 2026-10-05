/**
 * The area bucket of a `src/`-relative path: top-level folder, one level deeper for
 * `services/`, `services/engine/` and `layers/`, so the matrix stays ~40 rows.
 */
export function areaOf(rel: string): string {
  const s = rel.split('/');
  const top = s[0] ?? '';
  if (top.includes('.')) return '(root)';
  if (top === 'services') {
    if (s[1] !== 'engine') return `services/${s[1] ?? ''}`;
    return s[2] && !s[2].includes('.') ? `services/engine/${s[2]}` : 'services/engine';
  }
  if (top === 'layers') return `layers/${s[1] ?? ''}`;
  return top;
}
