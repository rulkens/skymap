// An in-flight fetch pins a queue pipe and keeps the render-on-demand loop
// ticking, so a promise that never settles leaks more than a socket.
export const ARCHIVE_FETCH_DEADLINE_MS = 10_000;
