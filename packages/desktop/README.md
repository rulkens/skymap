# Skymap for kiosks and domes

Skymap runs on one computer without internet. It downloads the sky's data once, then shows the
sky full screen. A phone or tablet on the same network drives it. Use it as a kiosk (a flat
screen) or in a dome (the fisheye disc for a planetarium projector).

Developers: see [docs/DESKTOP.md](../../docs/DESKTOP.md). This guide is the source for the app's
Help view (`HelpView.tsx`): change Connect a tablet and Troubleshooting in both.

## What you need

- A Mac with Apple silicon, or a Windows 64-bit computer. Intel Macs have no installer yet.
- Internet for the first start only. The download is large; the setup window shows its size and
  the time left, and says so if the disk has too little free space.
- A graphics driver that supports WebGPU. A blank sky usually means an old driver.

## Install

Both installers are unsigned, so the system warns before it lets you open them. That is expected.

**Mac** (`Skymap-<version>-mac.dmg`)

1. Open the dmg and drag Skymap onto Applications.
2. Open Skymap from Applications. macOS says it cannot check the app for malware. Close that
   message, open System Settings, Privacy & Security, scroll to the note about Skymap and choose
   Open Anyway. The wording differs between macOS versions.

**Windows** (`Skymap-<version>-win-setup.exe`)

1. Run the installer. Windows shows "Windows protected your PC": choose More info, then Run anyway.
2. The installer asks for administrator rights, because it installs for everyone on the computer
   and adds a firewall rule. Pick the folder, install, and leave "Launch Skymap" ticked.
   Shortcuts named Skymap go on the Start menu and the desktop.

## First run

The first start opens the setup window and starts the download at once. The steps, in order:

1. **Welcome.** What Skymap is and what happens now.
2. **Your setup.** Kiosk (a flat screen) or Dome (a fisheye disc).
3. **Which screen.** Pick the screen for the sky. The sky moves there and shows a test grid. In a
   dome the grid shows FRONT at the bottom. With one screen this step is skipped.
4. **Connect a tablet.** Pick the network the tablet is on if the computer has several, then scan
   the QR. You can skip this and pair later from the controls.
5. **Every day.** Start Skymap with the computer, and when to fetch new data: at every launch,
   daily at a time you pick, or only when you ask.

The download runs underneath all of this. When it ends, the last step reads "The sky is ready" and
the sky opens. Each choice saves as you make it, and "Run setup again" in the controls brings the
steps back.

## The firewall prompt

The first time Skymap starts, macOS asks whether Skymap may accept incoming network connections.
Choose **Allow**, or phones and tablets cannot connect. Choosing Deny keeps the sky working but
leaves no remote. To fix it later, allow Skymap in the system's firewall settings.

The Windows installer already adds a firewall rule for private and domain networks, so Windows
usually does not ask. Networks Windows marks as public stay closed.

## Connect a tablet

The tablet must be on the same network as the computer.

1. Scan the QR in the controls with the tablet's camera. It opens a setup page on the tablet,
   `http://<address>:47824`. A tablet without a camera opens that address and types the code.
2. The page shows the steps for that tablet and checks each one. It trusts the computer once, through
   a certificate:
   - **iPad or iPhone:** use Safari. Download the certificate and allow it, then in Settings tap
     Profile Downloaded and Install. Turn it on in Settings, General, About, Certificate Trust
     Settings.
   - **Android:** download the certificate; the browser may say it cannot install it, which is fine.
     In Settings, search for CA certificate, then Install a certificate, CA certificate, Install
     anyway, and pick the Skymap file.
3. Once the page says the tablet trusts the computer, open the remote from it. A tablet that already
   trusts it goes straight to the remote.

The QR holds a code that stays the same between launches, so a bookmark keeps working. Rotate code
in the controls makes a new one and disconnects every tablet: the button asks once more as
"Disconnect tablets and rotate", and Escape cancels.

Give the computer a DHCP reservation on the venue's router, so its address does not change after a
restart. A tablet's bookmark holds the address, so it breaks if the address changes.

## Move the sky to another screen

Open the controls, go to Setup, and pick the screen under Sky screen. The sky moves at once. Show
the test grid to see which screen it is on. If the chosen screen is off when Skymap starts, the sky
uses another screen and moves back when the chosen one is connected. A projector switched on after
the computer boots takes the sky.

## Open the control window

Press **Ctrl+Alt+K** (Cmd+Option+K on a Mac). It shows or hides the control window, also when the
sky fills the only screen. Closing the window only hides it. Quit is in the controls.

On a Mac, the menu bar appears only while the control window has focus, so a visitor at the sky's
keyboard cannot quit the show.

## Updates

New data arrives as set in Setup: at every launch, daily at a time, or only with Update now. An
update started with Update now waits until you choose Restart sky; the others load by themselves.
The app itself has no update channel yet: install a newer installer over the old one. Downloaded
data is kept.

## Uninstall

- **Mac:** drag Skymap from Applications to the Bin. The data and settings stay in
  `~/Library/Application Support/Skymap`; delete that folder to remove them.
- **Windows:** uninstall Skymap from Settings, Apps. The uninstaller removes the app, its shortcuts
  and its firewall rule. It lists "Downloaded sky data" with its size, unticked: leave it to keep
  the data and skip the download on a reinstall, or tick it to delete the data. Settings and
  certificates stay in `%APPDATA%\Skymap`.

## Troubleshooting

- **No sky.** The sky opens once its data is downloaded. The status under Data says what it waits
  for; Restart sky stays off until then.
- **Blank sky.** Update the graphics driver, then choose Restart sky in the controls.
- **The download needs internet.** The first start needs it once. Connect, then choose Retry.
- **The disk is full.** The status names the space needed and the space free. Free the difference
  and choose Retry.
- **A tablet cannot connect.** Check that Skymap is running, that the tablet is on the same
  network and trusts the certificate, and, if the computer has more than one network, that the
  controls name the one the tablet uses. Check the firewall prompt was answered with Allow.
- **The tablet warns about the certificate.** It does not trust the computer yet; see Connect a
  tablet.
- **Skymap will not start, or says the port is in use.** Another copy is running, or one was left
  behind after a crash. Quit it (Task Manager or Activity Monitor) and start again. Skymap uses
  ports 47823 and 47824.
- **The sky is on the wrong screen.** See Move the sky to another screen.
