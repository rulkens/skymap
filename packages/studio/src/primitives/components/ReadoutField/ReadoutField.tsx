import type { ReactNode } from 'react';
import s from './ReadoutField.module.css';

type ReadoutFieldProps = { readonly children: ReactNode };

/** Computed text the structure sets, not editable here. */
function ReadoutField({ children }: ReadoutFieldProps) {
  return <span className={s.root}>{children}</span>;
}

export default ReadoutField;
