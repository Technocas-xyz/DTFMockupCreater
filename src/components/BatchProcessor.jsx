import React, { useState, useRef, useCallback, useEffect } from 'react';
import { TSHIRT_SIZES, TSHIRT_COLORS } from '../constants/tshirtSizes';
import {
  removeBackgroundBalanced,
  removeBackgroundFast,
  removeBackgroundAI,
  detectArtworkType,
  cleanEdges,
} from '../utils/bgRemovalUtils';
import { drawRecoloredGarment } from '../utils/garmentTintEngine';
import { detectApiBase } from '../utils/apiConfig';
import './BatchProcessor.css';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const DPI = 300;
const MIN_SIZE = 10.75;
const ARTWORK_AREA = { width: 18, height: 24, topOffset: 7 };
const DEFAULT_SIZE = 'L';
const DEFAULT_COLOR = { name: 'White', hex: '#ffffff' };
const EXPORT_W = 4000;
const EXPORT_H = 4800;

// ─── UTILITIES ───────────────────────────────────────────────────────────────
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getImageData(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function imageDataToDataUrl(imageData) {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext('2d').putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

function trimImageData(imageData) {
  const { data, width, height } = imageData;
  let top = height, bottom = 0, left = width, right = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] >= 20) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (top > bottom || left > right) return imageData;
  const pad = 2;
  top = Math.max(0, top - pad);
  left = Math.max(0, left - pad);
  bottom = Math.min(height - 1, bottom + pad);
  right = Math.min(width - 1, right + pad);
  const nw = right - left + 1, nh = bottom - top + 1;
  const canvas = document.createElement('canvas');
  canvas.width = nw; canvas.height = nh;
  const ctx = canvas.getContext('2d');
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = width; srcCanvas.height = height;
  srcCanvas.getContext('2d').putImageData(imageData, 0, 0);
  ctx.drawImage(srcCanvas, left, top, nw, nh, 0, 0, nw, nh);
  return ctx.getImageData(0, 0, nw, nh);
}

function calculateArtworkDimensions(imgWidth, imgHeight) {
  let actualW = parseFloat((imgWidth / DPI).toFixed(2));
  let actualH = parseFloat((imgHeight / DPI).toFixed(2));
  const imgAspect = imgWidth / imgHeight;
  const maxW = ARTWORK_AREA.width;
  const maxH = ARTWORK_AREA.height;

  if (actualW <= maxW && actualH <= maxH) {
    if (actualW < MIN_SIZE && actualH < MIN_SIZE) {
      if (imgAspect >= 1) {
        actualW = MIN_SIZE;
        actualH = parseFloat((MIN_SIZE / imgAspect).toFixed(2));
      } else {
        actualH = MIN_SIZE;
        actualW = parseFloat((MIN_SIZE * imgAspect).toFixed(2));
      }
    }
    return { width: actualW, height: actualH };
  }
  let newW, newH;
  if (imgAspect > maxW / maxH) {
    newW = maxW;
    newH = parseFloat((maxW / imgAspect).toFixed(2));
  } else {
    newH = maxH;
    newW = parseFloat((maxH * imgAspect).toFixed(2));
  }
  return { width: newW, height: newH };
}

// ─── MOCKUP RENDERER ─────────────────────────────────────────────────────────
async function renderMockup(artworkDataUrl, garmentImg, size, color, artDimensions) {
  const W = EXPORT_W, H = EXPORT_H;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const sizeData = TSHIRT_SIZES[size];
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Calculate shirt dimensions
  const maxTshirtW = W * 0.88;
  const maxTshirtH = H * 0.80;
  const pxPerInchW = maxTshirtW / sizeData.bodyWidth;
  const pxPerInchH = maxTshirtH / sizeData.bodyLength;
  const tshirtW = sizeData.bodyWidth * pxPerInchW;
  const tshirtH = sizeData.bodyLength * pxPerInchH;
  const tshirtX = (W - tshirtW) / 2;
  const tshirtY = H * 0.12 + (maxTshirtH - tshirtH) / 2;

  // Draw garment
  if (garmentImg) {
    const imgAspect = (garmentImg.naturalWidth || garmentImg.width) / (garmentImg.naturalHeight || garmentImg.height);
    const shirtPadding = 1.3;
    const shirtImgW = tshirtW * shirtPadding;
    const shirtImgH = shirtImgW / imgAspect;
    const shirtImgX = (W - shirtImgW) / 2;
    const shirtImgY = tshirtY - (shirtImgH - tshirtH) * 0.15;
    drawRecoloredGarment(ctx, garmentImg, shirtImgX, shirtImgY, shirtImgW, shirtImgH, color.hex, W, H);
  } else {
    // Vector fallback
    drawVectorTshirt(ctx, color.hex, tshirtX, tshirtY, tshirtW, tshirtH, W);
  }

  // Draw artwork
  const artImg = await loadImage(artworkDataUrl);
  const artPxPerInch = tshirtW / sizeData.bodyWidth;
  const printAreaPxW = ARTWORK_AREA.width * artPxPerInch;
  const printAreaPxH = ARTWORK_AREA.height * artPxPerInch;
  const printX = tshirtX + (tshirtW - printAreaPxW) / 2;
  const printY = tshirtY + (ARTWORK_AREA.topOffset * artPxPerInch);

  const targetW = artDimensions.width * artPxPerInch;
  const targetH = artDimensions.height * artPxPerInch;
  const imgAR = artImg.naturalWidth / artImg.naturalHeight;
  const targetAR = targetW / targetH;
  let drawW, drawH;
  if (imgAR > targetAR) { drawW = targetW; drawH = targetW / imgAR; }
  else { drawH = targetH; drawW = targetH * imgAR; }

  const drawX = printX + (printAreaPxW - drawW) / 2;
  const drawY = printY;

  ctx.drawImage(artImg, 0, 0, artImg.naturalWidth, artImg.naturalHeight, drawX, drawY, drawW, drawH);

  // Auto-crop
  const imgData = ctx.getImageData(0, 0, W, H);
  const d = imgData.data;
  let cropTop = H, cropBottom = 0, cropLeft = W, cropRight = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i + 3] < 10) continue;
      if (d[i] > 250 && d[i+1] > 250 && d[i+2] > 250) continue;
      if (y < cropTop) cropTop = y;
      if (y > cropBottom) cropBottom = y;
      if (x < cropLeft) cropLeft = x;
      if (x > cropRight) cropRight = x;
    }
  }
  if (cropTop >= cropBottom) return canvas.toDataURL('image/png');

  const margin = 20;
  cropTop = Math.max(0, cropTop - margin);
  cropLeft = Math.max(0, cropLeft - margin);
  cropBottom = Math.min(H - 1, cropBottom + margin);
  cropRight = Math.min(W - 1, cropRight + margin);
  const cw = cropRight - cropLeft + 1, ch = cropBottom - cropTop + 1;

  // Add text
  const textH = 50;
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = cw;
  finalCanvas.height = ch + textH + 20;
  const fCtx = finalCanvas.getContext('2d');
  fCtx.fillStyle = '#ffffff';
  fCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
  fCtx.drawImage(canvas, cropLeft, cropTop, cw, ch, 0, 0, cw, ch);
  fCtx.font = 'bold 36px sans-serif';
  fCtx.fillStyle = '#000000';
  fCtx.textAlign = 'center';
  fCtx.fillText(`Shirt Size: ${size} | Artwork Size: W ${artDimensions.width}" x H ${artDimensions.height}"`, cw / 2, ch + 38);

  return finalCanvas.toDataURL('image/png');
}

function drawVectorTshirt(ctx, color, tX, tY, tW, tH, canvasW) {
  const cx = tX + tW / 2;
  const sleeveOuterLeft = tX - tW * 0.18;
  const sleeveOuterRight = tX + tW + tW * 0.18;
  const sleeveBottomY = tY + tH * 0.3;
  const collarWidth = tW * 0.12;
  const collarDepth = tH * 0.07;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tX, sleeveBottomY);
  ctx.lineTo(sleeveOuterLeft + tW * 0.04, sleeveBottomY - tH * 0.05);
  ctx.lineTo(sleeveOuterLeft, tY + tH * 0.08);
  ctx.lineTo(tX - tW * 0.02, tY);
  ctx.lineTo(cx - collarWidth, tY);
  ctx.quadraticCurveTo(cx, tY + collarDepth, cx + collarWidth, tY);
  ctx.lineTo(tX + tW + tW * 0.02, tY);
  ctx.lineTo(sleeveOuterRight, tY + tH * 0.08);
  ctx.lineTo(sleeveOuterRight - tW * 0.04, sleeveBottomY - tH * 0.05);
  ctx.lineTo(tX + tW, sleeveBottomY);
  ctx.lineTo(tX + tW - tW * 0.01, tY + tH);
  ctx.quadraticCurveTo(cx, tY + tH + tH * 0.01, tX + tW * 0.01, tY + tH);
  ctx.lineTo(tX, sleeveBottomY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────
function BatchProcessor() {
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, status: '' });
  const [selectedColor, setSelectedColor] = useState(DEFAULT_COLOR);
  const [selectedSize, setSelectedSize] = useState(DEFAULT_SIZE);
  const [bgMode, setBgMode] = useState('auto');
  const [garmentImg, setGarmentImg] = useState(null);
  const [garmentLibrary, setGarmentLibrary] = useState([]);
  const fileInputRef = useRef(null);
  const abortRef = useRef(false);

  // Load garment from library (L size Unisex T-Shirt)
  useEffect(() => {
    detectApiBase().then(base => {
      fetch(`${base}/garments.php`)
        .then(r => r.ok ? r.json() : [])
        .then(data => {
          if (!Array.isArray(data)) return;
          setGarmentLibrary(data);
          const lGarment = data.find(g => g.type === 'T-Shirt' && g.size === 'L' && (g.side || 'front') === 'front');
          if (lGarment) {
            const imgUrl = lGarment.dataUrl || (lGarment.imageFile ? `${base}/serve-image.php?file=${lGarment.imageFile}` : null);
            if (imgUrl) {
              const img = new Image();
              img.crossOrigin = 'anonymous';
              img.onload = () => setGarmentImg(img);
              img.src = imgUrl;
            }
          }
        })
        .catch(() => {});
    });
  }, []);

  const handleFiles = (newFiles) => {
    const imageFiles = Array.from(newFiles).filter(f => f.type.startsWith('image/'));
    setFiles(prev => [...prev, ...imageFiles]);
  };

  const removeFile = (idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const clearAll = () => {
    setFiles([]);
    setResults([]);
    setProgress({ current: 0, total: 0, status: '' });
  };

  const processAll = async () => {
    if (files.length === 0) return;
    setProcessing(true);
    setResults([]);
    abortRef.current = false;
    const total = files.length;
    const newResults = [];

    for (let i = 0; i < total; i++) {
      if (abortRef.current) break;
      const file = files[i];
      setProgress({ current: i + 1, total, status: `Processing ${file.name} (${i + 1}/${total})...` });

      try {
        // Step 1: Load image
        const dataUrl = await fileToDataUrl(file);
        const img = await loadImage(dataUrl);
        const imgData = getImageData(img);

        // Step 2: Detect type and remove background
        let processed;
        if (bgMode === 'auto') {
          const detection = detectArtworkType(imgData);
          if (detection.recommended === 'fast') processed = removeBackgroundFast(imgData);
          else if (detection.recommended === 'ai') processed = removeBackgroundAI(imgData);
          else processed = removeBackgroundBalanced(imgData);
        } else if (bgMode === 'fast') {
          processed = removeBackgroundFast(imgData);
        } else if (bgMode === 'ai') {
          processed = removeBackgroundAI(imgData);
        } else {
          processed = removeBackgroundBalanced(imgData);
        }

        // Step 3: Clean edges
        processed = cleanEdges(processed, processed.width, processed.height);

        // Step 4: Trim
        processed = trimImageData(processed);

        // Step 5: Calculate dimensions
        const artDimensions = calculateArtworkDimensions(processed.width, processed.height);

        // Step 6: Get artwork as dataUrl
        const processedUrl = imageDataToDataUrl(processed);

        // Step 7: Render mockup
        const mockupUrl = await renderMockup(processedUrl, garmentImg, selectedSize, selectedColor, artDimensions);

        newResults.push({
          filename: file.name,
          originalSize: `${img.naturalWidth}×${img.naturalHeight}`,
          processedSize: `${processed.width}×${processed.height}`,
          artDimensions,
          bgRemovedUrl: processedUrl,
          mockupUrl,
          status: 'success',
        });
      } catch (err) {
        newResults.push({
          filename: file.name,
          status: 'error',
          error: err.message,
        });
      }

      setResults([...newResults]);
    }

    setProgress({ current: total, total, status: abortRef.current ? 'Aborted' : 'Complete!' });
    setProcessing(false);
  };

  const stopProcessing = () => { abortRef.current = true; };

  const downloadResult = (result, type = 'mockup') => {
    const url = type === 'mockup' ? result.mockupUrl : result.bgRemovedUrl;
    if (!url) return;
    const link = document.createElement('a');
    link.download = `${type}-${result.filename}`;
    link.href = url;
    link.click();
  };

  const downloadAllMockups = () => {
    const successful = results.filter(r => r.status === 'success');
    if (successful.length === 0) return;
    // Single combined image if multiple, else single download
    if (successful.length === 1) {
      downloadResult(successful[0], 'mockup');
      return;
    }
    // Download each one
    successful.forEach((r, i) => {
      setTimeout(() => downloadResult(r, 'mockup'), i * 300);
    });
  };

  const downloadAllBGRemoved = () => {
    const successful = results.filter(r => r.status === 'success');
    successful.forEach((r, i) => {
      setTimeout(() => downloadResult(r, 'bg-removed'), i * 300);
    });
  };

  const progressPercent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="batch-page">
      <header className="batch-header">
        <div>
          <h1>Batch Processor</h1>
          <p>Remove backgrounds and generate mockups in bulk</p>
        </div>
      </header>

      {/* Settings */}
      <div className="batch-settings">
        <div className="batch-setting-group">
          <label>T-Shirt Color</label>
          <div className="batch-color-row">
            {TSHIRT_COLORS.slice(0, 10).map(c => (
              <button
                key={c.hex}
                className={`batch-color-btn ${selectedColor.hex === c.hex ? 'active' : ''}`}
                style={{ backgroundColor: c.hex, border: c.hex === '#ffffff' ? '2px solid #e2e8f0' : '2px solid transparent' }}
                onClick={() => setSelectedColor(c)}
                title={c.name}
              />
            ))}
          </div>
        </div>
        <div className="batch-setting-group">
          <label>Size</label>
          <select value={selectedSize} onChange={(e) => setSelectedSize(e.target.value)} className="batch-select">
            {['S', 'M', 'L', 'XL', '2XL', '3XL'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="batch-setting-group">
          <label>BG Removal</label>
          <select value={bgMode} onChange={(e) => setBgMode(e.target.value)} className="batch-select">
            <option value="auto">Auto Detect</option>
            <option value="fast">Fast</option>
            <option value="balanced">Balanced</option>
            <option value="ai">AI Precision</option>
          </select>
        </div>
        <div className="batch-setting-group">
          <label>Garment</label>
          <span className="batch-garment-status">
            {garmentImg ? '✓ L T-Shirt loaded' : 'Vector fallback'}
          </span>
        </div>
      </div>

      {/* Upload Area */}
      <div
        className="batch-upload-zone"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
      >
        <div className="batch-upload-content">
          <span className="batch-upload-icon">📁</span>
          <span className="batch-upload-text">Drop artwork files here or click to browse</span>
          <span className="batch-upload-hint">PNG, JPG, WebP — Multiple files supported</span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="batch-file-list">
          <div className="batch-file-header">
            <span>{files.length} file{files.length > 1 ? 's' : ''} queued</span>
            <div className="batch-file-actions">
              {!processing && (
                <>
                  <button className="batch-btn batch-btn-primary" onClick={processAll}>
                    ▶ Process All ({files.length})
                  </button>
                  <button className="batch-btn batch-btn-ghost" onClick={clearAll}>Clear All</button>
                </>
              )}
              {processing && (
                <button className="batch-btn batch-btn-danger" onClick={stopProcessing}>⬛ Stop</button>
              )}
            </div>
          </div>
          <div className="batch-file-grid">
            {files.map((file, idx) => (
              <div key={idx} className="batch-file-item">
                <span className="batch-file-name">{file.name}</span>
                <span className="batch-file-size">{(file.size / 1024).toFixed(0)} KB</span>
                {!processing && (
                  <button className="batch-file-remove" onClick={() => removeFile(idx)}>×</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress */}
      {(processing || progress.total > 0) && (
        <div className="batch-progress">
          <div className="batch-progress-bar">
            <div className="batch-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="batch-progress-info">
            <span>{progress.status}</span>
            <span>{progressPercent}%</span>
          </div>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="batch-results">
          <div className="batch-results-header">
            <h3>Results ({results.filter(r => r.status === 'success').length}/{results.length})</h3>
            <div className="batch-results-actions">
              <button className="batch-btn batch-btn-primary" onClick={downloadAllMockups}>
                ↓ Download All Mockups
              </button>
              <button className="batch-btn" onClick={downloadAllBGRemoved}>
                ↓ All BG Removed
              </button>
            </div>
          </div>
          <div className="batch-results-grid">
            {results.map((result, idx) => (
              <div key={idx} className={`batch-result-card ${result.status}`}>
                {result.status === 'success' ? (
                  <>
                    <div className="batch-result-previews">
                      <div className="batch-result-thumb">
                        <img src={result.bgRemovedUrl} alt="BG Removed" />
                        <span className="batch-result-label">BG Removed</span>
                      </div>
                      <div className="batch-result-thumb">
                        <img src={result.mockupUrl} alt="Mockup" />
                        <span className="batch-result-label">Mockup</span>
                      </div>
                    </div>
                    <div className="batch-result-info">
                      <span className="batch-result-filename">{result.filename}</span>
                      <span className="batch-result-dims">
                        {result.artDimensions.width}" × {result.artDimensions.height}" | {result.processedSize}px
                      </span>
                    </div>
                    <div className="batch-result-btns">
                      <button className="batch-btn-sm" onClick={() => downloadResult(result, 'mockup')}>Mockup</button>
                      <button className="batch-btn-sm" onClick={() => downloadResult(result, 'bg-removed')}>PNG</button>
                    </div>
                  </>
                ) : (
                  <div className="batch-result-error">
                    <span className="batch-result-filename">{result.filename}</span>
                    <span className="batch-result-err-msg">Error: {result.error}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default BatchProcessor;
