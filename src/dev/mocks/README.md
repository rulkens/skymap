# Mocks — design mockups in the real UI

`http://localhost:<port>/?mock=<name>#<hash>` on the dev server renders the default export of
`src/dev/mocks/<name>.tsx` above the running app: real components, `*.module.css`, the
`src/styles/tokens.css` variables and the store (it sits inside the app's `<Provider>`, so
containers work). Dev only: `src/main.tsx` imports the mount (`src/dev/mountMock.tsx`) behind
`import.meta.env.DEV`, so none of this ships.

Everything here is gitignored except this README and `example.tsx` (+ its CSS module). Copy the
example to start.

- The overlay root is fixed, full-viewport and `pointer-events: none`, so the scene stays usable;
  set `pointer-events: auto` on the mock's own interactive elements.
- To hide or restyle a real panel, import a plain CSS file from the mock and target its stable
  `aria-label` (CSS-module class names are hashed):
  `[aria-label="Navigation cheatsheet"] { display: none; }`, `[aria-label="Scale reference"]`.
- Export only the component, so Fast Refresh can swap it in place. Any other export makes Vite
  reload the whole page instead (about 30 s to settle the scene again).
- Mock files are under `src/`, so `npm run typecheck` and `tests/conventions/noInlineTypes` see your
  local ones too: keep types other than the component's `Props` out of them.

`npm run mock` shoots a mock and re-shoots it on every save, about 0.3 s per iteration; see
[`tools/mock/README.md`](../../../tools/mock/README.md).
