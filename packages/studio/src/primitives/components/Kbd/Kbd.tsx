import type { ReactNode } from 'react';
import s from './Kbd.module.css';

type Props = { readonly children: ReactNode };

/** One keycap, as tooltips and the `?` overlay print a shortcut. */
function Kbd({ children }: Props) {
  return <kbd className={s.root}>{children}</kbd>;
}

export default Kbd;
