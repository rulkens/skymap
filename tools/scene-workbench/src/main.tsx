// Scene Workbench entry point.
import '../../../src/styles/global.css';
import { createRoot } from 'react-dom/client';
import App from './ui/App/App';

const root = document.getElementById('root');
if (!root) throw new Error('Scene Workbench: #root element not found');

createRoot(root).render(<App />);
