import type { ReactNode } from 'react';
import cx from 'classnames';
import Button from '../../../../../../src/components/common/Button/Button';
import s from './InspectorRow.module.css';

type Props = {
  readonly label: string;
  /** The value is the default: fields inside render dashed and dim. */
  readonly dim?: boolean;
  /** Opens a group: space above. */
  readonly spaced?: boolean;
  /** Authored value: shows ↺, which calls this. */
  readonly onReset?: () => void;
  readonly children: ReactNode;
};

function InspectorRow({ label, dim, spaced, onReset, children }: Props) {
  return (
    <div className={cx(s.root, dim && s.dim, spaced && s.spaced)}>
      <span className={s.label}>{label}</span>
      <span className={s.control}>{children}</span>
      <span className={s.resetCell}>
        {onReset && (
          <Button
            variant="quiet"
            size="compact"
            className={s.reset}
            aria-label={`Reset ${label} to default`}
            onClick={onReset}
          >
            ↺
          </Button>
        )}
      </span>
    </div>
  );
}

export default InspectorRow;
