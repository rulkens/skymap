import type { ReactNode } from 'react';
import Glyph from '../Glyph/Glyph';
import s from './AlertChip.module.css';

type AlertChipProps = { readonly children: ReactNode };

/** One-line error beside its cause, solid-outlined. */
function AlertChip({ children }: AlertChipProps) {
  return (
    <div className={s.root} role="alert">
      <Glyph id="warn" />
      <span className={s.text}>{children}</span>
    </div>
  );
}

export default AlertChip;
