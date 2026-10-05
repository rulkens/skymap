# Path-based object links with share previews

Object links live in the URL hash today (`#focus=cluster-virgo-m87`). A hash is never sent to a server, so a shared link cannot unfurl with the object's name and thumbnail, and search engines see one page for the whole app.

## The shape discussed (2026-10-05, Milky Way structures brainstorm)

- **Path = identity:** `/<kind>/<slug>`, all lowercase kebab, every object with a kind: `/open-cluster/pleiades`, `/cluster/virgo`, `/galaxy/m31`, `/galaxy/milky-way`, `/body/mars`.
- **Hash = view state:** camera pose, time, settings.
- Kinds are a URL vocabulary, separate from internal registry ids, so a refactor never breaks a shared link.
- Slugs are common names; catalog names (`m45`, `ngc-224`) resolve as aliases.
- A `/` separator removes today's prefix matching, where the resolver finds the kind by matching known `<category>-` prefixes.

## Why it needs design

- Cloudflare side: a fallback rule serving the app for every path, plus a Worker step injecting per-object title and image tags. Without the tag injection, paths gain little over hashes. The current deploy config was not checked.
- The offline desktop app cannot use paths, so the hash form stays as a permanent second link form.
- Every existing shared `#focus=` link must keep resolving.
- Galaxies have no kind today (`#focus=m31`) and the Milky Way is a one-off (`#focus=milkyWay`).

It pays off only if share previews and search visibility matter, which ties it to the outreach work.
