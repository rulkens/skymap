/** Whether the app is leaving through the control window's Quit; every other close is refused. */
export type QuitGate = { allowQuit: () => void; mayClose: () => boolean };
