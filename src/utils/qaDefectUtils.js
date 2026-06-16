/**
 * QA Defect Analysis Utilities
 * Simulates image defect detection for DTF printing quality assurance
 */

// Defect type definitions
export const DEFECT_TYPES = [
  { id: 'semi-transparent', name: 'Semi-transparent Pixels', icon: '◐', color: '#8b5cf6' },
  { id: 'white-halo', name: 'White Halo', icon: '◯', color: '#06b6d4' },
  { id: 'glow-shadow', name: 'Glow / Shadow Edges', icon: '◈', color: '#f59e0b' },
  { id: 'feather-edges', name: 'Feather Edges', icon: '◮', color: '#ec4899' },
  { id: 'soft-cutout', name: 'Soft Cutout Edges', icon: '◑', color: '#14b8a6' },
  { id: 'floating-pixels', name: 'Floating Pixels', icon: '⋯', color: '#ef4444' },
  { id: 'noise-dots', name: 'Noise Dots', icon: '⁘', color: '#f97316' },
  { id: 'thin-line', name: 'Thin Line Risk', icon: '│', color: '#6366f1' },
];

// Severity levels
export const SEVERITY_LEVELS = {
  critical: { label: 'Critical', color: '#ef4444', bgColor: '#fef2f2' },
  major: { label: 'Major', color: '#f59e0b', bgColor: '#fffbeb' },
  minor: { label: 'Minor', color: '#eab308', bgColor: '#fefce8' },
};

/**
 * Analyze an image for DTF printing defects
 * @param {ImageData} imageData - Canvas ImageData object
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {object} Analysis results with defects array and summary
 */
export function analyzeImage(imageData, width, height) {
  const data = imageData.data;
  const defects = [];
  let defectId = 1;

  // 1. Check for semi-transparent pixels
  const semiTransparentResult = detectSemiTransparentPixels(data, width, height);
  if (semiTransparentResult.found) {
    defects.push({
      id: defectId++,
      name: 'Semi-transparent Pixels',
      type: 'semi-transparent',
      severity: semiTransparentResult.severity,
      confidence: semiTransparentResult.confidence,
      affectedArea: semiTransparentResult.affectedArea,
      category: 'Transparency',
      description: `Found ${semiTransparentResult.count} semi-transparent pixels (alpha between 1-254) that may cause inconsistent printing.`,
      whyItMatters: 'Semi-transparent pixels in DTF printing can result in unexpected color blending with the transfer film, causing washed-out or ghosted areas on the final garment.',
      detectionMethod: 'Alpha channel scanning: Each pixel is inspected for alpha values between 1 and 254 (neither fully opaque nor fully transparent).',
      howToInspect: [
        'Open the image in Photoshop and go to Channels panel',
        'Select the Alpha channel to view transparency',
        'Look for gray areas (semi-transparent) vs pure black/white',
        'Use Select > Color Range to isolate partial transparency',
      ],
      position: semiTransparentResult.position,
    });
  }

  // 2. Check for white halo
  const whiteHaloResult = detectWhiteHalo(data, width, height);
  if (whiteHaloResult.found) {
    defects.push({
      id: defectId++,
      name: 'White Halo',
      type: 'white-halo',
      severity: whiteHaloResult.severity,
      confidence: whiteHaloResult.confidence,
      affectedArea: whiteHaloResult.affectedArea,
      category: 'Edge Quality',
      description: `Detected white/near-white fringe pixels around ${whiteHaloResult.edgeCount} edge areas that will be visible on dark garments.`,
      whyItMatters: 'White halo appears as a visible white outline when printed on dark-colored garments. This is one of the most common and noticeable DTF printing defects.',
      detectionMethod: 'Edge proximity analysis: Identifies white or near-white pixels (R>240, G>240, B>240) that are adjacent to transparent areas.',
      howToInspect: [
        'Zoom into edges of the artwork at 400%+',
        'Place the design on a dark background to reveal white fringe',
        'Check all cutout edges and around text elements',
        'Use Photoshop Minimum filter to detect halo width',
      ],
      position: whiteHaloResult.position,
    });
  }

  // 3. Check edge quality (glow/shadow)
  const glowShadowResult = detectGlowShadow(data, width, height);
  if (glowShadowResult.found) {
    defects.push({
      id: defectId++,
      name: 'Glow / Shadow Edges',
      type: 'glow-shadow',
      severity: glowShadowResult.severity,
      confidence: glowShadowResult.confidence,
      affectedArea: glowShadowResult.affectedArea,
      category: 'Edge Quality',
      description: `Detected soft glow or shadow effects extending ${glowShadowResult.spreadPx}px from artwork edges.`,
      whyItMatters: 'Glow and shadow effects use gradual transparency fading which does not reproduce cleanly in DTF printing, resulting in visible banding or hard edges where the gradient ends.',
      detectionMethod: 'Gradient transition analysis: Measures the alpha channel transition rate at artwork boundaries to detect gradual falloff patterns typical of glow/shadow effects.',
      howToInspect: [
        'Check Layer Styles for any Outer Glow or Drop Shadow effects',
        'View the image on a checkerboard background at high zoom',
        'Look for gradual fade-outs around the artwork boundary',
        'Flatten effects and apply a hard edge mask if needed',
      ],
      position: glowShadowResult.position,
    });
  }

  // 4. Check for feathered edges
  const featherResult = detectFeatherEdges(data, width, height);
  if (featherResult.found) {
    defects.push({
      id: defectId++,
      name: 'Feather Edges',
      type: 'feather-edges',
      severity: featherResult.severity,
      confidence: featherResult.confidence,
      affectedArea: featherResult.affectedArea,
      category: 'Edge Quality',
      description: `Found ${featherResult.featherWidth}px average feathering on artwork edges affecting print sharpness.`,
      whyItMatters: 'Feathered edges create a soft transition zone that appears as a fuzzy or blurry outline when printed, reducing the crispness and professional quality of the final product.',
      detectionMethod: 'Edge gradient measurement: Analyzes the transition width from fully opaque to fully transparent at detected boundaries.',
      howToInspect: [
        'Zoom to 800% on any artwork edge',
        'Count the pixels between fully opaque and fully transparent',
        'Ideal DTF edges should be 0-1px transition',
        'Re-cut the artwork with a hard-edge selection tool',
      ],
      position: featherResult.position,
    });
  }

  // 5. Detect soft cutout edges
  const softCutoutResult = detectSoftCutout(data, width, height);
  if (softCutoutResult.found) {
    defects.push({
      id: defectId++,
      name: 'Soft Cutout Edges',
      type: 'soft-cutout',
      severity: softCutoutResult.severity,
      confidence: softCutoutResult.confidence,
      affectedArea: softCutoutResult.affectedArea,
      category: 'Edge Quality',
      description: `Background removal has left soft edges in ${softCutoutResult.regions} regions, indicating imprecise cutout.`,
      whyItMatters: 'Soft cutout edges indicate incomplete background removal. These semi-transparent border pixels will print as faint outlines, creating unprofessional-looking results.',
      detectionMethod: 'Boundary analysis: Examines contiguous edge regions for consistent partial transparency indicating automated background removal artifacts.',
      howToInspect: [
        'Toggle between the original and a solid color background',
        'Look for remaining fringe from the original background',
        'Check hair, fur, and complex edges for residual softness',
        'Use Refine Edge or manual masking for cleaner results',
      ],
      position: softCutoutResult.position,
    });
  }

  // 6. Detect floating/isolated pixels
  const floatingResult = detectFloatingPixels(data, width, height);
  if (floatingResult.found) {
    defects.push({
      id: defectId++,
      name: 'Floating Pixels',
      type: 'floating-pixels',
      severity: floatingResult.severity,
      confidence: floatingResult.confidence,
      affectedArea: floatingResult.affectedArea,
      category: 'Artifacts',
      description: `Found ${floatingResult.clusterCount} isolated pixel clusters disconnected from the main artwork.`,
      whyItMatters: 'Floating pixels are tiny isolated dots that may not adhere properly to the transfer film or garment. They can flake off after washing or appear as unwanted specks.',
      detectionMethod: 'Connected component analysis: Identifies small pixel clusters (under 5x5px) that are not connected to the main artwork body.',
      howToInspect: [
        'Zoom out to see the full artwork and look for stray dots',
        'Use Select > Color Range with Fuzziness set to 0',
        'Check areas around the artwork perimeter',
        'Remove with eraser or use Defringe command',
      ],
      position: floatingResult.position,
    });
  }

  // 7. Check for noise dots
  const noiseResult = detectNoiseDots(data, width, height);
  if (noiseResult.found) {
    defects.push({
      id: defectId++,
      name: 'Noise Dots',
      type: 'noise-dots',
      severity: noiseResult.severity,
      confidence: noiseResult.confidence,
      affectedArea: noiseResult.affectedArea,
      category: 'Artifacts',
      description: `Detected ${noiseResult.noiseCount} random noise specks scattered across the artwork area.`,
      whyItMatters: 'Noise dots are random colored specks that increase ink usage and reduce print clarity. They can be especially visible on light-colored garments where small color variations stand out.',
      detectionMethod: 'Isolated pixel detection: Scans for single pixels or very small clusters whose color significantly differs from their surrounding neighborhood.',
      howToInspect: [
        'Zoom to 200-400% and scan flat color areas',
        'Apply a slight Gaussian blur to a copy and compare',
        'Use Median filter (1px) to identify noise vs detail',
        'Clean with Dust & Scratches or selective smoothing',
      ],
      position: noiseResult.position,
    });
  }

  // 8. Detect thin lines at risk
  const thinLineResult = detectThinLines(data, width, height);
  if (thinLineResult.found) {
    defects.push({
      id: defectId++,
      name: 'Thin Line Risk',
      type: 'thin-line',
      severity: thinLineResult.severity,
      confidence: thinLineResult.confidence,
      affectedArea: thinLineResult.affectedArea,
      category: 'Print Risk',
      description: `Found ${thinLineResult.lineCount} line elements thinner than 2px that may not reproduce in DTF printing.`,
      whyItMatters: 'Lines thinner than 2px (approximately 0.5pt at 300 DPI) are at risk of breaking up or disappearing entirely during the DTF transfer process, especially on textured fabrics.',
      detectionMethod: 'Morphological analysis: Uses erosion simulation to identify elements that would disappear at minimum printable width thresholds.',
      howToInspect: [
        'Check all line work, borders, and fine text elements',
        'Print a test at actual size to verify line visibility',
        'Thicken lines to minimum 2-3px for reliable printing',
        'Consider if fine details can be simplified for DTF',
      ],
      position: thinLineResult.position,
    });
  }

  // Calculate summary
  const summary = calculateSummary(defects);

  return {
    defects,
    summary,
    analyzedAt: new Date().toISOString(),
    analysisMode: 'Standard (DTF)',
    inspectionArea: 'Entire Artwork',
  };
}

// Detection helper functions

function detectSemiTransparentPixels(data, width, height) {
  let count = 0;
  let firstX = 0, firstY = 0;
  const totalPixels = width * height;

  for (let i = 3; i < data.length; i += 4) {
    const alpha = data[i];
    if (alpha > 0 && alpha < 255) {
      count++;
      if (count === 1) {
        const pixelIndex = (i - 3) / 4;
        firstX = pixelIndex % width;
        firstY = Math.floor(pixelIndex / width);
      }
    }
  }

  if (count === 0) return { found: false };

  const percentage = (count / totalPixels) * 100;
  let severity = 'minor';
  if (percentage > 5) severity = 'critical';
  else if (percentage > 2) severity = 'major';

  return {
    found: true,
    count,
    severity,
    confidence: Math.min(98, 70 + Math.min(percentage * 5, 28)),
    affectedArea: percentage.toFixed(2),
    position: { x: (firstX / width) * 100, y: (firstY / height) * 100 },
  };
}

function detectWhiteHalo(data, width, height) {
  let edgeCount = 0;
  let firstX = 0, firstY = 0;
  const totalPixels = width * height;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];

      // Check if pixel is white/near-white and opaque
      if (r > 240 && g > 240 && b > 240 && a > 200) {
        // Check if adjacent to transparent
        const neighbors = [
          ((y - 1) * width + x) * 4,
          ((y + 1) * width + x) * 4,
          (y * width + (x - 1)) * 4,
          (y * width + (x + 1)) * 4,
        ];
        for (const nIdx of neighbors) {
          if (data[nIdx + 3] < 50) {
            edgeCount++;
            if (edgeCount === 1) { firstX = x; firstY = y; }
            break;
          }
        }
      }
    }
    // Sample every 3rd row for performance
    if (y % 3 !== 0) y++;
  }

  if (edgeCount === 0) return { found: false };

  const percentage = (edgeCount / totalPixels) * 100;
  let severity = 'minor';
  if (edgeCount > 500) severity = 'critical';
  else if (edgeCount > 100) severity = 'major';

  return {
    found: true,
    edgeCount,
    severity,
    confidence: Math.min(95, 65 + Math.min(edgeCount / 10, 30)),
    affectedArea: percentage.toFixed(2),
    position: { x: (firstX / width) * 100, y: (firstY / height) * 100 },
  };
}

function detectGlowShadow(data, width, height) {
  let gradientPixels = 0;
  let maxSpread = 0;
  let firstX = 0, firstY = 0;
  const totalPixels = width * height;

  // Sample edges for gradient transitions
  for (let y = 0; y < height; y += 2) {
    let inTransition = false;
    let transitionWidth = 0;

    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const a = data[idx + 3];

      if (a > 0 && a < 255) {
        if (!inTransition) {
          inTransition = true;
          transitionWidth = 0;
        }
        transitionWidth++;
        gradientPixels++;
      } else {
        if (inTransition && transitionWidth > 5) {
          maxSpread = Math.max(maxSpread, transitionWidth);
          if (firstX === 0 && firstY === 0) {
            firstX = x - transitionWidth;
            firstY = y;
          }
        }
        inTransition = false;
        transitionWidth = 0;
      }
    }
  }

  if (maxSpread < 5) return { found: false };

  const percentage = (gradientPixels / totalPixels) * 100;
  let severity = 'minor';
  if (maxSpread > 15) severity = 'critical';
  else if (maxSpread > 8) severity = 'major';

  return {
    found: true,
    spreadPx: maxSpread,
    severity,
    confidence: Math.min(92, 60 + Math.min(maxSpread * 3, 32)),
    affectedArea: percentage.toFixed(2),
    position: { x: (Math.max(0, firstX) / width) * 100, y: (firstY / height) * 100 },
  };
}

function detectFeatherEdges(data, width, height) {
  let featherPixels = 0;
  let totalEdgePixels = 0;
  let maxFeatherWidth = 0;
  let firstX = 0, firstY = 0;
  const totalPixels = width * height;

  // Scan horizontal lines for edge transitions
  for (let y = 0; y < height; y += 3) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const prevIdx = (y * width + (x - 1)) * 4;
      const a = data[idx + 3];
      const prevA = data[prevIdx + 3];

      // Detect edge (transition from transparent to opaque or vice versa)
      if ((prevA === 0 && a > 0) || (prevA > 0 && a === 0)) {
        totalEdgePixels++;
        // Measure feather width
        let featherWidth = 0;
        for (let fx = x; fx < Math.min(x + 20, width); fx++) {
          const fIdx = (y * width + fx) * 4;
          const fA = data[fIdx + 3];
          if (fA > 0 && fA < 255) {
            featherWidth++;
            featherPixels++;
          } else {
            break;
          }
        }
        if (featherWidth > 2) {
          maxFeatherWidth = Math.max(maxFeatherWidth, featherWidth);
          if (firstX === 0 && firstY === 0) {
            firstX = x;
            firstY = y;
          }
        }
      }
    }
  }

  if (maxFeatherWidth < 3) return { found: false };

  const avgFeather = totalEdgePixels > 0 ? Math.round(featherPixels / totalEdgePixels) : 0;
  const percentage = (featherPixels / totalPixels) * 100;
  let severity = 'minor';
  if (avgFeather > 5) severity = 'major';
  if (avgFeather > 10) severity = 'critical';

  return {
    found: true,
    featherWidth: avgFeather || maxFeatherWidth,
    severity,
    confidence: Math.min(88, 55 + Math.min(maxFeatherWidth * 4, 33)),
    affectedArea: percentage.toFixed(2),
    position: { x: (firstX / width) * 100, y: (firstY / height) * 100 },
  };
}

function detectSoftCutout(data, width, height) {
  let softEdgeRegions = 0;
  let firstX = 0, firstY = 0;
  const totalPixels = width * height;
  let softPixelCount = 0;

  // Check border regions for consistent partial transparency
  const borderSize = Math.max(10, Math.min(width, height) * 0.05);

  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const idx = (y * width + x) * 4;
      const a = data[idx + 3];

      if (a > 20 && a < 230) {
        // Check if it's near an edge between opaque and transparent
        let hasOpaqueNeighbor = false;
        let hasTransparentNeighbor = false;

        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const ny = y + dy, nx = x + dx;
            if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
              const nIdx = (ny * width + nx) * 4;
              if (data[nIdx + 3] > 250) hasOpaqueNeighbor = true;
              if (data[nIdx + 3] < 10) hasTransparentNeighbor = true;
            }
          }
        }

        if (hasOpaqueNeighbor && hasTransparentNeighbor) {
          softPixelCount++;
          if (softEdgeRegions === 0) { firstX = x; firstY = y; }
          softEdgeRegions++;
        }
      }
    }
  }

  if (softEdgeRegions < 5) return { found: false };

  const percentage = (softPixelCount * 16 / totalPixels) * 100; // Multiply by sampling factor
  let severity = 'minor';
  if (softEdgeRegions > 50) severity = 'major';
  if (softEdgeRegions > 150) severity = 'critical';

  return {
    found: true,
    regions: softEdgeRegions,
    severity,
    confidence: Math.min(85, 50 + Math.min(softEdgeRegions, 35)),
    affectedArea: Math.min(percentage, 15).toFixed(2),
    position: { x: (firstX / width) * 100, y: (firstY / height) * 100 },
  };
}

function detectFloatingPixels(data, width, height) {
  let clusters = [];
  let visited = new Set();
  const totalPixels = width * height;

  // BFS to find small connected components
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const idx = (y * width + x) * 4;
      const key = `${x},${y}`;

      if (data[idx + 3] > 50 && !visited.has(key)) {
        // BFS to find cluster size
        const queue = [{ x, y }];
        let clusterSize = 0;
        const clusterStart = { x, y };
        visited.add(key);

        while (queue.length > 0 && clusterSize < 30) {
          const { x: cx, y: cy } = queue.shift();
          clusterSize++;

          const dirs = [[-2, 0], [2, 0], [0, -2], [0, 2]];
          for (const [dx, dy] of dirs) {
            const nx = cx + dx, ny = cy + dy;
            const nKey = `${nx},${ny}`;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height && !visited.has(nKey)) {
              const nIdx = (ny * width + nx) * 4;
              if (data[nIdx + 3] > 50) {
                visited.add(nKey);
                queue.push({ x: nx, y: ny });
              }
            }
          }
        }

        if (clusterSize >= 1 && clusterSize <= 6) {
          clusters.push(clusterStart);
        }
      }
    }
  }

  if (clusters.length < 3) return { found: false };

  let severity = 'minor';
  if (clusters.length > 20) severity = 'major';
  if (clusters.length > 50) severity = 'critical';

  return {
    found: true,
    clusterCount: clusters.length,
    severity,
    confidence: Math.min(90, 55 + Math.min(clusters.length * 2, 35)),
    affectedArea: ((clusters.length * 4) / totalPixels * 100).toFixed(2),
    position: clusters.length > 0
      ? { x: (clusters[0].x / width) * 100, y: (clusters[0].y / height) * 100 }
      : { x: 50, y: 50 },
  };
}

function detectNoiseDots(data, width, height) {
  let noiseCount = 0;
  let firstX = 0, firstY = 0;
  const totalPixels = width * height;

  // Check for pixels that significantly differ from neighbors
  for (let y = 2; y < height - 2; y += 3) {
    for (let x = 2; x < width - 2; x += 3) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] < 50) continue; // Skip transparent

      const r = data[idx], g = data[idx + 1], b = data[idx + 2];

      // Compare with surrounding pixels
      let diffSum = 0;
      let neighborCount = 0;
      const offsets = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

      for (const [dy, dx] of offsets) {
        const nIdx = ((y + dy) * width + (x + dx)) * 4;
        if (data[nIdx + 3] > 50) {
          const dr = Math.abs(r - data[nIdx]);
          const dg = Math.abs(g - data[nIdx + 1]);
          const db = Math.abs(b - data[nIdx + 2]);
          diffSum += (dr + dg + db) / 3;
          neighborCount++;
        }
      }

      if (neighborCount > 4) {
        const avgDiff = diffSum / neighborCount;
        if (avgDiff > 60) {
          noiseCount++;
          if (noiseCount === 1) { firstX = x; firstY = y; }
        }
      }
    }
  }

  if (noiseCount < 5) return { found: false };

  let severity = 'minor';
  if (noiseCount > 50) severity = 'major';
  if (noiseCount > 200) severity = 'critical';

  return {
    found: true,
    noiseCount,
    severity,
    confidence: Math.min(82, 45 + Math.min(noiseCount, 37)),
    affectedArea: ((noiseCount * 9) / totalPixels * 100).toFixed(2),
    position: { x: (firstX / width) * 100, y: (firstY / height) * 100 },
  };
}

function detectThinLines(data, width, height) {
  let thinLinePixels = 0;
  let lineCount = 0;
  let firstX = 0, firstY = 0;
  const totalPixels = width * height;

  // Detect horizontal thin lines
  for (let y = 1; y < height - 1; y += 2) {
    let lineLength = 0;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const above = ((y - 1) * width + x) * 4;
      const below = ((y + 1) * width + x) * 4;

      if (data[idx + 3] > 200 && data[above + 3] < 50 && data[below + 3] < 50) {
        lineLength++;
        thinLinePixels++;
      } else {
        if (lineLength > 10) {
          lineCount++;
          if (lineCount === 1) { firstX = x - lineLength; firstY = y; }
        }
        lineLength = 0;
      }
    }
    if (lineLength > 10) lineCount++;
  }

  // Detect vertical thin lines
  for (let x = 1; x < width - 1; x += 2) {
    let lineLength = 0;
    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * 4;
      const left = (y * width + (x - 1)) * 4;
      const right = (y * width + (x + 1)) * 4;

      if (data[idx + 3] > 200 && data[left + 3] < 50 && data[right + 3] < 50) {
        lineLength++;
        thinLinePixels++;
      } else {
        if (lineLength > 10) {
          lineCount++;
          if (firstX === 0 && firstY === 0) { firstX = x; firstY = y - lineLength; }
        }
        lineLength = 0;
      }
    }
    if (lineLength > 10) lineCount++;
  }

  if (lineCount === 0) return { found: false };

  let severity = 'minor';
  if (lineCount > 10) severity = 'major';
  if (lineCount > 30) severity = 'critical';

  return {
    found: true,
    lineCount,
    severity,
    confidence: Math.min(87, 50 + Math.min(lineCount * 4, 37)),
    affectedArea: ((thinLinePixels) / totalPixels * 100).toFixed(2),
    position: { x: (Math.max(0, firstX) / width) * 100, y: (Math.max(0, firstY) / height) * 100 },
  };
}

function calculateSummary(defects) {
  const critical = defects.filter(d => d.severity === 'critical').length;
  const major = defects.filter(d => d.severity === 'major').length;
  const minor = defects.filter(d => d.severity === 'minor').length;
  const totalChecks = 8;
  const passed = totalChecks - defects.length;

  // Overall score: 100 minus penalties
  let score = 100;
  score -= critical * 25;
  score -= major * 12;
  score -= minor * 5;
  score = Math.max(0, Math.min(100, score));

  // Average confidence
  const avgConfidence = defects.length > 0
    ? Math.round(defects.reduce((sum, d) => sum + d.confidence, 0) / defects.length)
    : 100;

  let confidenceLevel = 'High';
  if (avgConfidence < 60) confidenceLevel = 'Low';
  else if (avgConfidence < 80) confidenceLevel = 'Medium';

  return {
    overallScore: score,
    critical,
    major,
    minor,
    passed,
    totalChecks,
    confidence: avgConfidence,
    confidenceLevel,
  };
}

/**
 * Get image metadata from a loaded image
 */
export function getImageMetadata(file, img) {
  return {
    filename: file.name,
    dimensions: `${img.naturalWidth} × ${img.naturalHeight}px`,
    width: img.naturalWidth,
    height: img.naturalHeight,
    dpi: estimateDPI(img.naturalWidth, img.naturalHeight),
    colorMode: 'RGBA',
    backgroundType: 'Transparent (PNG)',
    fileSize: formatFileSize(file.size),
  };
}

function estimateDPI(width, height) {
  // Estimate based on typical DTF print sizes (assume ~10 inch print width)
  const estimatedDpi = Math.round(width / 10);
  return estimatedDpi;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}
