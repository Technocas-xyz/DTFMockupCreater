/**
 * API configuration — auto-detects the correct base path for the API
 * Works on both local WAMP (/Tshirt Previewer/api/) and remote servers (/api/)
 */

function getApiBase() {
  // Try to detect the base path from the current URL
  // If running at root (e.g. http://server:8095/), use /api/
  // If running at a subpath (e.g. http://server/Tshirt Previewer/), use that subpath + /api/
  const pathname = window.location.pathname;
  
  // Strip trailing filename/hash to get the directory
  const parts = pathname.split('/').filter(Boolean);
  
  // Known subdir names for local WAMP
  const knownSubdirs = ['Tshirt Previewer', 'tshirt-previewer', 'DTFMockupCreater'];
  
  for (const subdir of knownSubdirs) {
    if (parts.includes(subdir)) {
      return `/${subdir}/api`;
    }
  }
  
  // Default: API is at /api/ relative to root
  return '/api';
}

export const API_BASE = getApiBase();
export const GARMENTS_API = `${API_BASE}/garments.php`;
export const SERVE_IMAGE_URL = `${API_BASE}/serve-image.php`;
