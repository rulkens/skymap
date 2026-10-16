/*
 * LightLine — the footer's last sentence, which counts how far light has
 * travelled since the page opened and says so each time it scrolls into view.
 * `text` is the sentence as it stands without script. Styled by Footer.module.css.
 */
import { useEffect, useRef } from 'react';

import { lightSinceLine } from '../../utils/lightSinceLine.ts';
import { liveLine } from '../../utils/liveLine.ts';
import styles from './Footer.module.css';

type LightLineProps = { text: string };

function LightLine({ text }: LightLineProps) {
  const line = useRef<HTMLParagraphElement>(null);
  useEffect(() => liveLine(line.current!, () => lightSinceLine(performance.now() / 1000)), []);
  return (
    <p ref={line} className={styles.light}>
      {text}
    </p>
  );
}

export default LightLine;
