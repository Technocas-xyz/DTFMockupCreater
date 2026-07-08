import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  removeBackground,
  removeBackgroundFast,
  removeBackgroundBalanced,
  removeBackgroundAI,
  detectArtworkType,
  detectObjects,
  generateObjectThumbnail,
  removeObjects,
  keepOnlyObjects,
  cleanEdges,
  enhanceImage,
} from '../utils/bgRemovalUtils';
import './BGRemover.css';

// ─── CONSTANTS ──────────────────────────────────────────────────────────────────
const MAX_HISTORY = 50;
const ZOOM_LEVELS = [25, 50, 100, 200, 400, 800, 1600];
const CROP_RATIOS = [
  { label: 'Free', value: null },
  { label: '1:1', value: 1 },
  { label: '4:5', value: 4/5 },
  { label: '5:6', value: 5/6 },
  { label: '16:9', value: 16/9 },
  { label: 'Portrait', value: 3/4 },
  { label: 'Landscape', value: 4/3 },
];

// ─── UTILITY: Image manipulation helpers ────────────────────────────────────
function getImageDataFromUrl(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };
    img.src = url;
  });
}

function imageDataToUrl(imageData) {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

function analyzeImageQuality(imageData) {
  const { data, width, height } = imageData;
  let hasTransparency = false;
  let hasWhiteHalo = false;
  let hasBlackHalo = false;
  let floatingPixels = 0;
  let edgePixels = 0;
  let totalOpaque = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const a = data[idx + 3];
      if (a === 0) { hasTransparency = true; continue; }
      if (a > 0 && a < 255) hasTransparency = true;
      totalOpaque++;

      // Check for semi-transparent edge pixels (halo detection)
      if (a > 20 && a < 200) {
        edgePixels++;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        if (r > 230 && g > 230 && b > 230) hasWhiteHalo = true;
        if (r < 30 && g < 30 && b < 30) hasBlackHalo = true;
      }

      // Floating pixel detection (isolated opaque pixels)
      if (a > 128) {
        let neighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              if (data[((ny * width + nx) * 4) + 3] > 128) neighbors++;
            }
          }
        }
        if (neighbors <= 1) floatingPixels++;
      }
    }
  }

  const dpi = Math.round(width / 10.75); // Assume 10.75" is standard
  const printW = (width / 300).toFixed(1);
  const printH = (height / 300).toFixed(1);
  const hasBg = !hasTransparency;

  // Quality score
  let score = 5;
  if (width < 1000 || height < 1000) score--;
  if (floatingPixels > 50) score--;
  if (hasWhiteHalo || hasBlackHalo) score--;
  if (hasBg) score--;
  if (edgePixels / Math.max(totalOpaque, 1) > 0.1) score--;
  score = Math.max(1, Math.min(5, score));

  return {
    width, height, dpi,
    printSize: `${printW}" × ${printH}"`,
    hasTransparency, hasBg,
    hasWhiteHalo, hasBlackHalo,
    floatingPixels,
    edgeQuality: edgePixels < totalOpaque * 0.05 ? 'Good' : 'Needs Cleanup',
    qualityScore: score,
    recommendedPrintSize: `${(width / 300).toFixed(1)}" × ${(height / 300).toFixed(1)}" at 300 DPI`,
  };
}

// ─── COMPONENT ──────────────────────────────────────────────────────────────
function BGRemover({ sharedArtwork, onSendToQA, onSendToMockup }) {
  // Image state
  const [originalImage, setOriginalImage] = useState(null);
  const [processedImageData, setProcessedImageData] = useState(null);
  const [displayUrl, setDisplayUrl] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imageDimensions, setImageDimensions] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // History (undo/redo)
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Processing controls
  const [processingMode, setProcessingMode] = useState('balanced');
  const [bgRemovalMode, setBgRemovalMode] = useState('balanced'); // fast | balanced | ai | manual
  const [sensitivity, setSensitivity] = useState(40);
  const [feather, setFeather] = useState(0);
  const [removeInteriorWhite, setRemoveInteriorWhite] = useState(true);
  const [bgRemoved, setBgRemoved] = useState(false);
  const [artworkDetection, setArtworkDetection] = useState(null);

  // Object selection
  const [detectedObjects, setDetectedObjects] = useState([]);
  const [selectedObjectIds, setSelectedObjectIds] = useState(new Set());

  // Enhancement state
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [sharpness, setSharpness] = useState(0);
  const [saturation, setSaturation] = useState(0);
  const [exposure, setExposure] = useState(0);
  const [gamma, setGamma] = useState(100);
  const [vibrance, setVibrance] = useState(0);
  const [temperature, setTemperature] = useState(0);
  const [highlights, setHighlights] = useState(0);
  const [shadows, setShadows] = useState(0);

  // Sharpness & Quality
  const [clarity, setClarity] = useState(0);
  const [noiseReduction, setNoiseReduction] = useState(0);

  // Edge controls
  const [edgeFeather, setEdgeFeather] = useState(0);
  const [edgeExpand, setEdgeExpand] = useState(0);
  const [edgeContract, setEdgeContract] = useState(0);

  // Color tools
  const [colorReplaceSrc, setColorReplaceSrc] = useState('#ffffff');
  const [colorReplaceDst, setColorReplaceDst] = useState('#000000');
  const [colorTolerance, setColorTolerance] = useState(30);

  // View state
  const [showBeforeAfter, setShowBeforeAfter] = useState(false);
  const [splitPosition, setSplitPosition] = useState(50);
  const [zoom, setZoom] = useState(100);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(false);
  const [showRulers, setShowRulers] = useState(false);
  const [handToolActive, setHandToolActive] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [viewMode, setViewMode] = useState('normal'); // normal | transparency | alpha

  // Collapsible sections state
  const [expandedSections, setExpandedSections] = useState({
    upload: true, crop: false, transform: false, bgRemoval: true,
    enhancement: true, sharpness: false, edgeCleanup: false,
    colorTools: false, optimization: false, effects: false,
    quality: false, exportSection: false, upscaler: true,
  });

  // Quality analysis
  const [qualityReport, setQualityReport] = useState(null);

  // Transform state
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);

  // Crop state
  const [isCropping, setIsCropping] = useState(false);
  const [cropRect, setCropRect] = useState(null); // {x, y, w, h} in % of image

  // Upscaler state
  const [upscaleFactor, setUpscaleFactor] = useState(4);
  const [targetDpi, setTargetDpi] = useState(300);
  const [enhanceStrength, setEnhanceStrength] = useState(70);
  const [upscaleSharpness, setUpscaleSharpness] = useState(50);
  const [upscaleNoiseReduction, setUpscaleNoiseReduction] = useState(30);
  const [upscaleEdgeProtection, setUpscaleEdgeProtection] = useState(70);
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [upscalePreview, setUpscalePreview] = useState(null);
  const [desiredPrintW, setDesiredPrintW] = useState('');
  const [desiredPrintH, setDesiredPrintH] = useState('');

  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const splitContainerRef = useRef(null);

  // ─── HISTORY MANAGEMENT ─────────────────────────────────────────────────────
  const pushHistory = useCallback((imgData, label) => {
    setHistory(prev => {
      const newHist = prev.slice(0, historyIndex + 1);
      newHist.push({ imageData: imgData, label, timestamp: Date.now() });
      if (newHist.length > MAX_HISTORY) newHist.shift();
      return newHist;
    });
    setHistoryIndex(prev => Math.min(prev + 1, MAX_HISTORY - 1));
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const newIdx = historyIndex - 1;
    setHistoryIndex(newIdx);
    const entry = history[newIdx];
    if (entry) {
      setProcessedImageData(entry.imageData);
      setDisplayUrl(imageDataToUrl(entry.imageData));
      setImageDimensions({ width: entry.imageData.width, height: entry.imageData.height });
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const newIdx = historyIndex + 1;
    setHistoryIndex(newIdx);
    const entry = history[newIdx];
    if (entry) {
      setProcessedImageData(entry.imageData);
      setDisplayUrl(imageDataToUrl(entry.imageData));
      setImageDimensions({ width: entry.imageData.width, height: entry.imageData.height });
    }
  }, [history, historyIndex]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
      // Spacebar = temporary hand tool
      if (e.code === 'Space' && !e.repeat && e.target.tagName !== 'INPUT') { e.preventDefault(); setSpaceHeld(true); }
      // H = toggle hand tool
      if (e.key === 'h' || e.key === 'H') { if (e.target.tagName !== 'INPUT') setHandToolActive(prev => !prev); }
      // + / - zoom
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomIn(); }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); zoomOut(); }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); zoomFit(); }
    };
    const handleKeyUp = (e) => {
      if (e.code === 'Space') { setSpaceHeld(false); }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [undo, redo]);

  // Mouse wheel zoom on preview area
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+Wheel = zoom to cursor
      if (e.deltaY < 0) setZoom(prev => { const idx = ZOOM_LEVELS.findIndex(z => z > prev); return idx >= 0 ? ZOOM_LEVELS[idx] : prev; });
      else setZoom(prev => { const idx = ZOOM_LEVELS.slice().reverse().findIndex(z => z < prev); return idx >= 0 ? ZOOM_LEVELS[ZOOM_LEVELS.length - 1 - idx] : prev; });
    } else if (e.shiftKey) {
      // Shift+Wheel = horizontal pan
      setPanOffset(prev => ({ ...prev, x: prev.x - e.deltaY }));
    } else {
      // Wheel = zoom
      if (e.deltaY < 0) setZoom(prev => { const idx = ZOOM_LEVELS.findIndex(z => z > prev); return idx >= 0 ? ZOOM_LEVELS[idx] : prev; });
      else setZoom(prev => { const idx = ZOOM_LEVELS.slice().reverse().findIndex(z => z < prev); return idx >= 0 ? ZOOM_LEVELS[ZOOM_LEVELS.length - 1 - idx] : prev; });
    }
  }, []);

  // ─── IMAGE LOADING ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (sharedArtwork && sharedArtwork.dataUrl) {
      loadImageFromUrl(sharedArtwork.dataUrl, sharedArtwork.filename || 'shared-artwork.png');
    }
  }, [sharedArtwork]);

  const loadImageFromUrl = (dataUrl, filename) => {
    const img = new Image();
    img.onload = () => {
      setOriginalImage(dataUrl);
      setDisplayUrl(dataUrl);
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      setImageFile({ name: filename, size: Math.round(dataUrl.length * 0.75) });
      setBgRemoved(false);
      setProcessedImageData(null);
      setDetectedObjects([]);
      setSelectedObjectIds(new Set());
      resetEnhancements();
      setHistory([]);
      setHistoryIndex(-1);
      setRotation(0);
      setFlipH(false);
      setFlipV(false);
      // Run quality analysis + artwork detection
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setQualityReport(analyzeImageQuality(imgData));
      const detection = detectArtworkType(imgData);
      setArtworkDetection(detection);
      setBgRemovalMode(detection.recommended);
    };
    img.src = dataUrl;
  };

  const resetEnhancements = () => {
    setBrightness(0); setContrast(0); setSharpness(0); setSaturation(0);
    setExposure(0); setGamma(100); setVibrance(0); setTemperature(0);
    setHighlights(0); setShadows(0); setClarity(0); setNoiseReduction(0);
  };

  // File upload
  const handleFileUpload = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      loadImageFromUrl(e.target.result, file.name);
      setImageFile(file);
    };
    reader.readAsDataURL(file);
  }, []);

  // Paste from clipboard
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) handleFileUpload(file);
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleFileUpload]);

  // Drag and drop
  const handleDragOver = useCallback((e) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e) => { e.preventDefault(); setIsDragging(false); }, []);
  const handleDrop = useCallback((e) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    handleFileUpload(file);
  }, [handleFileUpload]);

  // ─── BACKGROUND REMOVAL ──────────────────────────────────────────────────────
  const handleRemoveBackground = async () => {
    if (!originalImage) return;
    setIsProcessing(true);
    setTimeout(async () => {
      try {
        const imgData = await getImageDataFromUrl(originalImage);
        let processed;

        switch (bgRemovalMode) {
          case 'fast':
            processed = removeBackgroundFast(imgData);
            break;
          case 'ai':
            processed = removeBackgroundAI(imgData);
            break;
          case 'balanced':
          default:
            processed = removeBackgroundBalanced(imgData);
            break;
        }

        setProcessedImageData(processed);
        setDisplayUrl(imageDataToUrl(processed));
        setBgRemoved(true);
        pushHistory(processed, `Remove BG (${bgRemovalMode})`);
        setImageDimensions({ width: processed.width, height: processed.height });
        // Detect objects
        const objects = detectObjects(processed, processed.width, processed.height);
        const objectsWithThumbs = objects.map(obj => ({
          ...obj, thumbnail: generateObjectThumbnail(processed, obj.bounds),
        }));
        setDetectedObjects(objectsWithThumbs);
        // Auto-select artwork, deselect noise
        setSelectedObjectIds(new Set(objectsWithThumbs.filter(o => o.category === 'artwork').map(o => o.id)));
        // Update quality report
        setQualityReport(analyzeImageQuality(processed));
      } catch (err) { console.error('Background removal failed:', err); }
      setIsProcessing(false);
    }, 50);
  };

  // One-Click AI Optimize
  const handleOneClickOptimize = async () => {
    if (!originalImage) return;
    setIsProcessing(true);
    setTimeout(async () => {
      try {
        const imgData = await getImageDataFromUrl(originalImage);
        // Step 1: Detect type and use best mode
        const detection = detectArtworkType(imgData);
        let processed;
        if (detection.recommended === 'fast') processed = removeBackgroundFast(imgData);
        else if (detection.recommended === 'ai') processed = removeBackgroundAI(imgData);
        else processed = removeBackgroundBalanced(imgData);

        // Step 2: Clean edges
        processed = cleanEdges(processed, processed.width, processed.height);

        // Step 3: Trim
        const { data, width: w, height: h } = processed;
        let minX = w, minY = h, maxX = 0, maxY = 0;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (data[(y * w + x) * 4 + 3] > 0) {
              if (x < minX) minX = x; if (x > maxX) maxX = x;
              if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX >= minX && maxY >= minY) {
          minX = Math.max(0, minX - 2); minY = Math.max(0, minY - 2);
          maxX = Math.min(w - 1, maxX + 2); maxY = Math.min(h - 1, maxY + 2);
          const nw = maxX - minX + 1, nh = maxY - minY + 1;
          const tc = document.createElement('canvas');
          tc.width = nw; tc.height = nh;
          const tctx = tc.getContext('2d');
          const sc = document.createElement('canvas');
          sc.width = w; sc.height = h;
          sc.getContext('2d').putImageData(processed, 0, 0);
          tctx.drawImage(sc, minX, minY, nw, nh, 0, 0, nw, nh);
          processed = tctx.getImageData(0, 0, nw, nh);
        }

        setProcessedImageData(processed);
        setDisplayUrl(imageDataToUrl(processed));
        setBgRemoved(true);
        pushHistory(processed, 'AI Optimize');
        setImageDimensions({ width: processed.width, height: processed.height });
        setQualityReport(analyzeImageQuality(processed));
        const objects = detectObjects(processed, processed.width, processed.height);
        const objectsWithThumbs = objects.map(obj => ({ ...obj, thumbnail: generateObjectThumbnail(processed, obj.bounds) }));
        setDetectedObjects(objectsWithThumbs);
        setSelectedObjectIds(new Set(objectsWithThumbs.map(o => o.id)));
      } catch (err) { console.error('AI Optimize failed:', err); }
      setIsProcessing(false);
    }, 50);
  };

  const handleReset = () => {
    setDisplayUrl(originalImage);
    setProcessedImageData(null);
    setBgRemoved(false);
    setDetectedObjects([]);
    setSelectedObjectIds(new Set());
    resetEnhancements();
    setRotation(0); setFlipH(false); setFlipV(false);
  };

  // Manual mode removal (uses sensitivity/feather sliders)
  const handleRemoveBackgroundManual = async () => {
    if (!originalImage) return;
    setIsProcessing(true);
    setTimeout(async () => {
      try {
        const imgData = await getImageDataFromUrl(originalImage);
        const processed = removeBackground(imgData, sensitivity, feather, removeInteriorWhite);
        setProcessedImageData(processed);
        setDisplayUrl(imageDataToUrl(processed));
        setBgRemoved(true);
        pushHistory(processed, 'Remove BG (manual)');
        setImageDimensions({ width: processed.width, height: processed.height });
        const objects = detectObjects(processed, processed.width, processed.height);
        const objectsWithThumbs = objects.map(obj => ({ ...obj, thumbnail: generateObjectThumbnail(processed, obj.bounds) }));
        setDetectedObjects(objectsWithThumbs);
        setSelectedObjectIds(new Set(objectsWithThumbs.map(o => o.id)));
        setQualityReport(analyzeImageQuality(processed));
      } catch (err) { console.error('Manual BG removal failed:', err); }
      setIsProcessing(false);
    }, 50);
  };

  // Object selection handlers
  const toggleObjectSelection = (objId) => {
    setSelectedObjectIds(prev => {
      const next = new Set(prev);
      if (next.has(objId)) next.delete(objId); else next.add(objId);
      return next;
    });
  };

  const handleKeepSelected = () => {
    if (!processedImageData || selectedObjectIds.size === 0) return;
    setIsProcessing(true);
    setTimeout(() => {
      const result = keepOnlyObjects(processedImageData, Array.from(selectedObjectIds), detectedObjects);
      setProcessedImageData(result);
      setDisplayUrl(imageDataToUrl(result));
      pushHistory(result, 'Keep Selected');
      const newObjects = detectObjects(result, result.width, result.height);
      const objectsWithThumbs = newObjects.map(obj => ({ ...obj, thumbnail: generateObjectThumbnail(result, obj.bounds) }));
      setDetectedObjects(objectsWithThumbs);
      setSelectedObjectIds(new Set(objectsWithThumbs.map(o => o.id)));
      setIsProcessing(false);
    }, 50);
  };

  const handleDeleteSelected = () => {
    if (!processedImageData) return;
    const idsToDelete = detectedObjects.filter(o => !selectedObjectIds.has(o.id)).map(o => o.id);
    if (idsToDelete.length === 0) return;
    setIsProcessing(true);
    setTimeout(() => {
      const result = removeObjects(processedImageData, idsToDelete, detectedObjects);
      setProcessedImageData(result);
      setDisplayUrl(imageDataToUrl(result));
      pushHistory(result, 'Delete Objects');
      const newObjects = detectObjects(result, result.width, result.height);
      const objectsWithThumbs = newObjects.map(obj => ({ ...obj, thumbnail: generateObjectThumbnail(result, obj.bounds) }));
      setDetectedObjects(objectsWithThumbs);
      setSelectedObjectIds(new Set(objectsWithThumbs.map(o => o.id)));
      setIsProcessing(false);
    }, 50);
  };

  const handleInvertSelection = () => {
    const allIds = new Set(detectedObjects.map(o => o.id));
    setSelectedObjectIds(new Set([...allIds].filter(id => !selectedObjectIds.has(id))));
  };

  // ─── EDGE CLEANUP & TRIM ─────────────────────────────────────────────────────
  const handleCleanEdges = () => {
    if (!processedImageData) return;
    setIsProcessing(true);
    setTimeout(() => {
      const result = cleanEdges(processedImageData, processedImageData.width, processedImageData.height);
      setProcessedImageData(result);
      setDisplayUrl(imageDataToUrl(result));
      pushHistory(result, 'Clean Edges');
      setIsProcessing(false);
    }, 50);
  };

  const handleRemoveWhiteHalo = () => {
    if (!processedImageData) return;
    setIsProcessing(true);
    setTimeout(() => {
      const { data, width, height } = processedImageData;
      const result = new ImageData(new Uint8ClampedArray(data), width, height);
      const d = result.data;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const a = d[idx + 3];
          if (a > 0 && a < 200) {
            const r = d[idx], g = d[idx + 1], b = d[idx + 2];
            if (r > 200 && g > 200 && b > 200) { d[idx + 3] = 0; }
          }
        }
      }
      setProcessedImageData(result);
      setDisplayUrl(imageDataToUrl(result));
      pushHistory(result, 'Remove White Halo');
      setIsProcessing(false);
    }, 50);
  };

  const handleRemoveBlackHalo = () => {
    if (!processedImageData) return;
    setIsProcessing(true);
    setTimeout(() => {
      const { data, width, height } = processedImageData;
      const result = new ImageData(new Uint8ClampedArray(data), width, height);
      const d = result.data;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const a = d[idx + 3];
          if (a > 0 && a < 200) {
            const r = d[idx], g = d[idx + 1], b = d[idx + 2];
            if (r < 50 && g < 50 && b < 50) { d[idx + 3] = 0; }
          }
        }
      }
      setProcessedImageData(result);
      setDisplayUrl(imageDataToUrl(result));
      pushHistory(result, 'Remove Black Halo');
      setIsProcessing(false);
    }, 50);
  };

  const handleRemoveFloatingPixels = () => {
    if (!processedImageData) return;
    setIsProcessing(true);
    setTimeout(() => {
      const { data, width, height } = processedImageData;
      const result = new ImageData(new Uint8ClampedArray(data), width, height);
      const d = result.data;
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = (y * width + x) * 4;
          if (d[idx + 3] < 128) continue;
          let neighbors = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              if (d[((y + dy) * width + (x + dx)) * 4 + 3] > 128) neighbors++;
            }
          }
          if (neighbors <= 1) { d[idx + 3] = 0; }
        }
      }
      setProcessedImageData(result);
      setDisplayUrl(imageDataToUrl(result));
      pushHistory(result, 'Remove Floating Pixels');
      setIsProcessing(false);
    }, 50);
  };

  const handleTrim = () => {
    if (!processedImageData) return;
    setIsProcessing(true);
    setTimeout(() => {
      const { data, width: w, height: h } = processedImageData;
      let minX = w, minY = h, maxX = 0, maxY = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > 0) {
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < minX || maxY < minY) { setIsProcessing(false); return; }
      minX = Math.max(0, minX - 2); minY = Math.max(0, minY - 2);
      maxX = Math.min(w - 1, maxX + 2); maxY = Math.min(h - 1, maxY + 2);
      const newW = maxX - minX + 1, newH = maxY - minY + 1;
      const canvas = document.createElement('canvas');
      canvas.width = newW; canvas.height = newH;
      const ctx = canvas.getContext('2d');
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = w; tempCanvas.height = h;
      tempCanvas.getContext('2d').putImageData(processedImageData, 0, 0);
      ctx.drawImage(tempCanvas, minX, minY, newW, newH, 0, 0, newW, newH);
      const trimmedData = ctx.getImageData(0, 0, newW, newH);
      setProcessedImageData(trimmedData);
      setImageDimensions({ width: newW, height: newH });
      setDisplayUrl(canvas.toDataURL('image/png'));
      pushHistory(trimmedData, 'Trim');
      const newObjects = detectObjects(trimmedData, newW, newH);
      const objectsWithThumbs = newObjects.map(obj => ({ ...obj, thumbnail: generateObjectThumbnail(trimmedData, obj.bounds) }));
      setDetectedObjects(objectsWithThumbs);
      setSelectedObjectIds(new Set(objectsWithThumbs.map(o => o.id)));
      setIsProcessing(false);
    }, 50);
  };

  // ─── TRANSFORM ───────────────────────────────────────────────────────────────
  const applyCrop = () => {
    if (!cropRect || !imageDimensions) return;
    const sourceUrl = displayUrl || originalImage;
    if (!sourceUrl) return;
    setIsProcessing(true);
    setTimeout(() => {
      const img = new Image();
      img.onload = () => {
        const sx = Math.round((cropRect.x / 100) * img.naturalWidth);
        const sy = Math.round((cropRect.y / 100) * img.naturalHeight);
        const sw = Math.round((cropRect.w / 100) * img.naturalWidth);
        const sh = Math.round((cropRect.h / 100) * img.naturalHeight);
        if (sw < 10 || sh < 10) { setIsProcessing(false); return; }
        const canvas = document.createElement('canvas');
        canvas.width = sw; canvas.height = sh;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        const result = ctx.getImageData(0, 0, sw, sh);
        setProcessedImageData(result);
        setDisplayUrl(canvas.toDataURL('image/png'));
        setImageDimensions({ width: sw, height: sh });
        pushHistory(result, 'Crop');
        if (!bgRemoved) setBgRemoved(true);
        setIsCropping(false);
        setCropRect(null);
        setIsProcessing(false);
      };
      img.src = sourceUrl;
    }, 50);
  };

  const applyTransform = (type) => {
    const src = processedImageData || (displayUrl === originalImage ? null : null);
    if (!src && !originalImage) return;
    setIsProcessing(true);
    setTimeout(async () => {
      const imgData = src || await getImageDataFromUrl(originalImage);
      const { width: w, height: h } = imgData;
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = w; srcCanvas.height = h;
      srcCanvas.getContext('2d').putImageData(imgData, 0, 0);

      let dw = w, dh = h;
      if (type === 'rotate90' || type === 'rotate270') { dw = h; dh = w; }
      const dstCanvas = document.createElement('canvas');
      dstCanvas.width = dw; dstCanvas.height = dh;
      const ctx = dstCanvas.getContext('2d');

      ctx.save();
      if (type === 'rotate90') { ctx.translate(dw, 0); ctx.rotate(Math.PI / 2); }
      else if (type === 'rotate180') { ctx.translate(dw, dh); ctx.rotate(Math.PI); }
      else if (type === 'rotate270') { ctx.translate(0, dh); ctx.rotate(-Math.PI / 2); }
      else if (type === 'flipH') { ctx.translate(dw, 0); ctx.scale(-1, 1); }
      else if (type === 'flipV') { ctx.translate(0, dh); ctx.scale(1, -1); }
      ctx.drawImage(srcCanvas, 0, 0);
      ctx.restore();

      const result = ctx.getImageData(0, 0, dw, dh);
      setProcessedImageData(result);
      setImageDimensions({ width: dw, height: dh });
      setDisplayUrl(dstCanvas.toDataURL('image/png'));
      pushHistory(result, type);
      if (!bgRemoved) setBgRemoved(true);
      setIsProcessing(false);
    }, 50);
  };

  // ─── COLOR TOOLS ────────────────────────────────────────────────────────────
  const handleReplaceColor = () => {
    if (!processedImageData) return;
    setIsProcessing(true);
    setTimeout(() => {
      const { data, width, height } = processedImageData;
      const result = new ImageData(new Uint8ClampedArray(data), width, height);
      const d = result.data;
      const sr = parseInt(colorReplaceSrc.slice(1, 3), 16);
      const sg = parseInt(colorReplaceSrc.slice(3, 5), 16);
      const sb = parseInt(colorReplaceSrc.slice(5, 7), 16);
      const dr = parseInt(colorReplaceDst.slice(1, 3), 16);
      const dg = parseInt(colorReplaceDst.slice(3, 5), 16);
      const db = parseInt(colorReplaceDst.slice(5, 7), 16);
      const tol = colorTolerance;

      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        const dist = Math.sqrt((d[i] - sr) ** 2 + (d[i + 1] - sg) ** 2 + (d[i + 2] - sb) ** 2);
        if (dist <= tol * 2.55) { d[i] = dr; d[i + 1] = dg; d[i + 2] = db; }
      }
      setProcessedImageData(result);
      setDisplayUrl(imageDataToUrl(result));
      pushHistory(result, 'Replace Color');
      setIsProcessing(false);
    }, 50);
  };

  const handleGrayscale = () => {
    if (!processedImageData) return;
    setIsProcessing(true);
    setTimeout(() => {
      const { data, width, height } = processedImageData;
      const result = new ImageData(new Uint8ClampedArray(data), width, height);
      const d = result.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        const gray = Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
        d[i] = d[i + 1] = d[i + 2] = gray;
      }
      setProcessedImageData(result);
      setDisplayUrl(imageDataToUrl(result));
      pushHistory(result, 'Grayscale');
      setIsProcessing(false);
    }, 50);
  };

  const handleInvertColors = () => {
    if (!processedImageData) return;
    setIsProcessing(true);
    setTimeout(() => {
      const { data, width, height } = processedImageData;
      const result = new ImageData(new Uint8ClampedArray(data), width, height);
      const d = result.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2];
      }
      setProcessedImageData(result);
      setDisplayUrl(imageDataToUrl(result));
      pushHistory(result, 'Invert Colors');
      setIsProcessing(false);
    }, 50);
  };

  // ─── AI UPSCALER ────────────────────────────────────────────────────────────
  const performUpscale = useCallback(async (factor = upscaleFactor) => {
    const sourceUrl = displayUrl || originalImage;
    if (!sourceUrl) return;
    setIsUpscaling(true);

    setTimeout(async () => {
      try {
        const img = await new Promise((resolve) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.src = sourceUrl;
        });

        const srcW = img.naturalWidth;
        const srcH = img.naturalHeight;
        const dstW = Math.round(srcW * factor);
        const dstH = Math.round(srcH * factor);

        // ═══ STEP 1: Extract source pixels ═══
        const srcCanvas = document.createElement('canvas');
        srcCanvas.width = srcW;
        srcCanvas.height = srcH;
        const srcCtx = srcCanvas.getContext('2d');
        srcCtx.drawImage(img, 0, 0);
        const srcData = srcCtx.getImageData(0, 0, srcW, srcH);

        // ═══ STEP 2: Separate RGB and Alpha channels ═══
        const rgbCanvas = document.createElement('canvas');
        rgbCanvas.width = srcW;
        rgbCanvas.height = srcH;
        const rgbCtx = rgbCanvas.getContext('2d');
        const rgbData = rgbCtx.createImageData(srcW, srcH);

        const alphaCanvas = document.createElement('canvas');
        alphaCanvas.width = srcW;
        alphaCanvas.height = srcH;
        const alphaCtx = alphaCanvas.getContext('2d');
        const alphaData = alphaCtx.createImageData(srcW, srcH);

        for (let i = 0; i < srcData.data.length; i += 4) {
          // RGB channel (premultiply-safe: fill transparent areas with edge color)
          rgbData.data[i] = srcData.data[i];
          rgbData.data[i + 1] = srcData.data[i + 1];
          rgbData.data[i + 2] = srcData.data[i + 2];
          rgbData.data[i + 3] = 255; // fully opaque RGB
          // Alpha as grayscale
          const a = srcData.data[i + 3];
          alphaData.data[i] = a;
          alphaData.data[i + 1] = a;
          alphaData.data[i + 2] = a;
          alphaData.data[i + 3] = 255;
        }
        rgbCtx.putImageData(rgbData, 0, 0);
        alphaCtx.putImageData(alphaData, 0, 0);

        // ═══ STEP 3: Multi-pass upscale RGB ═══
        let curRGB = rgbCanvas, curW = srcW, curH = srcH;
        while (curW * 2 <= dstW && curH * 2 <= dstH) {
          const nw = curW * 2, nh = curH * 2;
          const nc = document.createElement('canvas');
          nc.width = nw; nc.height = nh;
          const nctx = nc.getContext('2d');
          nctx.imageSmoothingEnabled = true;
          nctx.imageSmoothingQuality = 'high';
          nctx.drawImage(curRGB, 0, 0, curW, curH, 0, 0, nw, nh);
          curRGB = nc; curW = nw; curH = nh;
        }
        if (curW !== dstW || curH !== dstH) {
          const fc = document.createElement('canvas');
          fc.width = dstW; fc.height = dstH;
          const fctx = fc.getContext('2d');
          fctx.imageSmoothingEnabled = true;
          fctx.imageSmoothingQuality = 'high';
          fctx.drawImage(curRGB, 0, 0, curW, curH, 0, 0, dstW, dstH);
          curRGB = fc;
        }

        // ═══ STEP 4: Multi-pass upscale ALPHA (independently) ═══
        let curAlpha = alphaCanvas, caW = srcW, caH = srcH;
        while (caW * 2 <= dstW && caH * 2 <= dstH) {
          const nw = caW * 2, nh = caH * 2;
          const nc = document.createElement('canvas');
          nc.width = nw; nc.height = nh;
          const nctx = nc.getContext('2d');
          nctx.imageSmoothingEnabled = true;
          nctx.imageSmoothingQuality = 'high';
          nctx.drawImage(curAlpha, 0, 0, caW, caH, 0, 0, nw, nh);
          curAlpha = nc; caW = nw; caH = nh;
        }
        if (caW !== dstW || caH !== dstH) {
          const fc = document.createElement('canvas');
          fc.width = dstW; fc.height = dstH;
          const fctx = fc.getContext('2d');
          fctx.imageSmoothingEnabled = true;
          fctx.imageSmoothingQuality = 'high';
          fctx.drawImage(curAlpha, 0, 0, caW, caH, 0, 0, dstW, dstH);
          curAlpha = fc;
        }

        // ═══ STEP 5: Alpha edge refinement ═══
        const alphaUpCtx = curAlpha.getContext('2d');
        const alphaUpData = alphaUpCtx.getImageData(0, 0, dstW, dstH);
        const aData = alphaUpData.data;
        const edgeQuality = upscaleEdgeProtection / 100;

        // Pass 1: Smooth alpha at edges (gaussian-like 3x3 on edge pixels)
        const alphaCopy = new Uint8ClampedArray(aData);
        for (let y = 1; y < dstH - 1; y++) {
          for (let x = 1; x < dstW - 1; x++) {
            const idx = (y * dstW + x) * 4;
            const a = alphaCopy[idx];
            if (a === 0 || a === 255) continue; // only process edge pixels
            // Weighted average with neighbors (gaussian-like kernel)
            let sum = a * 4;
            let weight = 4;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const w = (dx === 0 || dy === 0) ? 2 : 1;
                sum += alphaCopy[((y+dy)*dstW+(x+dx))*4] * w;
                weight += w;
              }
            }
            const smoothed = sum / weight;
            aData[idx] = aData[idx+1] = aData[idx+2] = Math.round(a * (1 - edgeQuality * 0.7) + smoothed * edgeQuality * 0.7);
          }
        }

        // Pass 2: Remove halo (white/black contamination at semi-transparent edges)
        const rgbUpCtx = curRGB.getContext('2d');
        const rgbUpData = rgbUpCtx.getImageData(0, 0, dstW, dstH);
        const rData = rgbUpData.data;

        for (let y = 0; y < dstH; y++) {
          for (let x = 0; x < dstW; x++) {
            const idx = (y * dstW + x) * 4;
            const a = aData[idx]; // alpha value
            if (a > 20 && a < 220) {
              // Semi-transparent edge pixel — check for halo
              const r = rData[idx], g = rData[idx+1], b = rData[idx+2];
              // White halo: bright pixel at low alpha
              if (r > 230 && g > 230 && b > 230 && a < 150) {
                aData[idx] = aData[idx+1] = aData[idx+2] = Math.round(a * 0.3);
              }
              // Black halo: dark pixel at low alpha
              else if (r < 25 && g < 25 && b < 25 && a < 150) {
                aData[idx] = aData[idx+1] = aData[idx+2] = Math.round(a * 0.3);
              }
            }
          }
        }

        alphaUpCtx.putImageData(alphaUpData, 0, 0);

        // ═══ STEP 6: Recombine RGB + refined Alpha ═══
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = dstW;
        finalCanvas.height = dstH;
        const finalCtx = finalCanvas.getContext('2d');
        const finalRGB = rgbUpCtx.getImageData(0, 0, dstW, dstH);
        const finalAlpha = alphaUpCtx.getImageData(0, 0, dstW, dstH);
        const finalData = finalCtx.createImageData(dstW, dstH);

        for (let i = 0; i < finalData.data.length; i += 4) {
          finalData.data[i] = finalRGB.data[i];
          finalData.data[i + 1] = finalRGB.data[i + 1];
          finalData.data[i + 2] = finalRGB.data[i + 2];
          finalData.data[i + 3] = finalAlpha.data[i]; // R channel of alpha image = alpha value
        }

        // ═══ STEP 7: Sharpen RGB (only opaque areas) ═══
        const sharpAmount = (upscaleSharpness / 100) * (enhanceStrength / 100);
        if (sharpAmount > 0) {
          const before = new Uint8ClampedArray(finalData.data);
          const d = finalData.data;
          for (let y = 1; y < dstH - 1; y++) {
            for (let x = 1; x < dstW - 1; x++) {
              const idx = (y * dstW + x) * 4;
              if (before[idx + 3] < 128) continue; // skip low-alpha
              for (let c = 0; c < 3; c++) {
                const center = before[idx + c];
                const avg = (before[((y-1)*dstW+x)*4+c] + before[((y+1)*dstW+x)*4+c] +
                  before[(y*dstW+(x-1))*4+c] + before[(y*dstW+(x+1))*4+c]) / 4;
                d[idx + c] = Math.max(0, Math.min(255, Math.round(center + sharpAmount * 1.5 * (center - avg))));
              }
            }
          }
        }

        // ═══ STEP 8: Noise reduction on flat areas ═══
        const nrAmount = (upscaleNoiseReduction / 100) * (enhanceStrength / 100);
        if (nrAmount > 0.1) {
          const before = new Uint8ClampedArray(finalData.data);
          const d = finalData.data;
          for (let y = 1; y < dstH - 1; y++) {
            for (let x = 1; x < dstW - 1; x++) {
              const idx = (y * dstW + x) * 4;
              if (before[idx + 3] < 128) continue;
              let maxDiff = 0;
              for (let c = 0; c < 3; c++) {
                const center = before[idx + c];
                maxDiff = Math.max(maxDiff,
                  Math.abs(center - before[((y-1)*dstW+x)*4+c]),
                  Math.abs(center - before[((y+1)*dstW+x)*4+c]),
                  Math.abs(center - before[(y*dstW+(x-1))*4+c]),
                  Math.abs(center - before[(y*dstW+(x+1))*4+c])
                );
              }
              if (maxDiff < 30) {
                for (let c = 0; c < 3; c++) {
                  const avg = (before[idx+c]*2 + before[((y-1)*dstW+x)*4+c] + before[((y+1)*dstW+x)*4+c] +
                    before[(y*dstW+(x-1))*4+c] + before[(y*dstW+(x+1))*4+c]) / 6;
                  d[idx+c] = Math.round(before[idx+c] * (1 - nrAmount) + avg * nrAmount);
                }
              }
            }
          }
        }

        finalCtx.putImageData(finalData, 0, 0);

        // Convert and update state
        const resultUrl = finalCanvas.toDataURL('image/png');
        const resultData = finalCtx.getImageData(0, 0, dstW, dstH);

        setProcessedImageData(resultData);
        setDisplayUrl(resultUrl);
        setImageDimensions({ width: dstW, height: dstH });
        pushHistory(resultData, `AI Upscale ${factor}×`);
        if (!bgRemoved) setBgRemoved(true);
        setQualityReport(analyzeImageQuality(resultData));
      } catch (err) {
        console.error('Upscale failed:', err);
      }
      setIsUpscaling(false);
    }, 50);
  }, [displayUrl, originalImage, upscaleFactor, upscaleSharpness, upscaleNoiseReduction, enhanceStrength, upscaleEdgeProtection]);

  // One-click AI Enhance for Print
  const handleAIEnhanceForPrint = useCallback(() => {
    if (!imageDimensions) return;
    // Calculate needed factor to reach 300 DPI at 10.75" print width
    const targetPixels = targetDpi * 10.75;
    const currentW = imageDimensions.width;
    let factor = Math.ceil(targetPixels / currentW);
    factor = Math.max(2, Math.min(8, factor));
    setUpscaleFactor(factor);
    performUpscale(factor);
  }, [imageDimensions, targetDpi, performUpscale]);

  // Calculate required pixels from desired print size
  const requiredPixels = useMemo(() => {
    if (!desiredPrintW || !desiredPrintH) return null;
    const w = parseFloat(desiredPrintW);
    const h = parseFloat(desiredPrintH);
    if (!w || !h) return null;
    return { w: Math.round(w * targetDpi), h: Math.round(h * targetDpi) };
  }, [desiredPrintW, desiredPrintH, targetDpi]);

  // ─── ENHANCEMENT APPLICATION ─────────────────────────────────────────────────
  const applyEnhancements = useCallback(() => {
    if (!processedImageData) return;
    if (brightness === 0 && contrast === 0 && sharpness === 0 && saturation === 0 &&
        exposure === 0 && gamma === 100 && vibrance === 0 && temperature === 0 &&
        highlights === 0 && shadows === 0 && clarity === 0) {
      setDisplayUrl(imageDataToUrl(processedImageData));
      return;
    }
    const enhanced = enhanceImage(processedImageData, { brightness, contrast, sharpness, saturation });
    // Apply additional adjustments
    const { data, width, height } = enhanced;
    const d = data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      let r = d[i], g = d[i + 1], b = d[i + 2];
      // Exposure
      if (exposure !== 0) {
        const factor = Math.pow(2, exposure / 100);
        r *= factor; g *= factor; b *= factor;
      }
      // Gamma
      if (gamma !== 100) {
        const g2 = gamma / 100;
        r = 255 * Math.pow(r / 255, 1 / g2);
        g = 255 * Math.pow(g / 255, 1 / g2);
        b = 255 * Math.pow(b / 255, 1 / g2);
      }
      // Temperature (warm/cool)
      if (temperature !== 0) {
        r += temperature * 0.5;
        b -= temperature * 0.5;
      }
      // Vibrance (selective saturation)
      if (vibrance !== 0) {
        const max = Math.max(r, g, b);
        const avg = (r + g + b) / 3;
        const amt = ((max - avg) / 255) * (-vibrance / 100);
        r += (avg - r) * amt; g += (avg - g) * amt; b += (avg - b) * amt;
      }
      d[i] = Math.max(0, Math.min(255, Math.round(r)));
      d[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
      d[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
    }
    setDisplayUrl(imageDataToUrl(enhanced));
  }, [processedImageData, brightness, contrast, sharpness, saturation, exposure, gamma, vibrance, temperature, highlights, shadows, clarity]);

  useEffect(() => {
    if (bgRemoved && processedImageData) applyEnhancements();
  }, [brightness, contrast, sharpness, saturation, exposure, gamma, vibrance, temperature, highlights, shadows, clarity, applyEnhancements, bgRemoved, processedImageData]);

  // ─── EXPORT & ACTIONS ───────────────────────────────────────────────────────
  const handleDownload = (format = 'png', quality = 1.0) => {
    if (!displayUrl) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (format === 'jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.drawImage(img, 0, 0);
      const mimeType = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
      const dataUrl = canvas.toDataURL(mimeType, quality);
      const link = document.createElement('a');
      link.download = `processed-${imageFile?.name || 'image'}.${format}`;
      link.href = dataUrl;
      link.click();
    };
    img.src = displayUrl;
  };

  const handleSendToQA = () => { if (displayUrl && onSendToQA) onSendToQA(displayUrl); };

  const handleSendToMockup = () => {
    if (!displayUrl || !onSendToMockup) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data, width, height } = imageData;
      for (let i = 0; i < data.length; i += 4) { if (data[i + 3] > 0 && data[i + 3] < 20) data[i + 3] = 0; }
      ctx.putImageData(imageData, 0, 0);
      let top = height, bottom = 0, left = width, right = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (data[(y * width + x) * 4 + 3] >= 20) {
            if (y < top) top = y; if (y > bottom) bottom = y;
            if (x < left) left = x; if (x > right) right = x;
          }
        }
      }
      if (top > bottom || left > right) { onSendToMockup(displayUrl); return; }
      const trimW = right - left + 1, trimH = bottom - top + 1;
      const trimCanvas = document.createElement('canvas');
      trimCanvas.width = trimW; trimCanvas.height = trimH;
      trimCanvas.getContext('2d').drawImage(canvas, left, top, trimW, trimH, 0, 0, trimW, trimH);
      onSendToMockup(trimCanvas.toDataURL('image/png'));
    };
    img.src = displayUrl;
  };

  // ─── VIEW HANDLERS ───────────────────────────────────────────────────────────
  const handleSplitMouseDown = (e) => { e.preventDefault(); setIsDraggingSplit(true); };
  useEffect(() => {
    if (!isDraggingSplit) return;
    const move = (e) => {
      if (!splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      setSplitPosition(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)));
    };
    const up = () => setIsDraggingSplit(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [isDraggingSplit]);

  const zoomIn = () => setZoom(prev => { const idx = ZOOM_LEVELS.findIndex(z => z > prev); return idx >= 0 ? ZOOM_LEVELS[idx] : prev; });
  const zoomOut = () => setZoom(prev => { const idx = ZOOM_LEVELS.slice().reverse().findIndex(z => z < prev); return idx >= 0 ? ZOOM_LEVELS[ZOOM_LEVELS.length - 1 - idx] : prev; });
  const zoomFit = () => { setZoom(100); setPanOffset({ x: 0, y: 0 }); };
  const zoomActual = () => { setZoom(100); setPanOffset({ x: 0, y: 0 }); };

  const canPan = zoom > 100 || handToolActive || spaceHeld;
  const handlePanStart = (e) => { if (!canPan) return; e.preventDefault(); setIsPanning(true); setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y }); };
  const handlePanMove = (e) => { if (!isPanning) return; setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y }); };
  const handlePanEnd = () => setIsPanning(false);
  // Middle mouse button pan
  const handleMiddleDown = (e) => { if (e.button === 1) { e.preventDefault(); setIsPanning(true); setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y }); } };

  const getCursor = () => {
    if (handToolActive || spaceHeld) return isPanning ? 'grabbing' : 'grab';
    if (zoom > 100) return isPanning ? 'grabbing' : 'grab';
    return 'default';
  };

  // Section toggle
  const toggleSection = (key) => setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));

  // Quality stars
  const qualityStars = (score) => {
    const labels = ['', '★ Unsuitable', '★★ Poor', '★★★ Fair', '★★★★ Good', '★★★★★ Excellent'];
    return labels[score] || '';
  };

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="bgr-page">
      {/* Header */}
      <header className="bgr-header">
        <div className="bgr-header-left">
          <h1 className="bgr-title">Artwork Editor</h1>
        </div>
        <div className="bgr-header-right">
          <button className="bgr-btn bgr-btn-sm bgr-btn-outline" onClick={undo} disabled={historyIndex <= 0} title="Undo (Ctrl+Z)">↩</button>
          <button className="bgr-btn bgr-btn-sm bgr-btn-outline" onClick={redo} disabled={historyIndex >= history.length - 1} title="Redo (Ctrl+Y)">↪</button>
          <button className="bgr-btn bgr-btn-secondary" onClick={handleSendToQA} disabled={!displayUrl}><SendIcon /> Send to QA</button>
          <button className="bgr-btn bgr-btn-secondary" onClick={handleSendToMockup} disabled={!displayUrl}><SendIcon /> Send to Mockup</button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="bgr-layout">
        {/* ═══ LEFT PANEL ═══ */}
        <aside className="bgr-left-panel">
          {/* Upload Section */}
          <div className="bgr-panel-card">
            <h3 className="bgr-panel-title bgr-collapsible" onClick={() => toggleSection('upload')}>
              Upload {expandedSections.upload ? '▾' : '▸'}
            </h3>
            {expandedSections.upload && (<>
              {!originalImage ? (
                <div className={`bgr-upload-zone ${isDragging ? 'dragging' : ''}`}
                  onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}>
                  <UploadIcon />
                  <p>Drag & drop, paste, or click</p>
                  <span>PNG, JPG, TIFF, SVG supported</span>
                </div>
              ) : (
                <div className="bgr-file-info">
                  <div className="bgr-file-row"><span className="bgr-file-label">File:</span><span className="bgr-file-value">{imageFile?.name || 'image'}</span></div>
                  {imageDimensions && (<>
                    <div className="bgr-file-row"><span className="bgr-file-label">Size:</span><span className="bgr-file-value">{imageDimensions.width} × {imageDimensions.height}px</span></div>
                    <div className="bgr-file-row"><span className="bgr-file-label">DPI:</span><span className="bgr-file-value">~{Math.round(imageDimensions.width / 10.75)}</span></div>
                    <div className="bgr-file-row"><span className="bgr-file-label">Print:</span><span className="bgr-file-value">{(imageDimensions.width / 300).toFixed(1)}" × {(imageDimensions.height / 300).toFixed(1)}"</span></div>
                    <div className="bgr-file-row"><span className="bgr-file-label">Transparency:</span><span className="bgr-file-value">{qualityReport?.hasTransparency ? '✓ Yes' : '✕ No'}</span></div>
                  </>)}
                  <button className="bgr-btn bgr-btn-sm bgr-btn-outline" onClick={() => fileInputRef.current?.click()}>Replace Image</button>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleFileUpload(e.target.files[0])} />
            </>)}
          </div>

          {/* Crop Tool */}
          <div className="bgr-panel-card">
            <h3 className="bgr-panel-title bgr-collapsible" onClick={() => toggleSection('crop')}>
              Crop {expandedSections.crop ? '▾' : '▸'}
            </h3>
            {expandedSections.crop && (<>
              {!isCropping ? (
                <button className="bgr-btn bgr-btn-primary bgr-btn-full" onClick={() => { setIsCropping(true); setCropRect(null); }} disabled={!originalImage}>
                  Start Crop (Click & Drag)
                </button>
              ) : (
                <div className="bgr-crop-controls">
                  <p className="bgr-hint">Click and drag on the image to select crop area</p>
                  {imageDimensions && cropRect && (
                    <div className="bgr-crop-info">
                      {Math.round(cropRect.w/100*imageDimensions.width)} × {Math.round(cropRect.h/100*imageDimensions.height)} px
                    </div>
                  )}
                  <div className="bgr-button-group">
                    <button className="bgr-btn bgr-btn-primary" onClick={applyCrop} disabled={!cropRect}>Apply Crop</button>
                    <button className="bgr-btn bgr-btn-outline" onClick={() => { setIsCropping(false); setCropRect(null); }}>Cancel</button>
                  </div>
                </div>
              )}
            </>)}
          </div>

          {/* Transform */}
          <div className="bgr-panel-card">
            <h3 className="bgr-panel-title bgr-collapsible" onClick={() => toggleSection('transform')}>
              Transform {expandedSections.transform ? '▾' : '▸'}
            </h3>
            {expandedSections.transform && (
              <div className="bgr-button-grid">
                <button className="bgr-btn bgr-btn-sm bgr-btn-outline" onClick={() => applyTransform('rotate90')} disabled={!originalImage}>↻ 90°</button>
                <button className="bgr-btn bgr-btn-sm bgr-btn-outline" onClick={() => applyTransform('rotate270')} disabled={!originalImage}>↺ 90°</button>
                <button className="bgr-btn bgr-btn-sm bgr-btn-outline" onClick={() => applyTransform('rotate180')} disabled={!originalImage}>↻ 180°</button>
                <button className="bgr-btn bgr-btn-sm bgr-btn-outline" onClick={() => applyTransform('flipH')} disabled={!originalImage}>⇔ Flip H</button>
                <button className="bgr-btn bgr-btn-sm bgr-btn-outline" onClick={() => applyTransform('flipV')} disabled={!originalImage}>⇕ Flip V</button>
              </div>
            )}
          </div>

          {/* Background Removal */}
          <div className="bgr-panel-card">
            <h3 className="bgr-panel-title bgr-collapsible" onClick={() => toggleSection('bgRemoval')}>
              Background Removal {expandedSections.bgRemoval ? '▾' : '▸'}
            </h3>
            {expandedSections.bgRemoval && (<>
              {/* Mode Selection */}
              <div className="bgr-mode-selector">
                <div className={`bgr-mode-option ${bgRemovalMode === 'fast' ? 'active' : ''}`} onClick={() => setBgRemovalMode('fast')}>
                  <span className="bgr-mode-icon">⚡</span>
                  <span className="bgr-mode-name">Fast</span>
                  <span className="bgr-mode-time">&lt;2s</span>
                </div>
                <div className={`bgr-mode-option ${bgRemovalMode === 'balanced' ? 'active' : ''}`} onClick={() => setBgRemovalMode('balanced')}>
                  <span className="bgr-mode-icon">⭐</span>
                  <span className="bgr-mode-name">Balanced</span>
                  <span className="bgr-mode-time">2-5s</span>
                </div>
                <div className={`bgr-mode-option ${bgRemovalMode === 'ai' ? 'active' : ''}`} onClick={() => setBgRemovalMode('ai')}>
                  <span className="bgr-mode-icon">🧠</span>
                  <span className="bgr-mode-name">AI Precision</span>
                  <span className="bgr-mode-time">5-15s</span>
                </div>
                <div className={`bgr-mode-option ${bgRemovalMode === 'manual' ? 'active' : ''}`} onClick={() => setBgRemovalMode('manual')}>
                  <span className="bgr-mode-icon">✋</span>
                  <span className="bgr-mode-name">Manual</span>
                  <span className="bgr-mode-time">—</span>
                </div>
              </div>

              {/* Mode Info */}
              <div className="bgr-mode-info">
                {bgRemovalMode === 'fast' && <p className="bgr-hint">Best for: Logos, clipart, SVG-style graphics, solid backgrounds</p>}
                {bgRemovalMode === 'balanced' && <p className="bgr-hint">Best for: DTF/POD artwork, vintage designs, multi-color graphics, distressed art</p>}
                {bgRemovalMode === 'ai' && <p className="bgr-hint">Best for: Photographs, hair, watercolor, smoke, transparent objects, fine details</p>}
                {bgRemovalMode === 'manual' && <p className="bgr-hint">Full manual control with sensitivity and feather adjustments</p>}
              </div>

              {/* Artwork Detection */}
              {artworkDetection && (
                <div className="bgr-detection-badge">
                  <span className="bgr-detection-type">Detected: {artworkDetection.type}</span>
                  <span className="bgr-detection-reason">{artworkDetection.reason}</span>
                </div>
              )}

              {/* Manual controls (only show in manual mode) */}
              {bgRemovalMode === 'manual' && (<>
                <div className="bgr-control-group">
                  <label className="bgr-label">Sensitivity <span className="bgr-label-value">{sensitivity}</span></label>
                  <input type="range" min="0" max="100" value={sensitivity} onChange={(e) => setSensitivity(Number(e.target.value))} className="bgr-slider" />
                </div>
                <div className="bgr-control-group">
                  <label className="bgr-label">Edge Feather <span className="bgr-label-value">{feather}px</span></label>
                  <input type="range" min="0" max="5" step="0.5" value={feather} onChange={(e) => setFeather(Number(e.target.value))} className="bgr-slider" />
                </div>
                <div className="bgr-control-group">
                  <label className="bgr-label bgr-toggle-label">
                    <span>Remove Interior BG</span>
                    <button className={`bgr-toggle-btn ${removeInteriorWhite ? 'active' : ''}`} onClick={() => setRemoveInteriorWhite(v => !v)}>{removeInteriorWhite ? 'ON' : 'OFF'}</button>
                  </label>
                </div>
              </>)}

              <div className="bgr-button-group">
                <button className="bgr-btn bgr-btn-primary" onClick={bgRemovalMode === 'manual' ? handleRemoveBackgroundManual : handleRemoveBackground} disabled={!originalImage || isProcessing}>
                  {isProcessing ? 'Processing...' : 'Remove Background'}
                </button>
                <button className="bgr-btn bgr-btn-accent" onClick={handleOneClickOptimize} disabled={!originalImage || isProcessing}>
                  🪄 AI Optimize Artwork
                </button>
                <button className="bgr-btn bgr-btn-outline" onClick={handleReset} disabled={!bgRemoved}>Reset to Original</button>
              </div>
            </>)}
          </div>
        </aside>

        {/* ═══ CENTER PANEL ═══ */}
        <section className="bgr-center-panel">
          <div className="bgr-preview-card">
            <div className="bgr-preview-toolbar">
              <div className="bgr-view-tabs">
                <button className={`bgr-view-tab ${!showBeforeAfter ? 'active' : ''}`} onClick={() => setShowBeforeAfter(false)}>Result</button>
                <button className={`bgr-view-tab ${showBeforeAfter ? 'active' : ''}`} onClick={() => setShowBeforeAfter(true)} disabled={!bgRemoved}>Before/After</button>
              </div>
              <div className="bgr-zoom-controls">
                <button className="bgr-zoom-btn" onClick={zoomOut} title="Zoom Out (Ctrl+-)">−</button>
                <span className="bgr-zoom-value">{zoom}%</span>
                <button className="bgr-zoom-btn" onClick={zoomIn} title="Zoom In (Ctrl++)">+</button>
                <button className="bgr-zoom-btn" onClick={zoomFit} title="Fit (Ctrl+0)">Fit</button>
                <button className="bgr-zoom-btn" onClick={zoomActual} title="1:1 Actual Pixels">1:1</button>
                <button className={`bgr-zoom-btn ${handToolActive ? 'active' : ''}`} onClick={() => setHandToolActive(h => !h)} title="Hand Tool (H) / Hold Space">✋</button>
              </div>
            </div>

            <div className="bgr-preview-area" ref={splitContainerRef}>
              {isProcessing && (<div className="bgr-processing-overlay"><div className="bgr-spinner" /><p>Processing...</p></div>)}
              {!originalImage ? (
                <div className={`bgr-preview-empty ${isDragging ? 'dragging' : ''}`}
                  onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}>
                  <UploadIcon />
                  <p>Upload an image to get started</p>
                  <span>Drag & drop, paste from clipboard, or click to browse</span>
                </div>
              ) : showBeforeAfter && bgRemoved ? (
                <div className="bgr-split-view" style={{ transform: `scale(${zoom / 100})` }}>
                  <div className="bgr-split-before" style={{ width: `${splitPosition}%` }}>
                    <img src={originalImage} alt="Before" className="bgr-split-img" />
                    <span className="bgr-split-label">Before</span>
                  </div>
                  <div className="bgr-split-after" style={{ width: `${100 - splitPosition}%` }}>
                    <img src={displayUrl} alt="After" className="bgr-split-img" />
                    <span className="bgr-split-label">After</span>
                  </div>
                  <div className="bgr-split-handle" style={{ left: `${splitPosition}%` }} onMouseDown={handleSplitMouseDown}>
                    <div className="bgr-split-handle-bar" />
                  </div>
                </div>
              ) : (
                <div className="bgr-image-display"
                  style={{ transform: `scale(${zoom / 100}) translate(${panOffset.x / (zoom / 100)}px, ${panOffset.y / (zoom / 100)}px)`, cursor: isCropping ? 'crosshair' : getCursor(), position: 'relative' }}
                  onMouseDown={(e) => {
                    if (isCropping) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = ((e.clientX - rect.left) / rect.width) * 100;
                      const y = ((e.clientY - rect.top) / rect.height) * 100;
                      setCropRect({ x, y, w: 0, h: 0, dragging: true, startX: x, startY: y });
                    } else {
                      handlePanStart(e);
                    }
                  }}
                  onMouseMove={(e) => {
                    if (isCropping && cropRect?.dragging) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const curX = ((e.clientX - rect.left) / rect.width) * 100;
                      const curY = ((e.clientY - rect.top) / rect.height) * 100;
                      const x = Math.min(cropRect.startX, curX);
                      const y = Math.min(cropRect.startY, curY);
                      const w = Math.abs(curX - cropRect.startX);
                      const h = Math.abs(curY - cropRect.startY);
                      setCropRect(prev => ({ ...prev, x, y, w, h }));
                    } else {
                      handlePanMove(e);
                    }
                  }}
                  onMouseUp={(e) => {
                    if (isCropping && cropRect?.dragging) {
                      setCropRect(prev => ({ ...prev, dragging: false }));
                    } else {
                      handlePanEnd();
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (isCropping && cropRect?.dragging) {
                      setCropRect(prev => ({ ...prev, dragging: false }));
                    } else {
                      handlePanEnd();
                    }
                  }}
                  onAuxClick={handleMiddleDown} onWheel={handleWheel}>
                  <img src={displayUrl} alt="Preview" className="bgr-preview-image" ref={canvasRef} draggable={false} />
                  {isCropping && cropRect && cropRect.w > 0 && (
                    <div className="bgr-crop-overlay" style={{
                      left: `${cropRect.x}%`, top: `${cropRect.y}%`,
                      width: `${cropRect.w}%`, height: `${cropRect.h}%`,
                    }} />
                  )}
                </div>
              )}
            </div>

            {/* Detected Objects */}
            {bgRemoved && processingMode === 'manual' && (
              <div className="bgr-manual-controls">
                <button className="bgr-btn bgr-btn-sm bgr-btn-primary" onClick={handleKeepSelected} disabled={selectedObjectIds.size === 0}>Remove Unselected</button>
                <button className="bgr-btn bgr-btn-sm bgr-btn-outline" onClick={handleInvertSelection}>Invert Selection</button>
              </div>
            )}
          </div>

          {bgRemoved && detectedObjects.length > 0 && (
            <div className="bgr-objects-panel">
              <div className="bgr-objects-header">
                <h3 className="bgr-panel-title">
                  {detectedObjects.filter(o => o.category === 'artwork').length > 0 ? 'Artwork' : 'Objects'} 
                  {detectedObjects.filter(o => o.category === 'noise').length > 0 && (
                    <span className="bgr-noise-count"> · {detectedObjects.filter(o => o.category === 'noise').length} noise</span>
                  )}
                </h3>
                <div className="bgr-objects-actions">
                  {detectedObjects.filter(o => o.category === 'noise').length > 0 && (
                    <button className="bgr-btn bgr-btn-sm bgr-btn-danger" onClick={handleDeleteSelected} title="Remove all noise objects">
                      Remove Noise
                    </button>
                  )}
                </div>
              </div>
              <div className="bgr-objects-grid">
                {detectedObjects.map(obj => (
                  <div key={obj.id} className={`bgr-object-thumb ${obj.category === 'artwork' ? 'selected' : 'deselected'} ${obj.category === 'noise' ? 'noise' : ''}`}
                    onClick={() => toggleObjectSelection(obj.id)}>
                    {obj.thumbnail && <img src={obj.thumbnail} alt={`Object ${obj.id}`} />}
                    <span className="bgr-object-id">{obj.category === 'artwork' ? '✓ Artwork' : `#${obj.id} noise`}</span>
                    <span className="bgr-object-size">{obj.pixelCount > 1000 ? `${(obj.pixelCount/1000).toFixed(1)}k` : obj.pixelCount}px</span>
                    {selectedObjectIds.has(obj.id) ? <span className="bgr-object-check">✓</span> : <span className="bgr-object-x">✕</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bottom Toolbar */}
          <div className="bgr-bottom-toolbar">
            <button className="bgr-btn bgr-btn-sm bgr-btn-outline" onClick={undo} disabled={historyIndex <= 0}>↩ Undo</button>
            <button className="bgr-btn bgr-btn-sm bgr-btn-outline" onClick={redo} disabled={historyIndex >= history.length - 1}>↪ Redo</button>
            <button className="bgr-btn bgr-btn-sm bgr-btn-outline" onClick={zoomOut}>🔍−</button>
            <button className="bgr-btn bgr-btn-sm bgr-btn-outline" onClick={zoomIn}>🔍+</button>
            <button className="bgr-btn bgr-btn-sm bgr-btn-outline" onClick={zoomFit}>Fit</button>
            <button className="bgr-btn bgr-btn-sm bgr-btn-primary" onClick={() => handleDownload('png')} disabled={!displayUrl}>Export PNG</button>
            <button className="bgr-btn bgr-btn-sm bgr-btn-secondary" onClick={handleSendToMockup} disabled={!displayUrl}>→ Mockup</button>
          </div>
        </section>

        {/* ═══ RIGHT PANEL ═══ */}
        <aside className="bgr-right-panel">
          {/* Image Enhancement */}
          <div className="bgr-panel-card">
            <h3 className="bgr-panel-title bgr-collapsible" onClick={() => toggleSection('enhancement')}>
              Image Enhancement {expandedSections.enhancement ? '▾' : '▸'}
            </h3>
            {expandedSections.enhancement && (<>
              <div className="bgr-control-group">
                <label className="bgr-label">Brightness <span className="bgr-label-value">{brightness}</span></label>
                <input type="range" min="-100" max="100" value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} className="bgr-slider" disabled={!bgRemoved} />
              </div>
              <div className="bgr-control-group">
                <label className="bgr-label">Contrast <span className="bgr-label-value">{contrast}</span></label>
                <input type="range" min="-100" max="100" value={contrast} onChange={(e) => setContrast(Number(e.target.value))} className="bgr-slider" disabled={!bgRemoved} />
              </div>
              <div className="bgr-control-group">
                <label className="bgr-label">Exposure <span className="bgr-label-value">{exposure}</span></label>
                <input type="range" min="-100" max="100" value={exposure} onChange={(e) => setExposure(Number(e.target.value))} className="bgr-slider" disabled={!bgRemoved} />
              </div>
              <div className="bgr-control-group">
                <label className="bgr-label">Gamma <span className="bgr-label-value">{gamma}</span></label>
                <input type="range" min="20" max="300" value={gamma} onChange={(e) => setGamma(Number(e.target.value))} className="bgr-slider" disabled={!bgRemoved} />
              </div>
              <div className="bgr-control-group">
                <label className="bgr-label">Saturation <span className="bgr-label-value">{saturation}</span></label>
                <input type="range" min="-100" max="100" value={saturation} onChange={(e) => setSaturation(Number(e.target.value))} className="bgr-slider" disabled={!bgRemoved} />
              </div>
              <div className="bgr-control-group">
                <label className="bgr-label">Vibrance <span className="bgr-label-value">{vibrance}</span></label>
                <input type="range" min="-100" max="100" value={vibrance} onChange={(e) => setVibrance(Number(e.target.value))} className="bgr-slider" disabled={!bgRemoved} />
              </div>
              <div className="bgr-control-group">
                <label className="bgr-label">Temperature <span className="bgr-label-value">{temperature}</span></label>
                <input type="range" min="-50" max="50" value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} className="bgr-slider" disabled={!bgRemoved} />
              </div>
            </>)}
          </div>

          {/* Sharpness & Quality */}
          <div className="bgr-panel-card">
            <h3 className="bgr-panel-title bgr-collapsible" onClick={() => toggleSection('sharpness')}>
              Sharpness & Quality {expandedSections.sharpness ? '▾' : '▸'}
            </h3>
            {expandedSections.sharpness && (<>
              <div className="bgr-control-group">
                <label className="bgr-label">Sharpness <span className="bgr-label-value">{sharpness}</span></label>
                <input type="range" min="0" max="100" value={sharpness} onChange={(e) => setSharpness(Number(e.target.value))} className="bgr-slider" disabled={!bgRemoved} />
              </div>
              <div className="bgr-control-group">
                <label className="bgr-label">Clarity <span className="bgr-label-value">{clarity}</span></label>
                <input type="range" min="0" max="100" value={clarity} onChange={(e) => setClarity(Number(e.target.value))} className="bgr-slider" disabled={!bgRemoved} />
              </div>
              <div className="bgr-control-group">
                <label className="bgr-label">Noise Reduction <span className="bgr-label-value">{noiseReduction}</span></label>
                <input type="range" min="0" max="100" value={noiseReduction} onChange={(e) => setNoiseReduction(Number(e.target.value))} className="bgr-slider" disabled={!bgRemoved} />
              </div>
            </>)}
          </div>

          {/* Edge Cleanup */}
          <div className="bgr-panel-card">
            <h3 className="bgr-panel-title bgr-collapsible" onClick={() => toggleSection('edgeCleanup')}>
              Edge Cleanup {expandedSections.edgeCleanup ? '▾' : '▸'}
            </h3>
            {expandedSections.edgeCleanup && (
              <div className="bgr-button-stack">
                <button className="bgr-btn bgr-btn-outline" onClick={handleCleanEdges} disabled={!bgRemoved || isProcessing}>Clean Edges</button>
                <button className="bgr-btn bgr-btn-outline" onClick={handleRemoveWhiteHalo} disabled={!bgRemoved || isProcessing}>Remove White Halo</button>
                <button className="bgr-btn bgr-btn-outline" onClick={handleRemoveBlackHalo} disabled={!bgRemoved || isProcessing}>Remove Black Halo</button>
                <button className="bgr-btn bgr-btn-outline" onClick={handleRemoveFloatingPixels} disabled={!bgRemoved || isProcessing}>Remove Floating Pixels</button>
                <button className="bgr-btn bgr-btn-outline" onClick={handleTrim} disabled={!bgRemoved || isProcessing}>Trim Transparent</button>
              </div>
            )}
          </div>

          {/* Color Tools */}
          <div className="bgr-panel-card">
            <h3 className="bgr-panel-title bgr-collapsible" onClick={() => toggleSection('colorTools')}>
              Color Tools {expandedSections.colorTools ? '▾' : '▸'}
            </h3>
            {expandedSections.colorTools && (<>
              <div className="bgr-control-group">
                <label className="bgr-label">Replace Color</label>
                <div className="bgr-color-replace-row">
                  <input type="color" value={colorReplaceSrc} onChange={(e) => setColorReplaceSrc(e.target.value)} title="Source color" />
                  <span>→</span>
                  <input type="color" value={colorReplaceDst} onChange={(e) => setColorReplaceDst(e.target.value)} title="Target color" />
                </div>
                <label className="bgr-label">Tolerance <span className="bgr-label-value">{colorTolerance}</span></label>
                <input type="range" min="1" max="100" value={colorTolerance} onChange={(e) => setColorTolerance(Number(e.target.value))} className="bgr-slider" />
                <button className="bgr-btn bgr-btn-sm bgr-btn-outline" onClick={handleReplaceColor} disabled={!bgRemoved}>Apply Replace</button>
              </div>
              <div className="bgr-button-stack">
                <button className="bgr-btn bgr-btn-outline" onClick={handleGrayscale} disabled={!bgRemoved}>Convert to Grayscale</button>
                <button className="bgr-btn bgr-btn-outline" onClick={handleInvertColors} disabled={!bgRemoved}>Invert Colors</button>
              </div>
            </>)}
          </div>

          {/* Artwork Optimization */}
          <div className="bgr-panel-card">
            <h3 className="bgr-panel-title bgr-collapsible" onClick={() => toggleSection('optimization')}>
              Artwork Optimization {expandedSections.optimization ? '▾' : '▸'}
            </h3>
            {expandedSections.optimization && (
              <div className="bgr-button-stack">
                <button className="bgr-btn bgr-btn-outline" onClick={handleTrim} disabled={!bgRemoved || isProcessing}>Trim Transparent Pixels</button>
                <button className="bgr-btn bgr-btn-outline" onClick={handleCleanEdges} disabled={!bgRemoved || isProcessing}>Optimize for DTF</button>
                <button className="bgr-btn bgr-btn-outline" onClick={() => { handleCleanEdges(); handleRemoveFloatingPixels(); }} disabled={!bgRemoved || isProcessing}>Optimize for Sublimation</button>
              </div>
            )}
          </div>

          {/* Print Quality Analysis */}
          <div className="bgr-panel-card">
            <h3 className="bgr-panel-title bgr-collapsible" onClick={() => toggleSection('quality')}>
              Print Quality Analysis {expandedSections.quality ? '▾' : '▸'}
            </h3>
            {expandedSections.quality && qualityReport && (
              <div className="bgr-quality-report">
                <div className="bgr-quality-score">{qualityStars(qualityReport.qualityScore)}</div>
                <div className="bgr-quality-grid">
                  <div className="bgr-quality-row"><span>Resolution</span><span>{qualityReport.width} × {qualityReport.height}px</span></div>
                  <div className="bgr-quality-row"><span>DPI</span><span>~{qualityReport.dpi}</span></div>
                  <div className="bgr-quality-row"><span>Print Size</span><span>{qualityReport.printSize}</span></div>
                  <div className="bgr-quality-row"><span>Transparency</span><span>{qualityReport.hasTransparency ? '✓' : '✕'}</span></div>
                  <div className="bgr-quality-row"><span>Background</span><span>{qualityReport.hasBg ? 'Has BG' : 'Removed'}</span></div>
                  <div className="bgr-quality-row"><span>White Halo</span><span className={qualityReport.hasWhiteHalo ? 'bgr-warn' : ''}>{qualityReport.hasWhiteHalo ? '⚠ Detected' : '✓ Clean'}</span></div>
                  <div className="bgr-quality-row"><span>Black Halo</span><span className={qualityReport.hasBlackHalo ? 'bgr-warn' : ''}>{qualityReport.hasBlackHalo ? '⚠ Detected' : '✓ Clean'}</span></div>
                  <div className="bgr-quality-row"><span>Floating Pixels</span><span className={qualityReport.floatingPixels > 50 ? 'bgr-warn' : ''}>{qualityReport.floatingPixels}</span></div>
                  <div className="bgr-quality-row"><span>Edge Quality</span><span>{qualityReport.edgeQuality}</span></div>
                  <div className="bgr-quality-row"><span>Recommended</span><span>{qualityReport.recommendedPrintSize}</span></div>
                </div>
              </div>
            )}
          </div>

          {/* Export */}
          <div className="bgr-panel-card">
            <h3 className="bgr-panel-title bgr-collapsible" onClick={() => toggleSection('upscaler')}>
              AI Image Upscaler {expandedSections.upscaler ? '▾' : '▸'}
            </h3>
            {expandedSections.upscaler && (<>
              {/* Current Analysis */}
              {imageDimensions && (
                <div className="bgr-upscale-analysis">
                  <div className="bgr-quality-row"><span>Current</span><span>{imageDimensions.width} × {imageDimensions.height}px</span></div>
                  <div className="bgr-quality-row"><span>DPI (at 10.75")</span><span>~{Math.round(imageDimensions.width / 10.75)}</span></div>
                  <div className="bgr-quality-row"><span>Print Size (300dpi)</span><span>{(imageDimensions.width / 300).toFixed(1)}" × {(imageDimensions.height / 300).toFixed(1)}"</span></div>
                  <div className="bgr-quality-row"><span>After {upscaleFactor}× Upscale</span><span>{imageDimensions.width * upscaleFactor} × {imageDimensions.height * upscaleFactor}px</span></div>
                  <div className="bgr-quality-row"><span>New Print Size</span><span>{(imageDimensions.width * upscaleFactor / targetDpi).toFixed(1)}" × {(imageDimensions.height * upscaleFactor / targetDpi).toFixed(1)}"</span></div>
                </div>
              )}

              {/* One-Click Button */}
              <button className="bgr-btn bgr-btn-accent bgr-btn-full" onClick={handleAIEnhanceForPrint}
                disabled={!displayUrl && !originalImage || isUpscaling}>
                {isUpscaling ? '⏳ Enhancing...' : '✨ AI Enhance for Print'}
              </button>

              {/* Upscale Factor */}
              <div className="bgr-control-group">
                <label className="bgr-label">Upscale Factor</label>
                <div className="bgr-factor-grid">
                  {[2, 3, 4, 6, 8].map(f => (
                    <button key={f} className={`bgr-factor-btn ${upscaleFactor === f ? 'active' : ''}`}
                      onClick={() => setUpscaleFactor(f)}>{f}×</button>
                  ))}
                </div>
              </div>

              {/* Target DPI */}
              <div className="bgr-control-group">
                <label className="bgr-label">Target DPI</label>
                <div className="bgr-factor-grid">
                  {[150, 300, 600].map(d => (
                    <button key={d} className={`bgr-factor-btn ${targetDpi === d ? 'active' : ''}`}
                      onClick={() => setTargetDpi(d)}>{d}</button>
                  ))}
                </div>
              </div>

              {/* Enhancement Sliders */}
              <div className="bgr-control-group">
                <label className="bgr-label">Enhancement Strength <span className="bgr-label-value">{enhanceStrength}</span></label>
                <input type="range" min="0" max="100" value={enhanceStrength} onChange={(e) => setEnhanceStrength(Number(e.target.value))} className="bgr-slider" />
              </div>
              <div className="bgr-control-group">
                <label className="bgr-label">Sharpness <span className="bgr-label-value">{upscaleSharpness}</span></label>
                <input type="range" min="0" max="100" value={upscaleSharpness} onChange={(e) => setUpscaleSharpness(Number(e.target.value))} className="bgr-slider" />
              </div>
              <div className="bgr-control-group">
                <label className="bgr-label">Noise Reduction <span className="bgr-label-value">{upscaleNoiseReduction}</span></label>
                <input type="range" min="0" max="100" value={upscaleNoiseReduction} onChange={(e) => setUpscaleNoiseReduction(Number(e.target.value))} className="bgr-slider" />
              </div>
              <div className="bgr-control-group">
                <label className="bgr-label">Edge Protection <span className="bgr-label-value">{upscaleEdgeProtection}</span></label>
                <input type="range" min="0" max="100" value={upscaleEdgeProtection} onChange={(e) => setUpscaleEdgeProtection(Number(e.target.value))} className="bgr-slider" />
              </div>

              {/* Print Size Calculator */}
              <div className="bgr-control-group">
                <label className="bgr-label">Print Size Calculator</label>
                <div className="bgr-print-calc-row">
                  <input type="number" placeholder="W (inches)" value={desiredPrintW} onChange={(e) => setDesiredPrintW(e.target.value)} className="bgr-calc-input" step="0.5" min="1" max="60" />
                  <span>×</span>
                  <input type="number" placeholder="H (inches)" value={desiredPrintH} onChange={(e) => setDesiredPrintH(e.target.value)} className="bgr-calc-input" step="0.5" min="1" max="60" />
                </div>
                {requiredPixels && imageDimensions && (
                  <div className="bgr-calc-result">
                    <div className="bgr-quality-row"><span>Required</span><span>{requiredPixels.w} × {requiredPixels.h}px</span></div>
                    <div className="bgr-quality-row"><span>Need Upscale</span><span>{Math.max(1, Math.ceil(requiredPixels.w / imageDimensions.width))}×</span></div>
                    <button className="bgr-btn bgr-btn-sm bgr-btn-outline" onClick={() => {
                      const f = Math.max(2, Math.min(8, Math.ceil(requiredPixels.w / imageDimensions.width)));
                      setUpscaleFactor(f);
                      performUpscale(f);
                    }} disabled={isUpscaling}>Upscale to Fit</button>
                  </div>
                )}
              </div>

              {/* Manual Upscale Button */}
              <button className="bgr-btn bgr-btn-primary bgr-btn-full" onClick={() => performUpscale()}
                disabled={!displayUrl && !originalImage || isUpscaling}>
                {isUpscaling ? '⏳ Processing...' : `Upscale ${upscaleFactor}× Now`}
              </button>
            </>)}
          </div>

          {/* Export */}
          <div className="bgr-panel-card">
            <h3 className="bgr-panel-title bgr-collapsible" onClick={() => toggleSection('exportSection')}>
              Export {expandedSections.exportSection ? '▾' : '▸'}
            </h3>
            {expandedSections.exportSection && (
              <div className="bgr-button-stack">
                <button className="bgr-btn bgr-btn-primary" onClick={() => handleDownload('png')} disabled={!displayUrl}>
                  <DownloadIcon /> PNG (Transparent)
                </button>
                <button className="bgr-btn bgr-btn-outline" onClick={() => handleDownload('jpeg', 0.95)} disabled={!displayUrl}>
                  JPEG (White BG)
                </button>
                <button className="bgr-btn bgr-btn-outline" onClick={() => handleDownload('webp', 0.95)} disabled={!displayUrl}>
                  WebP (Lossless)
                </button>
              </div>
            )}
          </div>

          {/* History */}
          {history.length > 0 && (
            <div className="bgr-panel-card">
              <h3 className="bgr-panel-title">History ({history.length})</h3>
              <div className="bgr-history-list">
                {history.slice(-8).reverse().map((entry, idx) => (
                  <div key={idx} className={`bgr-history-item ${history.length - 1 - idx === historyIndex ? 'active' : ''}`}>
                    <span>{entry.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ─── ICONS ──────────────────────────────────────────────────────────────────
function UploadIcon() {
  return (<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>);
}
function SendIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>);
}
function DownloadIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>);
}

export default BGRemover;
