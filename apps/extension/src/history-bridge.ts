const installedKey = '__jobComplianceHistoryBridgeInstalled';
const navigationEvent = 'job-compliance:navigation';
type BridgeWindow = Window & { [installedKey]?: boolean };

function installHistoryBridge(): void {
  const bridgeWindow = window as BridgeWindow;
  if (bridgeWindow[installedKey]) return;
  bridgeWindow[installedKey] = true;

  const signal = () => window.dispatchEvent(new CustomEvent(navigationEvent));
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method];
    history[method] = function wrappedHistoryState(...args: Parameters<History[typeof method]>) {
      const value = original.apply(this, args);
      signal();
      return value;
    };
  }
  window.addEventListener('popstate', signal);
  window.addEventListener('hashchange', signal);
}

installHistoryBridge();
