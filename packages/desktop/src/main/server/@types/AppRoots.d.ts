/** What the app server serves: the web build, the data mirror, and the install's CA as PEM text. */
export type AppRoots = { dist: string; data: string; caPem: string };
