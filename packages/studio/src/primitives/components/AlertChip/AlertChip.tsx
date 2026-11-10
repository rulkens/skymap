import type { ReactNode } from 'react';
import cx from 'classnames';
import Glyph from '../Glyph/Glyph';
import s from './AlertChip.module.css';

type Props = {
  readonly tone?: 'warn' | 'error';
  readonly children: ReactNode;
  readonly action?: { readonly label: string; readonly onSelect: () => void };
};

/** One-line warning (dashed) or error (solid), with at most one action. */
function AlertChip({ tone = 'warn', children, action }: Props) {
  return (
    <div className={cx(s.root, tone === 'error' && s.error)} role="alert">
      <Glyph id="warn" />
      <span className={s.text}>{children}</span>
      {action && (
        <button type="button" className={s.action} onClick={action.onSelect}>
          {action.label}
        </button>
      )}
    </div>
  );
}

export default AlertChip;
