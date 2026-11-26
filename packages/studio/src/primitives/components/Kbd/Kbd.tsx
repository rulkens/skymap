import type { ReactNode } from 'react';
import s from './Kbd.module.css';

type KbdProps = { readonly children: ReactNode };

/** One keycap, as tooltips and the `?` overlay print a shortcut. */
function Kbd({ children }: KbdProps) {
  return <kbd className={s.root}>{children}</kbd>;
}

export default Kbd;
