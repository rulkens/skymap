/**
 * MCPM Workbench — entry point.
 *
 * Imports the shared skymap design tokens (`src/styles/global.css`) so the
 * tool inherits the main app's palette/typography, then mounts the React
 * <App> shell, mirroring tools/flow-workbench's main.tsx.
 */
import '../../../src/styles/global.css';
import { createRoot } from 'react-dom/client';
import App from './ui/App';

const root = document.getElementById('root');
if (!root) throw new Error('MCPM Workbench: #root element not found');

createRoot(root).render(<App />);
