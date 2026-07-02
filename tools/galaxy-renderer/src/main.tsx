/**
 * Galaxy Renderer — entry point placeholder.
 *
 * This scaffolding task only wires up the dev-tool shell (Vite config, WESL
 * linker, npm script) so `npm run galaxy-renderer` serves without a 404 from
 * day one. The real engine — star sprites, dust, HDR bloom, the compare
 * panel — arrives in a later plan and replaces this file wholesale.
 */
const root = document.getElementById('root');
if (!root) throw new Error('Galaxy Renderer: #root element not found');

root.textContent = 'galaxy-renderer: engine lands in plan 02';
