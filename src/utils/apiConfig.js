/**
 * API configuration — tries multiple paths to find the working API endpoint
 */

function getApiBase() {
  const pathname = window.location.pathname;
  const parts = pathname.split('/').filter(Boolean);
  
  // Build a list of paths to try based on the current URL structure
  const candidates = [];
  
  // Check for known subdirectory names
  const knownSubdirs = ['Tshirt Previewer', 'Tshirt%20Previewer', 'tshirt-previewer', 'DTFMockupCreater'];
  for (const subdir of knownSubdirs) {
    if (pathname.includes(subdir)) {
      candidates.push(`/${subdir}/api`);
    }
  }
  
  // Try relative to current directory depth
  if (parts.length > 0) {
    // e.g. if at /something/, try /something/api
    candidates.push(`/${parts[0]}/api`);
  }
  
  // Most common: API at /api/ (when app is served at root)
  candidates.push('/api');
  
  // Also try ../api (relative — for when index.html is in dist/)
  candidates.push('../api');
  
  // Return the first candidate — actual validation happens at runtime
  // We'll use the first one and let fetch handle 404s
  return candidates[0] || '/api';
}

// Try to detect the correct API path on first load
let _cachedApiBase = null;

async function detectApiBase() {
  if (_cachedApiBase) return _cachedApiBase;
  
  const pathname = window.location.pathname;
  const candidates = [];
  
  const knownSubdirs = ['Tshirt Previewer', 'Tshirt%20Previewer', 'tshirt-previewer', 'DTFMockupCreater'];
  for (const subdir of knownSubdirs) {
    if (pathname.includes(subdir)) {
      candidates.push(`/${subdir}/api`);
    }
  }
  
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length > 0) {
    candidates.push(`/${parts[0]}/api`);
  }
  
  candidates.push('/api');
  
  // Try each candidate — the first one that responds is the correct one
  for (const base of candidates) {
    try {
      const res = await fetch(`${base}/garments.php`, { method: 'GET' });
      if (res.ok || res.status === 200) {
        _cachedApiBase = base;
        return base;
      }
    } catch (e) {
      // try next
    }
  }
  
  // Fallback
  _cachedApiBase = candidates[0] || '/api';
  return _cachedApiBase;
}

// Synchronous getter (uses cached value or best guess)
export function getGarmentsUrl() {
  if (_cachedApiBase) return `${_cachedApiBase}/garments.php`;
  return `${getApiBase()}/garments.php`;
}

export function getServeImageUrl() {
  if (_cachedApiBase) return `${_cachedApiBase}/serve-image.php`;
  return `${getApiBase()}/serve-image.php`;
}

export { detectApiBase };
export const API_BASE = getApiBase();
export const GARMENTS_API = `${API_BASE}/garments.php`;
export const SERVE_IMAGE_URL = `${API_BASE}/serve-image.php`;
