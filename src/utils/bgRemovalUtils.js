/**
 * Background Removal Utilities
 * Provides flood-fill based background removal, object detection,
 * edge cleaning, and image enhancement functions.
 */

/**
 * Remove background using flood fill from edges
 * @param {ImageData} imageData - source image data
 * @param {number} tolerance - 0-100 color similarity threshold
 * @param {number} feather - 0-5 edge feather radius in pixels
 * @param {boolean} removeInteriorWhite - also remove white/light interior areas
 * @returns {ImageData} - processed image with transparent background
 */
export function removeBackground(imageData, tolerance = 30, feather = 0, removeInteriorWhite = false) {
  const width = imageData.width;
  const height = imageData.height;
  const data = new Uint8ClampedArray(imageData.data);
  const totalPixels = width * height;
  const visited = new Uint8Array(totalPixels);
  const isBackground = new Uint8Array(totalPixels);

  // Tolerance: 0-100 mapped to color distance 0-150
  // 30 = distance of 45 (good for most solid backgrounds)
  const toleranceScaled = (tolerance / 100) * 150;

  // Sample the dominant edge color (most common color along edges)
  const edgeColors = [];
  for (let x = 0; x < width; x++) {
    edgeColors.push(x); // top row
    edgeColors.push((height - 1) * width + x); // bottom row
  }
  for (let y = 1; y < height - 1; y++) {
    edgeColors.push(y * width); // left column
    edgeColors.push(y * width + (width - 1)); // right column
  }

  // Find the most common edge color (quantized to reduce variations)
  const colorCounts = {};
  for (const idx of edgeColors) {
    const offset = idx * 4;
    const r = Math.round(data[offset] / 8) * 8;
    const g = Math.round(data[offset + 1] / 8) * 8;
    const b = Math.round(data[offset + 2] / 8) * 8;
    const key = `${r},${g},${b}`;
    colorCounts[key] = (colorCounts[key] || 0) + 1;
  }

  // Get the dominant background color
  let dominantColor = { r: 0, g: 0, b: 0 };
  let maxCount = 0;
  for (const [key, count] of Object.entries(colorCounts)) {
    if (count > maxCount) {
      maxCount = count;
      const [r, g, b] = key.split(',').map(Number);
      dominantColor = { r, g, b };
    }
  }

  // Queue-based flood fill from all edge pixels
  const queue = [];

  // Start from edge pixels that match the dominant color
  for (const idx of edgeColors) {
    const offset = idx * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const dist = Math.sqrt(
      (r - dominantColor.r) ** 2 +
      (g - dominantColor.g) ** 2 +
      (b - dominantColor.b) ** 2
    );
    if (dist <= toleranceScaled * 1.5) { // Slightly more lenient for starting pixels
      visited[idx] = 1;
      isBackground[idx] = 1;
      queue.push(idx);
    }
  }

  // BFS flood fill — compare each pixel against the dominant BG color
  let head = 0;
  while (head < queue.length) {
    const pixelIdx = queue[head++];
    const px = pixelIdx % width;
    const py = Math.floor(pixelIdx / width);

    // Check 4-connected neighbors
    const neighbors = [];
    if (px > 0) neighbors.push(pixelIdx - 1);
    if (px < width - 1) neighbors.push(pixelIdx + 1);
    if (py > 0) neighbors.push(pixelIdx - width);
    if (py < height - 1) neighbors.push(pixelIdx + width);

    for (const nIdx of neighbors) {
      if (visited[nIdx]) continue;
      visited[nIdx] = 1;

      const nOffset = nIdx * 4;
      const r2 = data[nOffset];
      const g2 = data[nOffset + 1];
      const b2 = data[nOffset + 2];

      // Compare against dominant background color (not pixel-to-pixel)
      const dist = Math.sqrt(
        (r2 - dominantColor.r) ** 2 +
        (g2 - dominantColor.g) ** 2 +
        (b2 - dominantColor.b) ** 2
      );

      if (dist <= toleranceScaled) {
        isBackground[nIdx] = 1;
        queue.push(nIdx);
      }
    }
  }

  // Optional: remove interior white/light areas not connected to the edge
  // Uses a second pass: flood-fill from any non-background pixel that is white/near-white
  // Only removes pixels that are clearly white (brightness > 220) and not already removed
  if (removeInteriorWhite) {
    const WHITE_THRESHOLD = 220; // pixels brighter than this in all channels are considered white
    const interiorVisited = new Uint8Array(totalPixels);

    // Mark already-removed (background) pixels as visited so we skip them
    for (let i = 0; i < totalPixels; i++) {
      if (isBackground[i]) interiorVisited[i] = 1;
    }

    // Find all unvisited white pixels and flood-fill them out
    // These are enclosed white regions (not connected to the already-removed edge background)
    for (let i = 0; i < totalPixels; i++) {
      if (interiorVisited[i]) continue;
      const offset = i * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];

      // Is this pixel white/near-white?
      if (r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD) {
        // Flood fill this enclosed white region
        const wQueue = [i];
        interiorVisited[i] = 1;
        const regionPixels = [i];

        let wHead = 0;
        while (wHead < wQueue.length) {
          const pIdx = wQueue[wHead++];
          const px = pIdx % width;
          const py = Math.floor(pIdx / width);

          const neighbors = [];
          if (px > 0) neighbors.push(pIdx - 1);
          if (px < width - 1) neighbors.push(pIdx + 1);
          if (py > 0) neighbors.push(pIdx - width);
          if (py < height - 1) neighbors.push(pIdx + width);

          for (const nIdx of neighbors) {
            if (interiorVisited[nIdx]) continue;
            interiorVisited[nIdx] = 1;
            const nOff = nIdx * 4;
            const nr = data[nOff];
            const ng = data[nOff + 1];
            const nb = data[nOff + 2];

            // Continue filling if neighbour is also white/near-white
            if (nr >= WHITE_THRESHOLD && ng >= WHITE_THRESHOLD && nb >= WHITE_THRESHOLD) {
              wQueue.push(nIdx);
              regionPixels.push(nIdx);
            }
          }
        }

        // Mark all found white pixels as background (to be made transparent)
        for (const pIdx of regionPixels) {
          isBackground[pIdx] = 1;
        }
      }
    }
  }

  // Apply feathering if needed
  if (feather > 0) {
    const featherMask = new Float32Array(totalPixels);
    for (let i = 0; i < totalPixels; i++) {
      featherMask[i] = isBackground[i] ? 0 : 1;
    }

    // Simple box blur on the mask for feathering
    const radius = Math.ceil(feather);
    const blurred = new Float32Array(totalPixels);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let count = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              sum += featherMask[ny * width + nx];
              count++;
            }
          }
        }
        blurred[y * width + x] = sum / count;
      }
    }

    // Apply feathered alpha
    for (let i = 0; i < totalPixels; i++) {
      const offset = i * 4;
      data[offset + 3] = Math.round(blurred[i] * 255);
    }
  } else {
    // Hard cutoff - set background pixels to transparent
    for (let i = 0; i < totalPixels; i++) {
      if (isBackground[i]) {
        const offset = i * 4;
        data[offset + 3] = 0;
      }
    }
  }

  return new ImageData(data, width, height);
}

/**
 * Detect separate objects/regions in the foreground
 * @param {ImageData} imageData - image with background already removed
 * @param {number} width
 * @param {number} height
 * @returns {Array<{id: number, pixels: Array, bounds: {x,y,w,h}, thumbnail: string}>}
 */
export function detectObjects(imageData, width, height) {
  const data = imageData.data;
  const totalPixels = width * height;
  const labels = new Int32Array(totalPixels);
  const objects = [];
  let currentLabel = 0;

  // Connected component labeling on non-transparent pixels
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (labels[idx] !== 0) continue;
      if (data[idx * 4 + 3] < 10) continue; // skip transparent

      // BFS to find connected component
      currentLabel++;
      const component = [];
      const bfsQueue = [idx];
      labels[idx] = currentLabel;

      let minX = x, maxX = x, minY = y, maxY = y;

      let bfsHead = 0;
      while (bfsHead < bfsQueue.length) {
        const pIdx = bfsQueue[bfsHead++];
        const px = pIdx % width;
        const py = Math.floor(pIdx / width);
        component.push(pIdx);

        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;

        // 4-connected neighbors
        const neighbors = [];
        if (px > 0) neighbors.push(pIdx - 1);
        if (px < width - 1) neighbors.push(pIdx + 1);
        if (py > 0) neighbors.push(pIdx - width);
        if (py < height - 1) neighbors.push(pIdx + width);

        for (const nIdx of neighbors) {
          if (labels[nIdx] !== 0) continue;
          if (data[nIdx * 4 + 3] < 10) continue;
          labels[nIdx] = currentLabel;
          bfsQueue.push(nIdx);
        }
      }

      // Only keep objects with at least 50 pixels (filter noise)
      if (component.length >= 50) {
        objects.push({
          id: currentLabel,
          pixels: component,
          bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
          pixelCount: component.length,
          thumbnail: null, // will be generated in component
        });
      }
    }
  }

  // Sort by size (largest first)
  objects.sort((a, b) => b.pixelCount - a.pixelCount);

  // Re-assign IDs after sorting
  objects.forEach((obj, i) => {
    obj.id = i + 1;
  });

  return objects;
}

/**
 * Generate a thumbnail for a detected object
 * @param {ImageData} imageData
 * @param {{x,y,w,h}} bounds
 * @param {number} maxSize - max thumbnail dimension
 * @returns {string} data URL
 */
export function generateObjectThumbnail(imageData, bounds, maxSize = 80) {
  const canvas = document.createElement('canvas');
  const scale = Math.min(maxSize / bounds.w, maxSize / bounds.h, 1);
  canvas.width = Math.max(1, Math.round(bounds.w * scale));
  canvas.height = Math.max(1, Math.round(bounds.h * scale));
  const ctx = canvas.getContext('2d');

  // Create a temporary canvas with the full image
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = imageData.width;
  tempCanvas.height = imageData.height;
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.putImageData(imageData, 0, 0);

  // Draw the cropped region scaled down
  ctx.drawImage(
    tempCanvas,
    bounds.x, bounds.y, bounds.w, bounds.h,
    0, 0, canvas.width, canvas.height
  );

  return canvas.toDataURL('image/png');
}

/**
 * Remove specific objects from image
 * @param {ImageData} imageData
 * @param {Array<number>} objectIdsToRemove
 * @param {Array} objects - from detectObjects
 * @returns {ImageData}
 */
export function removeObjects(imageData, objectIdsToRemove, objects) {
  const data = new Uint8ClampedArray(imageData.data);
  const width = imageData.width;
  const height = imageData.height;

  const idsToRemove = new Set(objectIdsToRemove);

  for (const obj of objects) {
    if (idsToRemove.has(obj.id)) {
      for (const pixelIdx of obj.pixels) {
        const offset = pixelIdx * 4;
        data[offset + 3] = 0; // set to transparent
      }
    }
  }

  return new ImageData(data, width, height);
}

/**
 * Keep only specific objects, remove everything else
 * @param {ImageData} imageData
 * @param {Array<number>} objectIdsToKeep
 * @param {Array} objects - from detectObjects
 * @returns {ImageData}
 */
export function keepOnlyObjects(imageData, objectIdsToKeep, objects) {
  const data = new Uint8ClampedArray(imageData.data);
  const width = imageData.width;
  const height = imageData.height;

  const idsToKeep = new Set(objectIdsToKeep);

  // Build set of all pixels that belong to kept objects
  const keepPixels = new Set();
  for (const obj of objects) {
    if (idsToKeep.has(obj.id)) {
      for (const pixelIdx of obj.pixels) {
        keepPixels.add(pixelIdx);
      }
    }
  }

  // Remove pixels not in kept objects (only non-transparent ones)
  const totalPixels = width * height;
  for (let i = 0; i < totalPixels; i++) {
    if (data[i * 4 + 3] > 0 && !keepPixels.has(i)) {
      data[i * 4 + 3] = 0;
    }
  }

  return new ImageData(data, width, height);
}

/**
 * Clean edges - remove semi-transparent fringe pixels (1px erosion)
 * @param {ImageData} imageData
 * @param {number} width
 * @param {number} height
 * @returns {ImageData}
 */
export function cleanEdges(imageData, width, height) {
  const data = new Uint8ClampedArray(imageData.data);
  const original = new Uint8ClampedArray(imageData.data);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      if (original[idx + 3] === 0) continue;

      // Check if this pixel borders a transparent pixel
      const neighbors = [
        ((y - 1) * width + x) * 4,
        ((y + 1) * width + x) * 4,
        (y * width + (x - 1)) * 4,
        (y * width + (x + 1)) * 4,
      ];

      for (const nIdx of neighbors) {
        if (original[nIdx + 3] === 0) {
          // This pixel borders transparency - remove it
          data[idx + 3] = 0;
          break;
        }
      }
    }
  }

  return new ImageData(data, width, height);
}

/**
 * Enhance image - adjust brightness, contrast, sharpness, saturation
 * @param {ImageData} imageData
 * @param {{brightness: number, contrast: number, sharpness: number, saturation: number}} options
 * @returns {ImageData}
 */
export function enhanceImage(imageData, options = {}) {
  const { brightness = 0, contrast = 0, sharpness = 0, saturation = 0 } = options;
  const width = imageData.width;
  const height = imageData.height;
  const data = new Uint8ClampedArray(imageData.data);

  // Apply brightness and contrast
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue; // skip transparent

    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Brightness (-100 to 100 mapped to -255 to 255)
    const brightnessAdj = (brightness / 100) * 255;
    r += brightnessAdj;
    g += brightnessAdj;
    b += brightnessAdj;

    // Contrast
    r = contrastFactor * (r - 128) + 128;
    g = contrastFactor * (g - 128) + 128;
    b = contrastFactor * (b - 128) + 128;

    // Saturation
    if (saturation !== 0) {
      const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const satFactor = 1 + saturation / 100;
      r = gray + satFactor * (r - gray);
      g = gray + satFactor * (g - gray);
      b = gray + satFactor * (b - gray);
    }

    data[i] = Math.max(0, Math.min(255, Math.round(r)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
  }

  // Apply sharpness (unsharp mask)
  if (sharpness > 0) {
    const amount = sharpness / 100;
    const original = new Uint8ClampedArray(data);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        if (original[idx + 3] === 0) continue;

        for (let c = 0; c < 3; c++) {
          const center = original[idx + c];
          const neighbors =
            original[((y - 1) * width + x) * 4 + c] +
            original[((y + 1) * width + x) * 4 + c] +
            original[(y * width + (x - 1)) * 4 + c] +
            original[(y * width + (x + 1)) * 4 + c];
          const blur = neighbors / 4;
          const sharpened = center + amount * (center - blur);
          data[idx + c] = Math.max(0, Math.min(255, Math.round(sharpened)));
        }
      }
    }
  }

  return new ImageData(data, width, height);
}
