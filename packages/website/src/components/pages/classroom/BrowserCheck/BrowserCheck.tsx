/*
 * BrowserCheck — asks the browser the page is open in whether it can draw with WebGPU, as the app must,
 * and says so in one line beside a ring: filled with a check mark when it can, hollow when it cannot.
 * Before the answer, and without script, it asks the reader to open a link on each kind of device instead.
 */
import { useEffect, useState } from 'react';

import styles from './BrowserCheck.module.css';
import { SAYS } from './BrowserCheck.constants.ts';

function BrowserCheck() {
  const [verdict, setVerdict] = useState<keyof typeof SAYS>('unknown');
  useEffect(() => {
    // The site is not built with WebGPU's types; the app asks the same two questions before it starts.
    const gpu = Reflect.get(navigator, 'gpu');
    if (!gpu) {
      setVerdict('no');
      return;
    }
    Promise.resolve(gpu.requestAdapter()).then(
      (adapter) => setVerdict(adapter ? 'yes' : 'off'),
      () => setVerdict('off'),
    );
  }, []);
  return (
    <p className={styles.root} data-verdict={verdict} role="status">
      {SAYS[verdict]}
    </p>
  );
}

export default BrowserCheck;
