/*
 * BrowserCheck — asks the browser the page is open in whether it can draw with WebGPU, as the app must,
 * and says so in one line beside a ring: filled with a check mark when it can, hollow when it cannot.
 * Before the answer, and without script, it asks the reader to open a link on each kind of device instead.
 */
import { useEffect, useState } from 'react';

import styles from './BrowserCheck.module.css';

const SAYS = {
  unknown: 'Open one link on each kind of device the class will use.',
  yes: 'This browser has WebGPU: Skymap can run here.',
  off: 'This browser knows WebGPU but cannot use it here, so Skymap will not run.',
  no: 'This browser has no WebGPU, so Skymap will not run in it.',
} as const;

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
