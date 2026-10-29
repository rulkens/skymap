/*
 * UseTerms — what may be done with a source, in the fixed terms of its `Use`
 * bullet in the licence record, one term a line. A term that limits use, or
 * says that nothing was granted, has a filled mark and heavier type; a free
 * one an open mark. The difference is in shape and weight, so it does not
 * rest on colour. Which terms limit is tools/utils/io/attributionUses.ts.
 */
import type { AttributionUse } from '../../../../../tools/@types/io/AttributionUse';
import { ATTRIBUTION_USES } from '../../../../../tools/utils/io/attributionUses.ts';
import { cx } from '../../utils/cx.ts';
import styles from './UseTerms.module.css';

type UseTermsProps = { use: readonly AttributionUse[] };

function UseTerms({ use }: UseTermsProps) {
  return use.map((term) => {
    const limits = ATTRIBUTION_USES[term] === 'restricted';
    return (
      <span key={term} className={cx(styles.root, limits && styles.limits)}>
        {term}
        {limits && <span className={styles.unseen}> (limits use)</span>}{' '}
      </span>
    );
  });
}

export default UseTerms;
