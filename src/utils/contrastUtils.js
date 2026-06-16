/**
 * WCAG 2.1 Contrast Utility Functions
 */

/**
 * Calculate relative luminance per WCAG 2.1
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {number} Relative luminance (0-1)
 */
export function getRelativeLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate contrast ratio between two colors
 * @param {{r:number,g:number,b:number}} color1
 * @param {{r:number,g:number,b:number}} color2
 * @returns {number} Contrast ratio (1-21)
 */
export function getContrastRatio(color1, color2) {
  const l1 = getRelativeLuminance(color1.r, color1.g, color1.b);
  const l2 = getRelativeLuminance(color2.r, color2.g, color2.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Convert contrast ratio (1-21) to a 0-100 score
 * @param {number} ratio - Contrast ratio
 * @returns {number} Score 0-100
 */
export function getContrastScore(ratio) {
  // Map ratio 1-21 to score 0-100
  // ratio of 1 = score 0 (no contrast)
  // ratio of 4.5 = score ~60 (WCAG AA)
  // ratio of 7 = score ~80 (WCAG AAA)
  // ratio of 21 = score 100
  const score = ((ratio - 1) / 20) * 100;
  return Math.min(100, Math.max(0, Math.round(score * 100) / 100));
}

/**
 * Get rating based on score and ranking configuration
 * @param {number} score - Score 0-100
 * @param {Array} rankings - Array of {label, min, max, color}
 * @returns {{label:string, color:string}}
 */
export function getRating(score, rankings) {
  const defaultRankings = [
    { label: 'Excellent', min: 80, max: 100, color: '#10b981' },
    { label: 'Good', min: 60, max: 79, color: '#22c55e' },
    { label: 'Fair', min: 40, max: 59, color: '#f59e0b' },
    { label: 'Poor', min: 0, max: 39, color: '#ef4444' },
  ];

  const ranks = rankings || defaultRankings;
  for (const rank of ranks) {
    if (score >= rank.min && score <= rank.max) {
      return { label: rank.label, color: rank.color };
    }
  }
  return { label: 'Poor', color: '#ef4444' };
}

/**
 * Convert hex color to RGB
 * @param {string} hex - Hex color string (e.g., "#ff0000" or "ff0000")
 * @returns {{r:number,g:number,b:number}|null}
 */
export function hexToRgb(hex) {
  const cleaned = hex.replace('#', '');
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    return { r, g, b };
  }
  if (cleaned.length === 6) {
    const r = parseInt(cleaned.substring(0, 2), 16);
    const g = parseInt(cleaned.substring(2, 4), 16);
    const b = parseInt(cleaned.substring(4, 6), 16);
    return { r, g, b };
  }
  return null;
}

/**
 * Convert RGB to hex string
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {string}
 */
export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
}

/**
 * Convert RGB to CMYK
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {{c:number,m:number,y:number,k:number}} CMYK percentages (0-100)
 */
export function rgbToCmyk(r, g, b) {
  if (r === 0 && g === 0 && b === 0) {
    return { c: 0, m: 0, y: 0, k: 100 };
  }
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const k = 1 - Math.max(rr, gg, bb);
  const c = (1 - rr - k) / (1 - k);
  const m = (1 - gg - k) / (1 - k);
  const y = (1 - bb - k) / (1 - k);
  return {
    c: Math.round(c * 100),
    m: Math.round(m * 100),
    y: Math.round(y * 100),
    k: Math.round(k * 100),
  };
}

/**
 * Get color name based on hue
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {string}
 */
export function getColorName(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2 / 255;
  const saturation = max === min ? 0 : (max - min) / (lightness > 0.5 ? 510 - max - min : max + min);

  if (saturation < 0.1) {
    if (lightness < 0.15) return 'Black';
    if (lightness < 0.4) return 'Dark Gray';
    if (lightness < 0.6) return 'Gray';
    if (lightness < 0.85) return 'Light Gray';
    return 'White';
  }

  let hue;
  if (max === r) {
    hue = ((g - b) / (max - min)) * 60;
  } else if (max === g) {
    hue = (2 + (b - r) / (max - min)) * 60;
  } else {
    hue = (4 + (r - g) / (max - min)) * 60;
  }
  if (hue < 0) hue += 360;

  if (hue < 15 || hue >= 345) return 'Red';
  if (hue < 45) return 'Orange';
  if (hue < 70) return 'Yellow';
  if (hue < 150) return 'Green';
  if (hue < 190) return 'Cyan';
  if (hue < 260) return 'Blue';
  if (hue < 290) return 'Purple';
  if (hue < 345) return 'Pink';
  return 'Red';
}

/**
 * Extract dominant colors from canvas image data
 * @param {ImageData} imageData - Canvas ImageData object
 * @param {number} maxColors - Maximum number of colors to return
 * @returns {Array<{r:number,g:number,b:number,hex:string,name:string,percentage:number}>}
 */
export function extractColorsFromImage(imageData, maxColors = 12) {
  const data = imageData.data;
  const colorMap = {};
  let totalPixels = 0;

  // Sample pixels (skip transparent ones)
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 128) continue; // Skip transparent/semi-transparent pixels

    // Quantize to reduce color count (group similar colors)
    const r = Math.round(data[i] / 16) * 16;
    const g = Math.round(data[i + 1] / 16) * 16;
    const b = Math.round(data[i + 2] / 16) * 16;

    const key = `${r},${g},${b}`;
    colorMap[key] = (colorMap[key] || 0) + 1;
    totalPixels++;
  }

  if (totalPixels === 0) return [];

  // Sort by frequency and take top colors
  const sorted = Object.entries(colorMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxColors * 3); // Take more, then merge similar

  // Merge similar colors
  const merged = [];
  for (const [key, count] of sorted) {
    const [r, g, b] = key.split(',').map(Number);
    let foundSimilar = false;

    for (const existing of merged) {
      const dist = Math.sqrt(
        Math.pow(existing.r - r, 2) +
        Math.pow(existing.g - g, 2) +
        Math.pow(existing.b - b, 2)
      );
      if (dist < 50) {
        existing.count += count;
        foundSimilar = true;
        break;
      }
    }

    if (!foundSimilar) {
      merged.push({ r, g, b, count });
    }
  }

  // Sort merged by count and return top N
  return merged
    .sort((a, b) => b.count - a.count)
    .slice(0, maxColors)
    .map((c) => ({
      r: c.r,
      g: c.g,
      b: c.b,
      hex: rgbToHex(c.r, c.g, c.b),
      name: getColorName(c.r, c.g, c.b),
      percentage: Math.round((c.count / totalPixels) * 100),
    }));
}

/**
 * Suggest better colors that have higher contrast against the background
 * @param {{r:number,g:number,b:number}} currentColor
 * @param {{r:number,g:number,b:number}} backgroundColor
 * @param {number} targetScore - Target score (0-100)
 * @returns {Array<{r:number,g:number,b:number,hex:string,score:number,ratio:number}>}
 */
export function suggestBetterColors(currentColor, backgroundColor, targetScore = 60) {
  const suggestions = [];
  const bgLuminance = getRelativeLuminance(backgroundColor.r, backgroundColor.g, backgroundColor.b);

  // Determine if we should go lighter or darker for better contrast
  const goLighter = bgLuminance < 0.5;

  // Generate variations
  const variations = [];
  for (let i = 1; i <= 10; i++) {
    const factor = goLighter ? 1 + i * 0.15 : 1 - i * 0.1;
    const r = Math.min(255, Math.max(0, Math.round(currentColor.r * factor)));
    const g = Math.min(255, Math.max(0, Math.round(currentColor.g * factor)));
    const b = Math.min(255, Math.max(0, Math.round(currentColor.b * factor)));
    variations.push({ r, g, b });
  }

  // Also add pure light/dark options
  if (goLighter) {
    variations.push({ r: 255, g: 255, b: 255 });
    variations.push({ r: 240, g: 240, b: 240 });
    variations.push({ r: 255, g: 255, b: 200 });
  } else {
    variations.push({ r: 0, g: 0, b: 0 });
    variations.push({ r: 30, g: 30, b: 30 });
    variations.push({ r: 20, g: 20, b: 50 });
  }

  for (const color of variations) {
    const ratio = getContrastRatio(color, backgroundColor);
    const score = getContrastScore(ratio);
    if (score >= targetScore) {
      const hex = rgbToHex(color.r, color.g, color.b);
      // Avoid duplicates
      if (!suggestions.find((s) => s.hex === hex)) {
        suggestions.push({ ...color, hex, score, ratio });
      }
    }
  }

  return suggestions
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

/**
 * Default t-shirt colors for the color simulator
 */
export const DEFAULT_TSHIRT_COLORS = [
  { name: 'Black', hex: '#000000' },
  { name: 'White', hex: '#ffffff' },
  { name: 'Navy', hex: '#1b2a4a' },
  { name: 'Royal Blue', hex: '#2563eb' },
  { name: 'Red', hex: '#dc2626' },
  { name: 'Forest Green', hex: '#166534' },
  { name: 'Charcoal', hex: '#374151' },
  { name: 'Sport Grey', hex: '#9ca3af' },
  { name: 'Maroon', hex: '#7f1d1d' },
  { name: 'Gold', hex: '#ca8a04' },
  { name: 'Purple', hex: '#7c3aed' },
  { name: 'Orange', hex: '#ea580c' },
  { name: 'Kelly Green', hex: '#16a34a' },
  { name: 'Light Blue', hex: '#93c5fd' },
  { name: 'Sand', hex: '#d4a574' },
];

/**
 * Default score rankings
 */
export const DEFAULT_RANKINGS = [
  { label: 'Excellent', min: 80, max: 100, color: '#10b981' },
  { label: 'Good', min: 60, max: 79, color: '#22c55e' },
  { label: 'Fair', min: 40, max: 59, color: '#f59e0b' },
  { label: 'Poor', min: 0, max: 39, color: '#ef4444' },
];
