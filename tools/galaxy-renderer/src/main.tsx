/**
 * Galaxy Renderer — entry point.
 *
 * Mounts the Viewport, which owns the canvas, boots the engine, and seeds
 * it with the spike's boot defaults. Plan 03 replaces this with the params
 * store + full `<App>` shell (Hud, compare panel, presets); until then this
 * is deliberately minimal but real — no placeholder text, an actual galaxy.
 */
import { createRoot } from 'react-dom/client';
import Viewport from './ui/Viewport/Viewport';

const root = document.getElementById('root');
if (!root) throw new Error('Galaxy Renderer: #root element not found');

createRoot(root).render(<Viewport />);
