/**
 * Entry of the control page. The first render is synchronous: main pushes the status and the
 * pairing room once, on did-finish-load, so the bridge listeners must be attached before then.
 */

import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import ControlPage from './components/ControlPage/ControlPage';
import '../../../../src/styles/tokens.css';
import './control.css';

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = createRoot(rootEl);
  flushSync(() => root.render(<ControlPage bridge={window.skymapControl} />));
}
