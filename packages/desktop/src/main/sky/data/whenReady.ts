/**
 * Page script that settles once the first scene has settled. window.__skymap is the app's automation
 * hook (src/state/automation/installSkymapHook.ts), installed on every load.
 */
export const WHEN_READY = `new Promise((done) => {
  const poll = () => (window.__skymap ? window.__skymap.ready.then(done, done) : setTimeout(poll, 100));
  poll();
})`;
