/** True on localhost / 127.0.0.1 or when ?dev=1 is in the URL. */
export function isDevEnvironment() {
  if (typeof window === 'undefined' || !window.location) return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('dev') === '1' || params.get('dev') === 'true') return true;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}
