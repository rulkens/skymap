import type { TypeErrorSite } from '../../@types/refactor/TypeErrorSite';
import { rootRelative } from './rootRelative';

/** `N type error(s) after this change:` then one `file:line:col  message` row each. */
export function renderTypeErrors(errors: readonly TypeErrorSite[], root: string): string {
  const rows = errors.map(
    (e) => `  ${rootRelative(root, e.file)}:${e.line}:${e.column}  ${e.message}`,
  );
  return [`${errors.length} type error(s) after this change:`, ...rows].join('\n');
}
