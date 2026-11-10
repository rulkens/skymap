import type { ReactNode } from 'react';
import cx from 'classnames';
import StudioTip from '../StudioTip/StudioTip';
import s from './InspectorRow.module.css';

type Props = {
  readonly label: string;
  /** Dots the label and opens a one-line tip on hover and focus. */
  readonly tip?: string;
  /** The value is the default: fields inside render dashed and dim. */
  readonly dim?: boolean;
  /** Authored value: shows ↺, which calls this. */
  readonly onReset?: () => void;
  /** The control takes the reset column too (segmented controls). */
  readonly span?: boolean;
  readonly children: ReactNode;
};

function InspectorRow({ label, tip, dim, onReset, span, children }: Props) {
  return (
    <div className={cx(s.root, dim && s.dim)}>
      <span className={s.label}>
        {tip ? (
          <StudioTip name={label} meaning={tip}>
            <span className={s.tipLabel} tabIndex={0}>
              {label}
            </span>
          </StudioTip>
        ) : (
          label
        )}
      </span>
      <span className={cx(s.control, span && s.span)}>{children}</span>
      {!span && (
        <>
          <span className={s.resetCell}>
            {onReset && (
              <button
                type="button"
                className={s.reset}
                aria-label={`Reset ${label} to default`}
                onClick={onReset}
              >
                ↺
              </button>
            )}
          </span>
        </>
      )}
    </div>
  );
}

export default InspectorRow;
