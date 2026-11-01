// Astro's client types (CSS modules, image imports) are otherwise reached only through the generated,
// gitignored .astro/types.d.ts, so a checkout that has not run `astro dev` or `astro sync` would see
// every `*.module.css` import as a missing module.
/// <reference types="astro/client" />
