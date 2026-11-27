// DOME-TEST (temporary, never commit): lets the dev machine steer this tab.
// dome-drive-next.txt holds "<counter> <url>"; when it changes, the tab goes there.
// Inside the drive page's frame the drive page steers instead.
// Only dome tabs and the test page are steered, so another tab on this server is left alone.
const isDomeTab = new URLSearchParams(location.search).has('dome') || location.pathname.startsWith('/dome-');
if (window.top === window && isDomeTab) {
  const KEY = 'domeDriveSeen';
  const poll = async () => {
    try {
      // A headless self-test points this at its own file so it never steers the real dome.
      const file = localStorage.getItem('domeDriveFile') ?? 'dome-drive-next.txt';
      const response = await fetch(`/${file}?t=${Date.now()}`, { cache: 'no-store' });
      const next = (await response.text()).trim();
      if (!next) return;
      const seen = sessionStorage.getItem(KEY);
      sessionStorage.setItem(KEY, next);
      // The first poll of a tab only records what is there: the address typed by hand wins.
      if (seen === null || seen === next) return;
      const target = new URL(next.slice(next.indexOf(' ') + 1), location.origin);
      const sameDocument = target.pathname === location.pathname && target.search === location.search;
      location.href = target.href;
      if (sameDocument) location.reload();
    } catch {
      // The dev machine is unreachable; keep showing what is on screen.
    }
  };
  setInterval(poll, 1000);
  poll();
  const report = () => {
    const body = `direct tab | ${location.pathname}${location.search}${location.hash} | ${document.title}`;
    fetch(`https://${location.hostname}:5190/report`, { method: 'POST', mode: 'no-cors', body }).catch(() => {});
  };
  setTimeout(report, 5000);
}
