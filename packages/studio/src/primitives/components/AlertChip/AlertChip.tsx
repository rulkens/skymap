import type { ReactNode } from 'react';
import Glyph from '../Glyph/Glyph';
import s from './AlertChip.module.css';

type Props = { readonly children: ReactNode };

/** One-line error beside its cause, solid-outlined. */
function AlertChip({ children }: Props) {
  return (
    <div className={s.root} role="alert">
      <Glyph id="warn" />
      <span className={s.text}>{children}</span>
    </div>
  );
}

export default AlertChip;
