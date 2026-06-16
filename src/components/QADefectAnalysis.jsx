import React, { useState, useRef, useCallback, useEffect } from 'react';
import { analyzeImage, getImageMetadata, DEFECT_TYPES, SEVERITY_LEVELS } from '../utils/qaDefectUtils';
import './QADefectAnalysis.css';

function QADefectAnalysis({ sharedArtwork, onSendToBGRemover, onSendToMockup }) {
  // Image state
  const [uploadedImage, setUploadedImage] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imageMetadata, setImageMetadata] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // Analysis state
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isFixing, setIsFixing] = useState(null); // holds defect id being fixed

  // Filter state
  const [activeFilters, setActiveFilters] = useState(
    DEFECT_TYPES.reduce((acc, dt) => ({ ...acc, [dt.id]: true }), {})
  );
  const [severityFilter, setSeverityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // View state
  const [viewMode, setViewMode] = useState('normal');
  const [showLabels, setShowLabels] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [viewType, setViewType] = useState('list');
  const [selectedDefect, setSelectedDefect] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const previewContainerRef = useRef(null);

  // Load shared artwork if provided
  useEffect(() => {
    if (sharedArtwork && sharedArtwork.dataUrl) {
      const img = new Image();
      img.onload = () => {
        setUploadedImage(sharedArtwork.dataUrl);
        setImageFile({ name: sharedArtwork.filename || 'shared-artwork.png', type: 'image/png', size: 0 });
        setImageMetadata(getImageMetadata(
          { name: sharedArtwork.filename || 'shared-artwork.png', type: 'image/png', size: 0 },
          img
        ));
        runAnalysis(img);
      };
      img.src = sharedArtwork.dataUrl;
    }
  }, [sharedArtwork]);

  // Handle file upload
  const handleFileUpload = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        setUploadedImage(e.target.result);
        setImageFile(file);
        setImageMetadata(getImageMetadata(file, img));
        runAnalysis(img);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }, []);

  // Run image analysis
  const runAnalysis = useCallback((img) => {
    setIsAnalyzing(true);
    setSelectedDefect(null);

    // Use setTimeout to not block UI
    setTimeout(() => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = analyzeImage(imageData, canvas.width, canvas.height);

      setAnalysisResult(result);
      setIsAnalyzing(false);
    }, 100);
  }, []);

  // Drag and drop handlers
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

  // Delete image
  const handleDeleteImage = () => {
    setUploadedImage(null);
    setImageFile(null);
    setImageMetadata(null);
    setAnalysisResult(null);
    setSelectedDefect(null);
  };

  // Filter toggles
  const toggleFilter = (filterId) => {
    setActiveFilters(prev => ({ ...prev, [filterId]: !prev[filterId] }));
  };

  const selectAllFilters = () => {
    const allActive = Object.values(activeFilters).every(v => v);
    const newState = DEFECT_TYPES.reduce((acc, dt) => ({ ...acc, [dt.id]: !allActive }), {});
    setActiveFilters(newState);
  };

  // Zoom controls
  const zoomIn = () => setZoom(prev => Math.min(prev + 25, 400));
  const zoomOut = () => setZoom(prev => Math.max(prev - 25, 25));
  const zoomFit = () => { setZoom(100); setPanOffset({ x: 0, y: 0 }); };

  // Pan handlers
  const handlePanStart = (e) => {
    if (zoom <= 100) return;
    if (e.target.classList.contains('qa-defect-marker')) return;
    e.preventDefault();
    setIsPanning(true);
    setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };
  const handlePanMove = (e) => {
    if (!isPanning) return;
    setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
  };
  const handlePanEnd = () => setIsPanning(false);
  const toggleFullscreen = () => setIsFullscreen(prev => !prev);

  // Reset filters
  const resetFilters = () => {
    setSeverityFilter('all');
    setCategoryFilter('all');
    setActiveFilters(DEFECT_TYPES.reduce((acc, dt) => ({ ...acc, [dt.id]: true }), {}));
  };

  // Resolve a defect (auto-fix and re-analyze)
  const handleResolveDefect = (defect) => {
    if (!uploadedImage) return;
    setIsFixing(defect.id);

    // Create image element to load the current artwork
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function() {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const w = canvas.width;
        const h = canvas.height;

        // Apply fix based on defect type
        if (defect.type === 'semi-transparent') {
          // Fix: threshold alpha — more aggressive, remove edge fringe
          for (let i = 3; i < data.length; i += 4) {
            if (data[i] > 0 && data[i] < 255) {
              data[i] = data[i] > 180 ? 255 : 0;
            }
          }
        } else if (defect.type === 'white-halo') {
          // Fix: remove white/light pixels near transparent areas (2px radius)
          const alphaCopy = new Uint8ClampedArray(data.length);
          for (let i = 0; i < data.length; i++) alphaCopy[i] = data[i];
          for (let y = 2; y < h - 2; y++) {
            for (let x = 2; x < w - 2; x++) {
              const idx = (y * w + x) * 4;
              if (alphaCopy[idx] > 220 && alphaCopy[idx+1] > 220 && alphaCopy[idx+2] > 220 && alphaCopy[idx+3] > 128) {
                // Check 2px radius for transparent pixels
                let hasTransparent = false;
                for (let dy = -2; dy <= 2 && !hasTransparent; dy++) {
                  for (let dx = -2; dx <= 2 && !hasTransparent; dx++) {
                    const nIdx = ((y+dy)*w+(x+dx))*4;
                    if (alphaCopy[nIdx+3] < 30) hasTransparent = true;
                  }
                }
                if (hasTransparent) data[idx+3] = 0;
              }
            }
          }
        } else if (defect.type === 'glow-shadow' || defect.type === 'feather-edges' || defect.type === 'soft-cutout') {
          // Fix: hard threshold on alpha + erode edges by 1px
          // First pass: threshold alpha
          for (let i = 3; i < data.length; i += 4) {
            if (data[i] > 0 && data[i] < 255) {
              data[i] = data[i] > 150 ? 255 : 0;
            }
          }
          // Second pass: erode (remove edge pixels that border transparency)
          const erosionCopy = new Uint8ClampedArray(data);
          for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
              const idx = (y * w + x) * 4;
              if (erosionCopy[idx+3] > 200) {
                const ns = [((y-1)*w+x)*4, ((y+1)*w+x)*4, (y*w+(x-1))*4, (y*w+(x+1))*4];
                for (const nIdx of ns) {
                  if (erosionCopy[nIdx+3] < 30) { data[idx+3] = 0; break; }
                }
              }
            }
          }
        } else if (defect.type === 'floating-pixels') {
          // Fix: more aggressive - remove any pixel cluster smaller than 4x4
          // Use connected component labeling approach
          const visited = new Uint8Array(w * h);
          const toRemove = [];

          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const pIdx = y * w + x;
              if (visited[pIdx] || data[pIdx * 4 + 3] < 50) continue;

              // BFS to find connected component
              const component = [];
              const queue = [{x, y}];
              visited[pIdx] = 1;

              while (queue.length > 0 && component.length < 50) {
                const pt = queue.shift();
                component.push(pt);
                const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
                for (const [dy, dx] of dirs) {
                  const nx = pt.x + dx, ny = pt.y + dy;
                  if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                    const nPIdx = ny * w + nx;
                    if (!visited[nPIdx] && data[nPIdx * 4 + 3] > 50) {
                      visited[nPIdx] = 1;
                      queue.push({x: nx, y: ny});
                    }
                  }
                }
              }

              // If component is small (< 16 pixels), mark for removal
              if (component.length < 16) {
                toRemove.push(...component);
              }
            }
          }

          // Remove small clusters
          for (const pt of toRemove) {
            const idx = (pt.y * w + pt.x) * 4;
            data[idx+3] = 0;
          }
        } else if (defect.type === 'noise-dots') {
          // Fix: more aggressive median filter
          const origData = new Uint8ClampedArray(data);
          for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
              const idx = (y * w + x) * 4;
              if (origData[idx+3] < 50) continue;

              // Check if pixel differs significantly from ALL neighbors
              const offsets = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
              let diffCount = 0, totalN = 0;
              let rS=0, gS=0, bS=0, n=0;

              for (const [dy, dx] of offsets) {
                const nIdx = ((y+dy)*w+(x+dx))*4;
                if (origData[nIdx+3] > 50) {
                  totalN++;
                  const diff = Math.abs(origData[idx]-origData[nIdx]) + Math.abs(origData[idx+1]-origData[nIdx+1]) + Math.abs(origData[idx+2]-origData[nIdx+2]);
                  if (diff > 100) diffCount++;
                  rS += origData[nIdx]; gS += origData[nIdx+1]; bS += origData[nIdx+2]; n++;
                }
              }

              // If pixel differs from most neighbors, replace with average
              if (totalN >= 4 && diffCount >= totalN * 0.6 && n > 0) {
                data[idx] = Math.round(rS/n);
                data[idx+1] = Math.round(gS/n);
                data[idx+2] = Math.round(bS/n);
              }
            }
          }
        } else if (defect.type === 'thin-line') {
          // Fix: thicken thin lines by 1px dilation
          const copy = new Uint8ClampedArray(data);
          for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
              const idx = (y * w + x) * 4;
              if (copy[idx+3] > 200) {
                const ns = [((y-1)*w+x)*4, ((y+1)*w+x)*4, (y*w+(x-1))*4, (y*w+(x+1))*4];
                let tN = 0;
                for (const nIdx of ns) { if (copy[nIdx+3] < 50) tN++; }
                if (tN >= 3) {
                  for (const nIdx of ns) {
                    if (data[nIdx+3] < 50) { data[nIdx]=copy[idx]; data[nIdx+1]=copy[idx+1]; data[nIdx+2]=copy[idx+2]; data[nIdx+3]=255; }
                  }
                }
              }
            }
          }
        }

        // Apply fixed data back to canvas
        ctx.putImageData(imageData, 0, 0);

        // Get the fixed image as data URL
        const fixedUrl = canvas.toDataURL('image/png');
        setUploadedImage(fixedUrl);

        // Re-analyze the fixed image
        const newData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const newResult = analyzeImage(newData, canvas.width, canvas.height);
        setAnalysisResult(newResult);
        setSelectedDefect(null);
        setIsFixing(null);
      } catch (err) {
        console.error('Fix failed:', err);
        setIsFixing(null);
      }
    };
    img.onerror = function() {
      console.error('Failed to load image for fixing');
      setIsFixing(null);
    };
    img.src = uploadedImage;
  };

  // Get filtered defects
  const getFilteredDefects = () => {
    if (!analysisResult) return [];
    return analysisResult.defects.filter(d => {
      if (!activeFilters[d.type]) return false;
      if (severityFilter !== 'all' && d.severity !== severityFilter) return false;
      if (categoryFilter !== 'all' && d.category !== categoryFilter) return false;
      return true;
    });
  };

  const filteredDefects = getFilteredDefects();
  const categories = analysisResult
    ? [...new Set(analysisResult.defects.map(d => d.category))]
    : [];

  return (
    <div className={`qa-page ${isFullscreen ? 'qa-fullscreen' : ''}`}>
      {/* Top Header Bar */}
      <header className="qa-header">
        <div className="qa-header-left">
          <h1 className="qa-title">QA Defect Analysis</h1>
          <p className="qa-subtitle">Review and analyze defects detected in the uploaded image</p>
        </div>
        <div className="qa-header-right">
          {analysisResult && <SummaryBadges summary={analysisResult.summary} />}
          {uploadedImage && onSendToMockup && (
            <button
              className="qa-btn qa-btn-primary"
              style={{ background: '#10b981' }}
              onClick={() => onSendToMockup(uploadedImage)}
            >
              <SendIcon /> Send to Mockup
            </button>
          )}
          <button className="qa-btn qa-btn-outline">
            <HelpIcon /> Need Help?
          </button>
          <button className="qa-btn qa-btn-outline">
            <SettingsIcon /> Settings
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="qa-content">
        {/* Left Panel */}
        <aside className="qa-left-panel">
          {/* Uploaded Image Section */}
          <div className="qa-panel-card">
            <h3 className="qa-panel-title">Uploaded Image</h3>
            {!uploadedImage ? (
              <div
                className={`qa-upload-zone ${isDragging ? 'dragging' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadIcon />
                <p>Drag & drop or click to upload</p>
                <span>PNG, JPG, TIFF</span>
              </div>
            ) : (
              <div className="qa-image-info">
                <div className="qa-thumbnail">
                  <img src={uploadedImage} alt="Uploaded artwork" />
                </div>
                {imageMetadata && (
                  <div className="qa-file-details">
                    <div className="qa-file-row">
                      <span className="qa-file-label">File:</span>
                      <span className="qa-file-value">{imageMetadata.filename}</span>
                    </div>
                    <div className="qa-file-row">
                      <span className="qa-file-label">Dimensions:</span>
                      <span className="qa-file-value">{imageMetadata.dimensions}</span>
                    </div>
                    <div className="qa-file-row">
                      <span className="qa-file-label">DPI:</span>
                      <span className="qa-file-value">~{imageMetadata.dpi}</span>
                    </div>
                    <div className="qa-file-row">
                      <span className="qa-file-label">Color Mode:</span>
                      <span className="qa-file-value">{imageMetadata.colorMode}</span>
                    </div>
                    <div className="qa-file-row">
                      <span className="qa-file-label">Background:</span>
                      <span className="qa-file-value">{imageMetadata.backgroundType}</span>
                    </div>
                  </div>
                )}
                <div className="qa-image-actions">
                  <button className="qa-btn qa-btn-sm" onClick={() => fileInputRef.current?.click()}>
                    Replace Image
                  </button>
                  <button className="qa-btn qa-btn-sm qa-btn-danger" onClick={handleDeleteImage}>
                    <TrashIcon />
                  </button>
                </div>
                {analysisResult && (
                  <div className="qa-analysis-badge">
                    <CheckCircleIcon /> Analysis Complete
                  </div>
                )}
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

          {/* Defect Filters */}
          <div className="qa-panel-card">
            <div className="qa-filter-header">
              <h3 className="qa-panel-title">Defect Filters</h3>
              <button className="qa-select-all-btn" onClick={selectAllFilters}>
                {Object.values(activeFilters).every(v => v) ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="qa-filter-list">
              {DEFECT_TYPES.map(dt => (
                <label key={dt.id} className="qa-filter-item">
                  <input
                    type="checkbox"
                    checked={activeFilters[dt.id]}
                    onChange={() => toggleFilter(dt.id)}
                  />
                  <span className="qa-filter-icon" style={{ color: dt.color }}>{dt.icon}</span>
                  <span className="qa-filter-name">{dt.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Analysis Information */}
          {analysisResult && (
            <div className="qa-panel-card">
              <h3 className="qa-panel-title">Analysis Information</h3>
              <div className="qa-info-list">
                <div className="qa-info-row">
                  <span className="qa-info-label">Analyzed on:</span>
                  <span className="qa-info-value">
                    {new Date(analysisResult.analyzedAt).toLocaleDateString()} {new Date(analysisResult.analyzedAt).toLocaleTimeString()}
                  </span>
                </div>
                <div className="qa-info-row">
                  <span className="qa-info-label">Analysis Mode:</span>
                  <span className="qa-info-value">{analysisResult.analysisMode}</span>
                </div>
                <div className="qa-info-row">
                  <span className="qa-info-label">Inspection Area:</span>
                  <span className="qa-info-value">{analysisResult.inspectionArea}</span>
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* Center Panel - Image Preview */}
        <section className="qa-center-panel">
          <div className="qa-preview-card">
            {/* View Mode Tabs */}
            <div className="qa-preview-toolbar">
              <div className="qa-view-tabs">
                {['normal', 'overlay', 'transparency', 'heatmap'].map(mode => (
                  <button
                    key={mode}
                    className={`qa-view-tab ${viewMode === mode ? 'active' : ''}`}
                    onClick={() => setViewMode(mode)}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    {mode === 'overlay' && ' Defect Overlay'}
                  </button>
                ))}
              </div>
              <div className="qa-preview-controls">
                <label className="qa-toggle-label">
                  <input
                    type="checkbox"
                    checked={showLabels}
                    onChange={(e) => setShowLabels(e.target.checked)}
                  />
                  <span>Show Labels</span>
                </label>
                <div className="qa-zoom-controls">
                  <button className="qa-zoom-btn" onClick={zoomOut}>−</button>
                  <button className="qa-zoom-btn" onClick={zoomIn}>+</button>
                  <button className="qa-zoom-btn" onClick={zoomFit}>Fit</button>
                  <button className="qa-zoom-btn" onClick={toggleFullscreen}>
                    <FullscreenIcon />
                  </button>
                </div>
              </div>
            </div>

            {/* Image Preview Area */}
            <div className="qa-preview-area" ref={previewContainerRef}>
              {!uploadedImage ? (
                <div
                  className={`qa-preview-empty ${isDragging ? 'dragging' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadIcon />
                  <p>Upload an image to begin QA analysis</p>
                  <span>Drag & drop or click to browse</span>
                </div>
              ) : (
                <div
                  className={`qa-preview-image-wrap ${viewMode}`}
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
                    src={uploadedImage}
                    alt="Preview"
                    className="qa-preview-image"
                    ref={canvasRef}
                  />
                  {/* Defect markers overlay */}
                  {showLabels && analysisResult && filteredDefects.map(defect => (
                    <button
                      key={defect.id}
                      className={`qa-defect-marker ${defect.severity} ${selectedDefect?.id === defect.id ? 'selected' : ''}`}
                      style={{
                        left: `${defect.position.x}%`,
                        top: `${defect.position.y}%`,
                      }}
                      onClick={() => setSelectedDefect(defect)}
                      title={defect.name}
                    >
                      {defect.id}
                    </button>
                  ))}
                  {/* View mode overlays */}
                  {viewMode === 'overlay' && <div className="qa-overlay-filter overlay-defect" />}
                  {viewMode === 'transparency' && <div className="qa-overlay-filter overlay-transparency" />}
                  {viewMode === 'heatmap' && <div className="qa-overlay-filter overlay-heatmap" />}
                </div>
              )}
            </div>

            {/* Bottom Info Bar */}
            <div className="qa-preview-footer">
              <span className="qa-footer-hint">
                {selectedDefect
                  ? `Selected: #${selectedDefect.id} ${selectedDefect.name}`
                  : 'Click on a defect in the list or label to view details'}
              </span>
              <span className="qa-footer-zoom">{zoom}%</span>
              {imageMetadata && (
                <span className="qa-footer-dims">{imageMetadata.dimensions}</span>
              )}
            </div>
          </div>

          {/* Defect Details Panel (bottom) */}
          {selectedDefect && (
            <div className="qa-detail-panel">
              <div className="qa-detail-header">
                <div className="qa-detail-title-row">
                  <h3>#{selectedDefect.id} {selectedDefect.name}</h3>
                  <span className={`qa-severity-badge ${selectedDefect.severity}`}>
                    {SEVERITY_LEVELS[selectedDefect.severity].label}
                  </span>
                </div>
                <button className="qa-btn qa-btn-sm" onClick={() => setSelectedDefect(null)}>✕</button>
              </div>
              <div className="qa-detail-body">
                <div className="qa-detail-preview">
                  <img src={uploadedImage} alt="Defect area" />
                </div>
                <div className="qa-detail-info">
                  <div className="qa-detail-grid">
                    <div className="qa-detail-stat">
                      <span className="qa-detail-stat-label">Severity</span>
                      <span className={`qa-detail-stat-value severity-${selectedDefect.severity}`}>
                        {SEVERITY_LEVELS[selectedDefect.severity].label}
                      </span>
                    </div>
                    <div className="qa-detail-stat">
                      <span className="qa-detail-stat-label">Confidence</span>
                      <span className="qa-detail-stat-value">{selectedDefect.confidence}%</span>
                    </div>
                    <div className="qa-detail-stat">
                      <span className="qa-detail-stat-label">Affected Area</span>
                      <span className="qa-detail-stat-value">{selectedDefect.affectedArea}%</span>
                    </div>
                    <div className="qa-detail-stat">
                      <span className="qa-detail-stat-label">Category</span>
                      <span className="qa-detail-stat-value">{selectedDefect.category}</span>
                    </div>
                  </div>
                  <div className="qa-detail-section">
                    <h4>Why it matters</h4>
                    <p>{selectedDefect.whyItMatters}</p>
                  </div>
                  <div className="qa-detail-section">
                    <h4>Detection Method</h4>
                    <p>{selectedDefect.detectionMethod}</p>
                  </div>
                  <div className="qa-detail-section">
                    <h4>How to Inspect</h4>
                    <ul>
                      {selectedDefect.howToInspect.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Right Panel - Detected Defects */}
        <aside className="qa-right-panel">
          <div className="qa-panel-card qa-defects-panel">
            <div className="qa-defects-header">
              <h3 className="qa-panel-title">
                Detected Defects {analysisResult ? `(${filteredDefects.length})` : ''}
              </h3>
              <button className="qa-btn qa-btn-xs" onClick={resetFilters}>Reset Filters</button>
            </div>

            {/* Filter Dropdowns */}
            <div className="qa-defects-filters">
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="qa-filter-select"
              >
                <option value="all">All Severity</option>
                <option value="critical">Critical</option>
                <option value="major">Major</option>
                <option value="minor">Minor</option>
              </select>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="qa-filter-select"
              >
                <option value="all">All Categories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <div className="qa-view-toggle">
                <button
                  className={`qa-view-toggle-btn ${viewType === 'list' ? 'active' : ''}`}
                  onClick={() => setViewType('list')}
                  title="List view"
                >
                  <ListIcon />
                </button>
                <button
                  className={`qa-view-toggle-btn ${viewType === 'grid' ? 'active' : ''}`}
                  onClick={() => setViewType('grid')}
                  title="Grid view"
                >
                  <GridIcon />
                </button>
              </div>
            </div>

            {/* Defects List */}
            <div className={`qa-defects-list ${viewType}`}>
              {!analysisResult ? (
                <div className="qa-defects-empty">
                  <p>Upload an image to see detected defects</p>
                </div>
              ) : isAnalyzing ? (
                <div className="qa-defects-empty">
                  <div className="qa-spinner" />
                  <p>Analyzing image...</p>
                </div>
              ) : filteredDefects.length === 0 ? (
                <div className="qa-defects-empty">
                  <CheckCircleIcon />
                  <p>No defects found matching filters</p>
                </div>
              ) : (
                <>
                  {/* Group by severity */}
                  {['critical', 'major', 'minor'].map(severity => {
                    const severityDefects = filteredDefects.filter(d => d.severity === severity);
                    if (severityDefects.length === 0) return null;
                    return (
                      <div key={severity} className="qa-severity-group">
                        <div className={`qa-severity-group-header ${severity}`}>
                          <span className="qa-severity-dot" />
                          <span>{SEVERITY_LEVELS[severity].label}</span>
                          <span className="qa-severity-count">{severityDefects.length}</span>
                        </div>
                        {severityDefects.map(defect => (
                          <div
                            key={defect.id}
                            className={`qa-defect-item ${selectedDefect?.id === defect.id ? 'selected' : ''}`}
                            onClick={() => setSelectedDefect(defect)}
                          >
                            <div className="qa-defect-item-left">
                              <span className={`qa-defect-num ${severity}`}>{defect.id}</span>
                              <div className="qa-defect-item-info">
                                <span className="qa-defect-item-name">{defect.name}</span>
                                <span className="qa-defect-item-desc">{defect.description}</span>
                              </div>
                            </div>
                            <div className="qa-defect-item-right">
                              <span className="qa-defect-confidence">{defect.confidence}%</span>
                              <button
                                className={`qa-resolve-btn ${defect.severity}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleResolveDefect(defect);
                                }}
                                disabled={isFixing === defect.id}
                                title="Auto-fix this defect"
                              >
                                {isFixing === defect.id ? '...' : 'Fix'}
                              </button>
                              <span className="qa-defect-arrow">›</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// Summary Badges Component
function SummaryBadges({ summary }) {
  const scoreColor = summary.overallScore >= 80 ? '#10b981'
    : summary.overallScore >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="qa-summary-badges">
      <div className="qa-score-badge" style={{ borderColor: scoreColor }}>
        <span className="qa-score-value" style={{ color: scoreColor }}>{summary.overallScore}</span>
        <span className="qa-score-label">Score</span>
      </div>
      <div className="qa-badge qa-badge-critical">
        <span className="qa-badge-count">{summary.critical}</span>
        <span className="qa-badge-label">Critical</span>
      </div>
      <div className="qa-badge qa-badge-major">
        <span className="qa-badge-count">{summary.major}</span>
        <span className="qa-badge-label">Major</span>
      </div>
      <div className="qa-badge qa-badge-minor">
        <span className="qa-badge-count">{summary.minor}</span>
        <span className="qa-badge-label">Minor</span>
      </div>
      <div className="qa-badge qa-badge-passed">
        <span className="qa-badge-count">{summary.passed}</span>
        <span className="qa-badge-label">Passed</span>
      </div>
      <div className="qa-badge qa-badge-confidence">
        <span className="qa-badge-count">{summary.confidence}%</span>
        <span className="qa-badge-label">{summary.confidenceLevel}</span>
      </div>
    </div>
  );
}

// Icon Components
function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17,8 12,3 7,8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3,6 5,6 21,6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22,4 12,14.01 9,11.01" />
    </svg>
  );
}

function FullscreenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

export default QADefectAnalysis;
