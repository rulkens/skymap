/**
 * The three `satellite.js` functions this Layer uses, imported from the package's plain-JS modules.
 * Its entry point also re-exports a WASM bulk propagator whose threaded build Vite cannot bundle
 * (a nested worker with top-level await), and whose bytes the app would ship unused; the package's
 * `exports` map offers no narrower entry, so the paths reach past it.
 */
export { json2satrec } from '../../../../node_modules/satellite.js/dist/io.js';
export { gstime, sgp4 } from '../../../../node_modules/satellite.js/dist/propagation.js';
