# A dome without internet, and data that fails without a word

**Why.** The dome-remote spec rules that an offline venue runs the dev server
([`specs/completed/2026-10-11-dome-remote-design.md`](../superpowers/specs/completed/2026-10-11-dome-remote-design.md),
Out of scope), but the dev server still needs our data server for most of what it draws. The setup
docs therefore tell a venue to load data from `skymap-data.rulkens.com`
(`packages/website/src/content/docs/guide/dome-setup.mdx`, "Run Skymap for a phone remote"). Found
while writing that page, 2026-11-03.

**Offline.** `npm run fetch-data` (`tools/fetch/fetchPrebuiltData.ts`, module header) pulls only what
`manifest.json` names. Body textures, hi-res images and Earth tiles live in separate R2 groups the
manifest never names, so a dome running on fetched data alone has catalogs but no planet maps or Earth
surface.

**The silent failure.** The data bucket's CORS rule (`tools/deploy/r2Cors.json`) admits
`http://localhost:5173` and no other local port. `vite.config.ts:71` sets no `strictPort`, so when 5173 is
taken Vite moves to 5174 and every data fetch fails CORS. Nothing reaches the screen: `StatusBar`
(`src/components/StatusBar/StatusBar.tsx:23`) and the splash show only an engine `error` status, and a
failed asset slot does not set one. The docs page works around it in prose ("The Local line must read
port 5173").

**Options.** A fetch that also pulls textures and tiles (sizes to measure first); a dome start script
that pins the port with `--strictPort`; a visible notice when every catalog fails. The silent failure is
worth fixing on its own, since it hits any local server started on another port.
