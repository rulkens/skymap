/**
 * About's facts from main: the app version, when this build was made (ISO), and when the local data
 * set was last completed (ISO).
 */
export type AboutInfo = { version: string; builtAt: string; dataDate: string | null };
