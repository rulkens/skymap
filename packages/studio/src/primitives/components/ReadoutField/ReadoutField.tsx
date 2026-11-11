import type { ReactNode } from 'react';
import s from './ReadoutField.module.css';

type Props = { readonly children: ReactNode };

/** Computed text the structure sets, not editable here. */
function ReadoutField({ children }: Props) {
  return <span className={s.root}>{children}</span>;
}

export default ReadoutField;
