/** How the download reads; a problem is an alert with a stopped bar and Retry, done gets a tick. */
export type StatusView = { text: string; tone: 'plain' | 'problem' | 'done'; detail?: string };
