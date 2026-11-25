/**
 * SubsectionGroup — SliderGroup with its top rule running edge to edge.
 *
 * SliderGroup draws the rule on its own header, inside the section body's side
 * padding, and it is shared code we do not edit. Inside this wrapper the group
 * is always its parent's first child, so SliderGroup's `:first-child` rule
 * strips its rule and margins; the wrapper draws them instead, bleeding past
 * the body padding.
 */
import type { ReactNode } from 'react';
import SliderGroup from '../../../../../src/components/common/SliderGroup/SliderGroup';
import styles from './SubsectionGroup.module.css';

export type SubsectionGroupProps = {
  readonly title: string;
  readonly children: ReactNode;
};

function SubsectionGroup({ title, children }: SubsectionGroupProps): ReactNode {
  return (
    <div className={styles.root}>
      <SliderGroup title={title}>{children}</SliderGroup>
    </div>
  );
}

export default SubsectionGroup;
