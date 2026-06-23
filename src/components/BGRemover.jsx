import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  removeBackground,
  detectObjects,
  generateObjectThumbnail,
  removeObjects,
  keepOnlyObjects,
  cleanEdges,
  enhanceImage,
} from '../utils/bgRemovalUtils';
import './BGRemover.css';

function BGRemover({ sharedArtwork, onSendToQA, onSendToMockup }) {
  // Image state
  const [originalImage, setOriginalImage] = useState(null); // original data URL
  const [processedImageData, setProcessedImageData] = useState(null); // ImageData after BG removal
  const [displayUrl, setDisplayUrl] = useState(null); // current display data URL
  const [imageFile, setImageFile] = useState(null);
  const [imageDimensions, setImageDimensions] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Controls state
  const [processingMode, setProcessingMode] = useState('auto'); // 'auto' | 'manual'
  const [sensitivity, setSensitivity] = useState(40);
  const [feather, setFeather] = useState(0);
  const [removeInteriorWhite, setRemoveInteriorWhite] = useState(true);
  const [bgRemoved, setBgRemoved] = useState(false);

  // Object selection (manual mode)
  const [detectedObjects, setDetectedObjects] = useState([]);
  const [selectedObjectIds, setSelectedObjectIds] = useState(new Set());

  // Enhancement state
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [sharpness, setSharpness] = useState(0);
  const [saturation, setSaturation] = useState(0);

  // View state
  const [showBeforeAfter, setShowBeforeAfter] = useState(false);
  const [splitPosition, setSplitPosition] = useState(50);
  const [zoom, setZoom] = useState(100);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const splitContainerRef = useRef(null);

  // Load shared artwork if provided
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
      setImageFile({ name: filename });
      setBgRemoved(false);
      setProcessedImageData(null);
      setDetectedObjects([]);
      setSelectedObjectIds(new Set());
      resetEnhancements();
    };
    img.src = dataUrl;
  };

  const resetEnhancements = () => {
    setBrightness(0);
    setContrast(0);
    setSharpness(0);
    setSaturation(0);
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

  // Drag and drop
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    handleFileUpload(file);
  }, [handleFileUpload]);

  // Get ImageData from data URL
  const getImageDataFromUrl = (url) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        resolve(imageData);
      };
      img.src = url;
    });
  };

  // Convert ImageData to data URL
  const imageDataToUrl = (imageData) => {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  };

  // Remove background
  const handleRemoveBackground = async () => {
    if (!originalImage) return;
    setIsProcessing(true);

    setTimeout(async () => {
      try {
        const imgData = await getImageDataFromUrl(originalImage);
        const processed = removeBackground(imgData, sensitivity, feather, removeInteriorWhite);
        setProcessedImageData(processed);
        const url = imageDataToUrl(processed);
        setDisplayUrl(url);
        setBgRemoved(true);

        // Always detect objects for selection
        const objects = detectObjects(processed, processed.width, processed.height);
        const objectsWithThumbs = objects.map(obj => ({
          ...obj,
          thumbnail: generateObjectThumbnail(processed, obj.bounds),
        }));
        setDetectedObjects(objectsWithThumbs);
        setSelectedObjectIds(new Set(objectsWithThumbs.map(o => o.id)));
      } catch (err) {
        console.error('Background removal failed:', err);
      }
      setIsProcessing(false);
    }, 50);
  };

  // Reset to original
  const handleReset = () => {
    setDisplayUrl(originalImage);
    setProcessedImageData(null);
    setBgRemoved(false);
    setDetectedObjects([]);
    setSelectedObjectIds(new Set());
    resetEnhancements();
  };

  // Object selection
  const toggleObjectSelection = (objId) => {
    setSelectedObjectIds(prev => {
      const next = new Set(prev);
      if (next.has(objId)) {
        next.delete(objId);
      } else {
        next.add(objId);
      }
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
      // Re-detect objects
      const newObjects = detectObjects(result, result.width, result.height);
      const objectsWithThumbs = newObjects.map(obj => ({
        ...obj,
        thumbnail: generateObjectThumbnail(result, obj.bounds),
      }));
      setDetectedObjects(objectsWithThumbs);
      setSelectedObjectIds(new Set(objectsWithThumbs.map(o => o.id)));
      setIsProcessing(false);
    }, 50);
  };

  const handleDeleteSelected = () => {
    if (!processedImageData) return;
    // Delete objects that are DESELECTED (red X = marked for deletion)
    const idsToDelete = detectedObjects
      .filter(o => !selectedObjectIds.has(o.id))
      .map(o => o.id);
    if (idsToDelete.length === 0) return;
    
    setIsProcessing(true);
    setTimeout(() => {
      const result = removeObjects(processedImageData, idsToDelete, detectedObjects);
      setProcessedImageData(result);
      setDisplayUrl(imageDataToUrl(result));
      const newObjects = detectObjects(result, result.width, result.height);
      const objectsWithThumbs = newObjects.map(obj => ({
        ...obj,
        thumbnail: generateObjectThumbnail(result, obj.bounds),
      }));
      setDetectedObjects(objectsWithThumbs);
      setSelectedObjectIds(new Set(objectsWithThumbs.map(o => o.id)));
      setIsProcessing(false);
    }, 50);
  };

  const handleInvertSelection = () => {
    const allIds = new Set(detectedObjects.map(o => o.id));
    const inverted = new Set([...allIds].filter(id => !selectedObjectIds.has(id)));
    setSelectedObjectIds(inverted);
  };

  // Clean edges
  const handleCleanEdges = () => {
    if (!processedImageData) return;
    setIsProcessing(true);
    setTimeout(() => {
      const result = cleanEdges(processedImageData, processedImageData.width, processedImageData.height);
      setProcessedImageData(result);
      setDisplayUrl(imageDataToUrl(result));
      setIsProcessing(false);
    }, 50);
  };

  // Trim transparent pixels from all sides
  const handleTrim = () => {
    if (!processedImageData) return;
    setIsProcessing(true);
    setTimeout(() => {
      const data = processedImageData.data;
      const w = processedImageData.width;
      const h = processedImageData.height;

      // Find bounding box of non-transparent pixels
      let minX = w, minY = h, maxX = 0, maxY = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > 0) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (maxX < minX || maxY < minY) {
        setIsProcessing(false);
        return; // No opaque pixels found
      }

      // Add 2px padding
      minX = Math.max(0, minX - 2);
      minY = Math.max(0, minY - 2);
      maxX = Math.min(w - 1, maxX + 2);
      maxY = Math.min(h - 1, maxY + 2);

      const newW = maxX - minX + 1;
      const newH = maxY - minY + 1;

      // Create trimmed image
      const canvas = document.createElement('canvas');
      canvas.width = newW;
      canvas.height = newH;
      const ctx = canvas.getContext('2d');

      // Put original data on a temp canvas
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = w;
      tempCanvas.height = h;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.putImageData(processedImageData, 0, 0);

      // Draw cropped region
      ctx.drawImage(tempCanvas, minX, minY, newW, newH, 0, 0, newW, newH);

      const trimmedData = ctx.getImageData(0, 0, newW, newH);
      setProcessedImageData(trimmedData);
      setImageDimensions({ width: newW, height: newH });
      setDisplayUrl(canvas.toDataURL('image/png'));

      // Re-detect objects
      const newObjects = detectObjects(trimmedData, newW, newH);
      const objectsWithThumbs = newObjects.map(obj => ({
        ...obj,
        thumbnail: generateObjectThumbnail(trimmedData, obj.bounds),
      }));
      setDetectedObjects(objectsWithThumbs);
      setSelectedObjectIds(new Set(objectsWithThumbs.map(o => o.id)));
      setIsProcessing(false);
    }, 50);
  };

  // Apply enhancements
  const applyEnhancements = useCallback(() => {
    if (!processedImageData && !originalImage) return;
    const sourceData = processedImageData;
    if (!sourceData) return;

    if (brightness === 0 && contrast === 0 && sharpness === 0 && saturation === 0) {
      setDisplayUrl(imageDataToUrl(sourceData));
      return;
    }

    const enhanced = enhanceImage(sourceData, { brightness, contrast, sharpness, saturation });
    setDisplayUrl(imageDataToUrl(enhanced));
  }, [processedImageData, brightness, contrast, sharpness, saturation]);

  useEffect(() => {
    if (bgRemoved && processedImageData) {
      applyEnhancements();
    }
  }, [brightness, contrast, sharpness, saturation, applyEnhancements, bgRemoved, processedImageData]);

  // Download PNG
  const handleDownload = () => {
    if (!displayUrl) return;
    const link = document.createElement('a');
    link.download = imageFile ? `processed-${imageFile.name}` : 'processed-image.png';
    link.href = displayUrl;
    link.click();
  };

  // Send to QA / Mockup
  const handleSendToQA = () => {
    if (displayUrl && onSendToQA) {
      onSendToQA(displayUrl);
    }
  };

  const handleSendToMockup = () => {
    if (!displayUrl || !onSendToMockup) return;
    // Trim transparent/semi-transparent pixels before sending to mockup
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data, width, height } = imageData;

      // First pass: remove semi-transparent pixels (alpha < 20) — make them fully transparent
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 0 && data[i + 3] < 20) {
          data[i + 3] = 0;
        }
      }
      ctx.putImageData(imageData, 0, 0);

      // Second pass: find bounds of non-transparent content (alpha >= 20)
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

      if (top > bottom || left > right) {
        onSendToMockup(displayUrl);
        return;
      }

      const trimW = right - left + 1;
      const trimH = bottom - top + 1;
      const trimCanvas = document.createElement('canvas');
      trimCanvas.width = trimW;
      trimCanvas.height = trimH;
      const trimCtx = trimCanvas.getContext('2d');
      trimCtx.drawImage(canvas, left, top, trimW, trimH, 0, 0, trimW, trimH);
      onSendToMockup(trimCanvas.toDataURL('image/png'));
    };
    img.src = displayUrl;
  };

  // Split view drag
  const handleSplitMouseDown = (e) => {
    e.preventDefault();
    setIsDraggingSplit(true);
  };

  useEffect(() => {
    if (!isDraggingSplit) return;
    const handleMouseMove = (e) => {
      if (!splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setSplitPosition(percent);
    };
    const handleMouseUp = () => setIsDraggingSplit(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingSplit]);

  // Zoom controls
  const zoomIn = () => setZoom(prev => Math.min(prev + 25, 400));
  const zoomOut = () => setZoom(prev => Math.max(prev - 25, 25));
  const zoomFit = () => { setZoom(100); setPanOffset({ x: 0, y: 0 }); };

  // Pan handlers
  const handlePanStart = (e) => {
    if (zoom <= 100) return; // Only pan when zoomed in
    e.preventDefault();
    setIsPanning(true);
    setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };
  const handlePanMove = (e) => {
    if (!isPanning) return;
    setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
  };
  const handlePanEnd = () => setIsPanning(false);

  return (
    <div className="bgr-page">
      {/* Header */}
      <header className="bgr-header">
        <div className="bgr-header-left">
          <h1 className="bgr-title">Background Remover & Image Enhancer</h1>
        </div>
        <div className="bgr-header-right">
          <button
            className="bgr-btn bgr-btn-secondary"
            onClick={handleSendToQA}
            disabled={!displayUrl}
          >
            <SendIcon /> Send to QA
          </button>
          <button
            className="bgr-btn bgr-btn-secondary"
            onClick={handleSendToMockup}
            disabled={!displayUrl}
          >
            <SendIcon /> Send to Mockup
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="bgr-layout">
        {/* Left Panel - Upload & Controls */}
        <aside className="bgr-left-panel">
          <div className="bgr-panel-card">
            <h3 className="bgr-panel-title">Upload Image</h3>
            {!originalImage ? (
              <div
                className={`bgr-upload-zone ${isDragging ? 'dragging' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadIcon />
                <p>Drag & drop or click to upload</p>
                <span>PNG, JPG, TIFF supported</span>
              </div>
            ) : (
              <div className="bgr-file-info">
                <div className="bgr-file-row">
                  <span className="bgr-file-label">File:</span>
                  <span className="bgr-file-value">{imageFile?.name || 'image'}</span>
                </div>
                {imageDimensions && (
                  <div className="bgr-file-row">
                    <span className="bgr-file-label">Size:</span>
                    <span className="bgr-file-value">
                      {imageDimensions.width} × {imageDimensions.height}px
                    </span>
                  </div>
                )}
                <button
                  className="bgr-btn bgr-btn-sm bgr-btn-outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Replace Image
                </button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => handleFileUpload(e.target.files[0])}
            />
          </div>

          {/* Processing Controls */}
          <div className="bgr-panel-card">
            <h3 className="bgr-panel-title">Processing Controls</h3>

            <div className="bgr-control-group">
              <label className="bgr-label">Processing Mode</label>
              <div className="bgr-toggle-group">
                <button
                  className={`bgr-toggle-btn ${processingMode === 'auto' ? 'active' : ''}`}
                  onClick={() => setProcessingMode('auto')}
                >
                  Auto Remove
                </button>
                <button
                  className={`bgr-toggle-btn ${processingMode === 'manual' ? 'active' : ''}`}
                  onClick={() => setProcessingMode('manual')}
                >
                  Manual Select
                </button>
              </div>
            </div>

            <div className="bgr-control-group">
              <label className="bgr-label">
                Background Sensitivity
                <span className="bgr-label-value">{sensitivity}</span>
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={sensitivity}
                onChange={(e) => setSensitivity(Number(e.target.value))}
                className="bgr-slider"
              />
            </div>

            <div className="bgr-control-group">
              <label className="bgr-label">
                Edge Feather
                <span className="bgr-label-value">{feather}px</span>
              </label>
              <input
                type="range"
                min="0"
                max="5"
                step="0.5"
                value={feather}
                onChange={(e) => setFeather(Number(e.target.value))}
                className="bgr-slider"
              />
            </div>

            <div className="bgr-control-group">
              <label className="bgr-label bgr-toggle-label">
                <span>Remove Interior BG</span>
                <button
                  className={`bgr-toggle-btn ${removeInteriorWhite ? 'active' : ''}`}
                  onClick={() => setRemoveInteriorWhite(v => !v)}
                  title="Also remove background color areas trapped inside the artwork"
                >
                  {removeInteriorWhite ? 'ON' : 'OFF'}
                </button>
              </label>
              <p className="bgr-hint">Removes enclosed background pockets inside the design (gaps between chains, letters, etc.)</p>
            </div>

            <div className="bgr-button-group">
              <button
                className="bgr-btn bgr-btn-primary"
                onClick={handleRemoveBackground}
                disabled={!originalImage || isProcessing}
              >
                {isProcessing ? 'Processing...' : 'Remove Background'}
              </button>
              <button
                className="bgr-btn bgr-btn-outline"
                onClick={handleReset}
                disabled={!bgRemoved}
              >
                Reset to Original
              </button>
            </div>
          </div>
        </aside>

        {/* Center Panel - Image Preview */}
        <section className="bgr-center-panel">
          <div className="bgr-preview-card">
            {/* Toolbar */}
            <div className="bgr-preview-toolbar">
              <div className="bgr-view-tabs">
                <button
                  className={`bgr-view-tab ${!showBeforeAfter ? 'active' : ''}`}
                  onClick={() => setShowBeforeAfter(false)}
                >
                  Result
                </button>
                <button
                  className={`bgr-view-tab ${showBeforeAfter ? 'active' : ''}`}
                  onClick={() => setShowBeforeAfter(true)}
                  disabled={!bgRemoved}
                >
                  Before/After
                </button>
              </div>
              <div className="bgr-zoom-controls">
                <button className="bgr-zoom-btn" onClick={zoomOut}>−</button>
                <span className="bgr-zoom-value">{zoom}%</span>
                <button className="bgr-zoom-btn" onClick={zoomIn}>+</button>
                <button className="bgr-zoom-btn" onClick={zoomFit}>Fit</button>
              </div>
            </div>

            {/* Image Area */}
            <div className="bgr-preview-area" ref={splitContainerRef}>
              {isProcessing && (
                <div className="bgr-processing-overlay">
                  <div className="bgr-spinner" />
                  <p>Processing image...</p>
                </div>
              )}

              {!originalImage ? (
                <div
                  className={`bgr-preview-empty ${isDragging ? 'dragging' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadIcon />
                  <p>Upload an image to get started</p>
                  <span>Drag & drop or click to browse</span>
                </div>
              ) : showBeforeAfter && bgRemoved ? (
                <div className="bgr-split-view" style={{ transform: `scale(${zoom / 100})` }}>
                  <div
                    className="bgr-split-before"
                    style={{ width: `${splitPosition}%` }}
                  >
                    <img src={originalImage} alt="Before" className="bgr-split-img" />
                    <span className="bgr-split-label">Before</span>
                  </div>
                  <div
                    className="bgr-split-after"
                    style={{ width: `${100 - splitPosition}%` }}
                  >
                    <img src={displayUrl} alt="After" className="bgr-split-img" />
                    <span className="bgr-split-label">After</span>
                  </div>
                  <div
                    className="bgr-split-handle"
                    style={{ left: `${splitPosition}%` }}
                    onMouseDown={handleSplitMouseDown}
                  >
                    <div className="bgr-split-handle-bar" />
                  </div>
                </div>
              ) : (
                <div
                  className="bgr-image-display"
                  style={{
                    transform: `scale(${zoom / 100}) translate(${panOffset.x / (zoom / 100)}px, ${panOffset.y / (zoom / 100)}px)`,
                    cursor: zoom > 100 ? (isPanning ? 'grabbing' : 'grab') : 'default',
                  }}
                  onMouseDown={handlePanStart}
                  onMouseMove={handlePanMove}
                  onMouseUp={handlePanEnd}
                  onMouseLeave={handlePanEnd}
                >
                  <img
                    src={displayUrl}
                    alt="Preview"
                    className="bgr-preview-image"
                    ref={canvasRef}
                  />
                </div>
              )}
            </div>

            {/* Manual Mode Controls */}
            {bgRemoved && processingMode === 'manual' && (
              <div className="bgr-manual-controls">
                <button
                  className="bgr-btn bgr-btn-sm bgr-btn-primary"
                  onClick={handleKeepSelected}
                  disabled={selectedObjectIds.size === 0}
                >
                  Remove Unselected
                </button>
                <button
                  className="bgr-btn bgr-btn-sm bgr-btn-outline"
                  onClick={handleInvertSelection}
                >
                  Invert Selection
                </button>
              </div>
            )}
          </div>

          {/* Object Selection Panel (shown after BG removal) */}
          {bgRemoved && detectedObjects.length > 0 && (
            <div className="bgr-objects-panel">
              <div className="bgr-objects-header">
                <h3 className="bgr-panel-title">Detected Objects ({detectedObjects.length})</h3>
                <div className="bgr-objects-actions">
                  <button
                    className="bgr-btn bgr-btn-sm bgr-btn-primary"
                    onClick={handleKeepSelected}
                    disabled={selectedObjectIds.size === 0}
                  >
                    Keep Only ✓
                  </button>
                  <button
                    className="bgr-btn bgr-btn-sm bgr-btn-danger"
                    onClick={handleDeleteSelected}
                    disabled={detectedObjects.length === selectedObjectIds.size}
                  >
                    Delete ✕ Items
                  </button>
                </div>
              </div>
              <div className="bgr-objects-grid">
                {detectedObjects.map(obj => (
                  <div
                    key={obj.id}
                    className={`bgr-object-thumb ${selectedObjectIds.has(obj.id) ? 'selected' : 'deselected'}`}
                    onClick={() => toggleObjectSelection(obj.id)}
                  >
                    {obj.thumbnail && <img src={obj.thumbnail} alt={`Object ${obj.id}`} />}
                    <span className="bgr-object-id">#{obj.id}</span>
                    <span className="bgr-object-size">{obj.pixelCount}px</span>
                    {selectedObjectIds.has(obj.id) ? (
                      <span className="bgr-object-check">✓</span>
                    ) : (
                      <span className="bgr-object-x">✕</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Right Panel - Enhancement Tools */}
        <aside className="bgr-right-panel">
          <div className="bgr-panel-card">
            <h3 className="bgr-panel-title">Enhance Image</h3>

            <div className="bgr-control-group">
              <label className="bgr-label">
                Brightness
                <span className="bgr-label-value">{brightness}</span>
              </label>
              <input
                type="range"
                min="-100"
                max="100"
                value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
                className="bgr-slider"
                disabled={!bgRemoved}
              />
            </div>

            <div className="bgr-control-group">
              <label className="bgr-label">
                Contrast
                <span className="bgr-label-value">{contrast}</span>
              </label>
              <input
                type="range"
                min="-100"
                max="100"
                value={contrast}
                onChange={(e) => setContrast(Number(e.target.value))}
                className="bgr-slider"
                disabled={!bgRemoved}
              />
            </div>

            <div className="bgr-control-group">
              <label className="bgr-label">
                Sharpness
                <span className="bgr-label-value">{sharpness}</span>
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={sharpness}
                onChange={(e) => setSharpness(Number(e.target.value))}
                className="bgr-slider"
                disabled={!bgRemoved}
              />
            </div>

            <div className="bgr-control-group">
              <label className="bgr-label">
                Saturation
                <span className="bgr-label-value">{saturation}</span>
              </label>
              <input
                type="range"
                min="-100"
                max="100"
                value={saturation}
                onChange={(e) => setSaturation(Number(e.target.value))}
                className="bgr-slider"
                disabled={!bgRemoved}
              />
            </div>
          </div>

          <div className="bgr-panel-card">
            <h3 className="bgr-panel-title">Actions</h3>
            <div className="bgr-button-stack">
              <button
                className="bgr-btn bgr-btn-outline"
                onClick={handleCleanEdges}
                disabled={!bgRemoved || isProcessing}
              >
                Clean Edges
              </button>
              <button
                className="bgr-btn bgr-btn-outline"
                onClick={handleTrim}
                disabled={!bgRemoved || isProcessing}
              >
                Trim Transparent
              </button>
              <button
                className="bgr-btn bgr-btn-primary"
                onClick={handleDownload}
                disabled={!displayUrl}
              >
                <DownloadIcon /> Download PNG
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// Icons
function UploadIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export default BGRemover;
