// ── Authenticated API calls ─────────────────────────────────────────────────
// The studio's own session token lives in localStorage and lasts a week, so a
// tab left open over a weekend keeps sending a token the server has already
// expired. Every API call then fails with a bare 401 and the page reports
// something misleading ("Could not load DTF customers") for what is really just
// a stale login.
//
// Authentik is still signed in at that point, so the fix is not to bounce the
// user out: on a 401 we drop the dead token, mint a fresh session from the SSO
// headers nginx already injects, and replay the request once. Only if that also
// fails does the caller see an error — and then it says what actually happened.

let refreshInFlight = null;

export function authHeaders() {
  const token = localStorage.getItem('auth_token') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// One refresh at a time: a page with several panels refreshing together must not
// mint (and immediately orphan) a session per panel.
function refreshSession(apiBase) {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const res = await fetch(`${apiBase}/auth.php?action=sso`, { method: 'POST' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.token) return null;
    localStorage.setItem('auth_token', data.token);
    if (data.user) localStorage.setItem('auth_user', JSON.stringify(data.user));
    return data.token;
  })()
    .catch(() => null)
    .finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

/**
 * fetch() with the session token attached, retried once through SSO on a 401.
 * `apiBase` is what detectApiBase() returned.
 */
export async function authFetch(apiBase, path, options = {}) {
  const call = () => fetch(`${apiBase}${path}`, {
    ...options,
    headers: { ...(options.headers || {}), ...authHeaders() },
  });

  let response = await call();
  if (response.status !== 401) return response;

  localStorage.removeItem('auth_token');
  const token = await refreshSession(apiBase);
  if (!token) {
    // SSO could not re-establish the session — send the user back through
    // Authentik rather than leaving them staring at an empty panel.
    if (window.location.hostname.endsWith('.decoinkssuite.com')) {
      const rd = `${window.location.origin}${window.location.pathname}${window.location.search}`;
      window.location.replace(`${window.location.origin}/outpost.goauthentik.io/start?rd=${encodeURIComponent(rd)}`);
    } else {
      localStorage.removeItem('auth_user');
    }
    return response;
  }
  return call();
}

// Reads the message an API actually returned, so a failure is reported as the
// server described it instead of as a generic sentence written at the call site.
export async function apiError(response, fallback) {
  try {
    const data = await response.clone().json();
    if (data?.error || data?.message) return new Error(data.error || data.message);
  } catch { /* not JSON */ }
  if (response.status === 401) return new Error('Your session expired — reload the page to sign in again');
  return new Error(`${fallback} (HTTP ${response.status})`);
}
