/**
 * ButtonTip — what a sidebar button does, in the same CompactInfoTip the rows'
 * ⓘ use: on hover and keyboard focus, never on touch. The tip's text carries an
 * id the button takes as `aria-describedby`, so its visible label stays its name.
 * `placement` and `align` keep the tip off the button and inside its sidebar.
 */
import { useId, type ReactNode } from 'react';
import CompactInfoTip from '../../../../../src/components/common/CompactInfoTip/CompactInfoTip';

export type ButtonTipProps = {
  readonly tip: string;
  readonly placement?: 'top' | 'bottom';
  readonly align?: 'center' | 'start' | 'end';
  /** Renders the button, given the id to pass as its `aria-describedby`. */
  readonly children: (describedBy: string) => ReactNode;
};

function ButtonTip({ tip, placement, align, children }: ButtonTipProps): ReactNode {
  const id = useId();
  return (
    <CompactInfoTip label={<span id={id}>{tip}</span>} placement={placement} align={align}>
      {children(id)}
    </CompactInfoTip>
  );
}

export default ButtonTip;
