import type { ReactNode } from 'react';
import cx from 'classnames';
import s from './Kbd.module.css';

type Props = {
  readonly children: ReactNode;
  /** Sits on a primary (accent) button: swaps to a colour that keeps 4.5:1 there. */
  readonly onPrimary?: boolean;
};

function Kbd({ children, onPrimary }: Props) {
  return <kbd className={cx(s.root, onPrimary && s.onPrimary)}>{children}</kbd>;
}

export default Kbd;
