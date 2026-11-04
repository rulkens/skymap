/** Entry of the control page; `?view=about` renders About alone, for the shell's About window. */

import { createRoot } from 'react-dom/client';
import '@fontsource-variable/jost/wght.css';
import '../../../../src/styles/tokens.css';
import './control.css';
import AboutWindow from './shell/components/AboutWindow/AboutWindow';
import ControlPage from './shell/components/ControlPage/ControlPage';
import ControlSky from './sky/components/ControlSky/ControlSky';

const rootEl = document.getElementById('root');
if (rootEl) {
  const aboutOnly = new URLSearchParams(location.search).get('view') === 'about';
  createRoot(rootEl).render(
    <>
      <ControlSky />
      {aboutOnly ? (
        <AboutWindow bridge={window.skymapControl} />
      ) : (
        <ControlPage bridge={window.skymapControl} />
      )}
    </>,
  );
}
