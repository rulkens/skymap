/**
 * Entry of the remote page (`remote.html`): its own React root, no store and no engine, so it
 * loads over plain http on a LAN address where a phone has no WebGPU. The import-graph test
 * keeps `services/gpu` and `services/engine` out of everything reachable from here.
 */

import { createRoot } from 'react-dom/client';
import RemotePage from './components/RemotePage/RemotePage';
import './styles/tokens.css';

const rootEl = document.getElementById('root');
if (rootEl) createRoot(rootEl).render(<RemotePage />);
