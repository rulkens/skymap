/**
 * How the download reads: its line, a tone and, for a failure, the file and error under it. A
 * problem is an alert with a stopped bar and Retry; done gets a tick.
 */
export type StatusView = { text: string; tone: 'plain' | 'problem' | 'done'; detail?: string };
