/** How the download reads: its line, and a tone. A problem is an alert with a stopped bar and Retry; done gets a tick. */
export type StatusView = { text: string; tone: 'plain' | 'problem' | 'done' };
