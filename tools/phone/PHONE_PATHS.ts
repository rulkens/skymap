/** Scratch locations under one git-ignored root, relative to the project root `npm run` starts in. */
export const PHONE_PATHS = {
  dist: '.phone/dist',
  traces: '.phone/traces',
  target: '.phone/target', // id of the tab the last `open` / `net` / `trace` used
  certs: '.certs', // vite.config.ts reads the dev server's pair from here too
} as const;
