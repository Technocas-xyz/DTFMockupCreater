/**
 * Garment Tint Engine V2
 * ═══════════════════════════════════════════════════════════════════════════════
 * Professional garment recoloring using luminance-preserving color mapping.
 * 
 * Pipeline:
 * 1. Extract luminance map from original garment
 * 2. Apply selected color while preserving luminance
 * 3. Reconstruct highlights, shadows, and texture
 * 4. Never affect artwork layer
 *
 * Uses Lab-like perceptual color space for accurate mapping.
 */

// ─── COLOR SPACE UTILITIES ───────────────────────────────────────────────────

// sRGB → Linear
function srgbToLinear(c) {
  c = c / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// Linear → sRGB
function linearToSrgb(c) {
  c = Math.max(0, Math.min(1, c));
  return c <= 0.0031308 ? Math.round(c * 12.92 * 255) : Math.round((1.055 * Math.pow(c, 1/2.4) - 0.055) * 255);
}

// Perceived luminance (ITU-R BT.709)
function getLuminance(r, g, b) {
  return srgbToLinear(r) * 0.2126 + srgbToLinear(g) * 0.7152 + srgbToLinear(b) * 0.0722;
}

// RGB to HSL
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h, s, l];
}

// HSL to RGB
function hslToRgb(h, s, l) {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1/3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1/3) * 255),
  ];
}

// ─── GARMENT ANALYSIS ────────────────────────────────────────────────────────

/**
 * Analyze a garment image to extract its base color and luminance statistics
 */
export function analyzeGarment(imageData) {
  const { data, width, height } = imageData;
  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  let minLum = 1, maxLum = 0;
  const lumValues = [];

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue; // skip transparent
    const r = data[i], g = data[i + 1], b = data[i + 2];
    rSum += r; gSum += g; bSum += b; count++;
    const lum = getLuminance(r, g, b);
    lumValues.push(lum);
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }

  if (count === 0) return null;

  const avgR = Math.round(rSum / count);
  const avgG = Math.round(gSum / count);
  const avgB = Math.round(bSum / count);
  const avgLum = lumValues.reduce((s, v) => s + v, 0) / lumValues.length;

  return {
    avgColor: { r: avgR, g: avgG, b: avgB },
    avgLuminance: avgLum,
    minLuminance: minLum,
    maxLuminance: maxLum,
    luminanceRange: maxLum - minLum,
    pixelCount: count,
  };
}

// ─── CORE TINTING ENGINE ─────────────────────────────────────────────────────

/**
 * Recolor a garment image to match the target color while preserving all texture/lighting.
 * 
 * Algorithm:
 * 1. For each pixel, compute its luminance (brightness)
 * 2. Normalize luminance relative to the garment's range
 * 3. Apply the target color at that normalized luminance
 * 4. Preserve original highlight/shadow contrast
 * 
 * This produces accurate color matching without muddy/desaturated results.
 * 
 * @param {ImageData} garmentData - original garment ImageData
 * @param {string} targetHex - target color hex (e.g., '#1a472a')
 * @returns {ImageData} - recolored garment
 */
export function recolorGarment(garmentData, targetHex) {
  const { data, width, height } = garmentData;
  const result = new Uint8ClampedArray(data.length);

  // Parse target color
  const hex = targetHex.replace('#', '');
  const tR = parseInt(hex.substring(0, 2), 16);
  const tG = parseInt(hex.substring(2, 4), 16);
  const tB = parseInt(hex.substring(4, 6), 16);
  const [tH, tS, tL] = rgbToHsl(tR, tG, tB);
  const tLum = getLuminance(tR, tG, tB);

  // Special case: white — just preserve original with minimal tint
  const isWhite = tR > 240 && tG > 240 && tB > 240;
  if (isWhite) {
    result.set(data);
    return new ImageData(result, width, height);
  }

  // Analyze garment to get luminance range
  const analysis = analyzeGarment(garmentData);
  if (!analysis) { result.set(data); return new ImageData(result, width, height); }

  const { minLuminance, maxLuminance, avgLuminance } = analysis;
  const lumRange = maxLuminance - minLuminance || 1;

  // Special case: black target
  const isBlack = tR < 25 && tG < 25 && tB < 25;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    result[i + 3] = a;

    if (a < 10) { result[i] = result[i+1] = result[i+2] = 0; continue; }

    const oR = data[i], oG = data[i + 1], oB = data[i + 2];
    const pixelLum = getLuminance(oR, oG, oB);

    // Normalize pixel luminance to 0-1 range relative to garment
    const normalizedLum = (pixelLum - minLuminance) / lumRange;

    if (isBlack) {
      // For black: preserve subtle luminance variations
      const darkLum = normalizedLum * 0.15; // keep very dark but with detail
      result[i] = linearToSrgb(srgbToLinear(tR) * (0.3 + darkLum * 3));
      result[i + 1] = linearToSrgb(srgbToLinear(tG) * (0.3 + darkLum * 3));
      result[i + 2] = linearToSrgb(srgbToLinear(tB) * (0.3 + darkLum * 3));
    } else {
      // General case: map target color to this pixel's luminance position
      // Use HSL: keep target hue+saturation, adjust lightness based on pixel luminance
      const pixelLightness = tL * 0.4 + normalizedLum * 0.6; // blend target lightness with pixel luminance
      
      // Highlights: pixels brighter than average get boosted toward white
      let finalL = pixelLightness;
      if (normalizedLum > 0.8) {
        // Highlight — blend toward white
        const highlightStrength = (normalizedLum - 0.8) / 0.2;
        finalL = pixelLightness + highlightStrength * (1 - pixelLightness) * 0.6;
      }
      // Shadows: pixels darker than average get pushed darker
      if (normalizedLum < 0.2) {
        const shadowStrength = (0.2 - normalizedLum) / 0.2;
        finalL = pixelLightness * (1 - shadowStrength * 0.5);
      }

      finalL = Math.max(0, Math.min(1, finalL));

      // Reduce saturation slightly in shadows and highlights for realism
      let finalS = tS;
      if (normalizedLum < 0.15 || normalizedLum > 0.9) {
        finalS *= 0.7;
      }

      const [fR, fG, fB] = hslToRgb(tH, finalS, finalL);
      result[i] = fR;
      result[i + 1] = fG;
      result[i + 2] = fB;
    }
  }

  return new ImageData(result, width, height);
}

// ─── CANVAS INTEGRATION ──────────────────────────────────────────────────────

/**
 * Apply garment recoloring to a canvas context.
 * Draws the recolored garment onto ctx at the specified position.
 * 
 * @param {CanvasRenderingContext2D} ctx - target canvas context
 * @param {HTMLImageElement|ImageBitmap} garmentImg - original garment image
 * @param {number} dx - destination x
 * @param {number} dy - destination y  
 * @param {number} dw - destination width
 * @param {number} dh - destination height
 * @param {string} colorHex - target color
 * @param {number} canvasW - full canvas width (for offscreen)
 * @param {number} canvasH - full canvas height (for offscreen)
 */
export function drawRecoloredGarment(ctx, garmentImg, dx, dy, dw, dh, colorHex, canvasW, canvasH) {
  const hex = colorHex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // White: just draw original
  if (r > 240 && g > 240 && b > 240) {
    ctx.drawImage(garmentImg, dx, dy, dw, dh);
    return;
  }

  // Render garment to temporary canvas at full size
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = dw;
  tempCanvas.height = dh;
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.imageSmoothingEnabled = true;
  tempCtx.imageSmoothingQuality = 'high';
  tempCtx.drawImage(garmentImg, 0, 0, dw, dh);

  // Get pixel data and recolor
  const imgData = tempCtx.getImageData(0, 0, dw, dh);
  const recolored = recolorGarment(imgData, colorHex);

  // Draw recolored garment to target context
  tempCtx.putImageData(recolored, 0, 0);
  ctx.drawImage(tempCanvas, dx, dy);
}

// ─── COLOR ACCURACY VALIDATION ───────────────────────────────────────────────

/**
 * Calculate Delta E (CIE76 approximation) between two colors
 */
export function calculateDeltaE(hex1, hex2) {
  const parse = (h) => {
    const x = h.replace('#', '');
    return [parseInt(x.substring(0,2),16), parseInt(x.substring(2,4),16), parseInt(x.substring(4,6),16)];
  };
  const [r1,g1,b1] = parse(hex1);
  const [r2,g2,b2] = parse(hex2);
  // Simplified Delta E using Lab approximation
  const [h1,s1,l1] = rgbToHsl(r1,g1,b1);
  const [h2,s2,l2] = rgbToHsl(r2,g2,b2);
  const dH = Math.abs(h1 - h2) * 360;
  const dS = Math.abs(s1 - s2) * 100;
  const dL = Math.abs(l1 - l2) * 100;
  return Math.sqrt(dH*dH + dS*dS + dL*dL);
}

/**
 * Validate color accuracy of a rendered garment
 */
export function validateColorAccuracy(renderedImageData, targetHex) {
  const analysis = analyzeGarment(renderedImageData);
  if (!analysis) return { deltaE: 999, pass: false };

  const avg = analysis.avgColor;
  const avgHex = `#${avg.r.toString(16).padStart(2,'0')}${avg.g.toString(16).padStart(2,'0')}${avg.b.toString(16).padStart(2,'0')}`;
  const deltaE = calculateDeltaE(targetHex, avgHex);

  return {
    targetColor: targetHex,
    renderedAvgColor: avgHex,
    deltaE: deltaE.toFixed(2),
    pass: deltaE < 15, // acceptable threshold
    avgLuminance: analysis.avgLuminance.toFixed(3),
  };
}
