/** True when running in the Linux Tauri webview (not macOS/Windows). */
export function isLinuxDesktop(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  return !ua.includes('mac') && !ua.includes('win');
}
