/**
 * Entry of the control page. The first render is synchronous: main pushes the status and the pairing
 * room once, on did-finish-load, so the bridge listeners must be attached before then. `?view=about`
 * renders About alone, for the shell's About window.
 */

import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import '@fontsource-variable/jost/wght.css';
import '../../../../src/styles/tokens.css';
import './control.css';
import AboutWindow from './components/AboutWindow/AboutWindow';
import ControlPage from './components/ControlPage/ControlPage';
import ControlSky from './components/ControlSky/ControlSky';

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = createRoot(rootEl);
  const aboutOnly = new URLSearchParams(location.search).get('view') === 'about';
  flushSync(() =>
    root.render(
      <>
        <ControlSky />
        {aboutOnly ? (
          <AboutWindow bridge={window.skymapControl} />
        ) : (
          <ControlPage bridge={window.skymapControl} />
        )}
      </>,
    ),
  );
}
