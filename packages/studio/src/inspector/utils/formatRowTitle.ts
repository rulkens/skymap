/** A row's label as one line, `Distance → 300 Mpc`; a bound subject shows as `◎M31`, never its resolved number (Q22). */
import type { RowLabel } from '../../@types/rows/RowLabel';

export function formatRowTitle({ name, op, value, subject, qualifier }: RowLabel): string {
  const shown = subject === undefined ? value : `◎${subject}`;
  const line = [name, op, shown].filter((part) => part !== '').join(' ');
  return qualifier === undefined ? line : `${line} · ${qualifier}`;
}
