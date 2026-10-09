# Tab is swallowed app-wide

`src/state/input/keyboardShortcuts.ts` binds `tab` to hide the UI with `preventDefault`, so no exhibit control is reachable by keyboard focus traversal. The Voyager timeline works around it with `,` and `.` (previous/next event), which need no focus; every other exhibit control (toggle switch, links, exit pill, timeline track and rows) is still unreachable.

Options: move hide-UI to another key and release Tab; or bind Tab only while no takeover or overlay is up. Needs a decision on the replacement key.
