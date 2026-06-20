import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TSHIRT_SIZES } from '../constants/tshirtSizes';
import { GARMENTS_API, SERVE_IMAGE_URL, detectApiBase } from '../utils/apiConfig';
import './GarmentManager.css';

const GARMENT_TYPES = ['T-Shirt', 'Hoodie', 'Long Sleeve', 'Tank Top', 'Other'];
const STORAGE_KEY = 'garment-library';
const MAX_GARMENTS = 50;

function trimTransparentPixels(imageDataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data, width, height } = imageData;

      let top = height, bottom = 0, left = width, right = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const alpha = data[(y * width + x) * 4 + 3];
          if (alpha > 0) {
            if (y < top) top = y;
            if (y > bottom) bottom = y;
            if (x < left) left = x;
            if (x > right) right = x;
          }
        }
      }

      if (top > bottom || left > right) {
        resolve({ dataUrl: imageDataUrl, width: img.width, height: img.height });
        return;
      }

      const trimW = right - left + 1;
      const trimH = bottom - top + 1;
      const trimCanvas = document.createElement('canvas');
      trimCanvas.width = trimW;
      trimCanvas.height = trimH;
      const trimCtx = trimCanvas.getContext('2d');
      trimCtx.drawImage(img, left, top, trimW, trimH, 0, 0, trimW, trimH);
      resolve({ dataUrl: trimCanvas.toDataURL('image/png'), width: trimW, height: trimH });
    };
    img.src = imageDataUrl;
  });
}

function GarmentManager({ onUseAsMockup }) {
  const [garmentImage, setGarmentImage] = useState(null); // { dataUrl, width, height, fileName }
  const [originalDimensions, setOriginalDimensions] = useState(null);
  const [autoTrim, setAutoTrim] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [library, setLibrary] = useState([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState(null);
  const [garmentName, setGarmentName] = useState('');
  const [garmentType, setGarmentType] = useState('T-Shirt');
  const [garmentSize, setGarmentSize] = useState('XL');
  const [bodyMapping, setBodyMapping] = useState({
    shirtWidthInches: 20,   // actual shirt body width
    shirtHeightInches: 29,  // actual shirt body height
    widthInches: 13,        // print area width
    heightInches: 14.5,     // print area height
    topOffsetInches: 3,     // print area top offset
  });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  // API base URL — auto-detected for local and remote servers
  const [API_URL, setApiUrl] = useState(GARMENTS_API);
  const [IMAGE_URL, setImageUrl] = useState(SERVE_IMAGE_URL);

  // Load library from server (shared for all users)
  useEffect(() => {
    detectApiBase().then(base => {
      const apiUrl = `${base}/garments.php`;
      const imgUrl = `${base}/serve-image.php`;
      setApiUrl(apiUrl);
      setImageUrl(imgUrl);

      fetch(apiUrl)
        .then(res => {
          if (!res.ok) throw new Error('Server error');
          return res.json();
        })
        .then(data => {
          if (!Array.isArray(data)) throw new Error('Invalid data');
          const withUrls = data.map(g => ({
            ...g,
            dataUrl: g.dataUrl || (g.imageFile ? `${imgUrl}?file=${g.imageFile}` : null),
          })).filter(g => g.dataUrl);
          setLibrary(withUrls);
        })
        .catch(e => {
          console.warn('Failed to load from server, trying localStorage', e);
          try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) setLibrary(JSON.parse(stored));
          } catch (err) {}
        });
    });
  }, []);

  // Save library (stores metadata only in localStorage as fallback — no images)
  const saveLibrary = (newLibrary) => {
    setLibrary(newLibrary);
    try {
      // Only store metadata (no dataUrl) to avoid localStorage quota issues
      const metaOnly = newLibrary.map(({ dataUrl, ...rest }) => rest);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(metaOnly));
    } catch (e) {
      // localStorage full — that's OK, server is the primary storage
    }
  };

  // Handle file upload
  const handleFile = useCallback(async (file) => {
    setErrorMsg('');
    if (!file || !file.type.includes('png')) {
      setErrorMsg('Only PNG files are accepted.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      const img = new Image();
      img.onload = async () => {
        setOriginalDimensions({ width: img.width, height: img.height });
        let finalW = img.width, finalH = img.height;
        if (autoTrim) {
          const trimmed = await trimTransparentPixels(dataUrl);
          setGarmentImage({ dataUrl: trimmed.dataUrl, width: trimmed.width, height: trimmed.height, fileName: file.name });
          finalW = trimmed.width;
          finalH = trimmed.height;
        } else {
          setGarmentImage({ dataUrl, width: img.width, height: img.height, fileName: file.name });
        }
        // Auto-set shirt dimensions from image pixel size at 300 DPI
        const DPI = 300;
        const autoW = parseFloat((finalW / DPI).toFixed(2));
        const autoH = parseFloat((finalH / DPI).toFixed(2));
        setBodyMapping(prev => ({
          ...prev,
          shirtWidthInches: autoW,
          shirtHeightInches: autoH,
        }));
        setGarmentName(file.name.replace('.png', '').replace(/[-_]/g, ' '));
        setZoom(1);
        setPan({ x: 0, y: 0 });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, [autoTrim]);

  // Manual trim
  const handleTrimNow = async () => {
    if (!garmentImage) return;
    const trimmed = await trimTransparentPixels(garmentImage.dataUrl);
    setGarmentImage({ ...garmentImage, dataUrl: trimmed.dataUrl, width: trimmed.width, height: trimmed.height });
  };

  // Drag and drop handlers
  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  // Canvas drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    if (!garmentImage) return;

    const img = new Image();
    img.onload = () => {
      ctx.save();
      ctx.translate(W / 2 + pan.x, H / 2 + pan.y);
      ctx.scale(zoom, zoom);

      // Fit image to canvas
      const scale = Math.min((W * 0.85) / img.width, (H * 0.85) / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const drawX = -drawW / 2;
      const drawY = -drawH / 2;

      ctx.drawImage(img, drawX, drawY, drawW, drawH);

      // Draw body mapping overlay (inches-based)
      // Use the manually entered shirt dimensions (not from size tag)
      const bodyWidthInches = bodyMapping.shirtWidthInches || 20;
      const bodyLengthInches = bodyMapping.shirtHeightInches || 29;

      // Pixels per inch (image = full body)
      const pxPerInchW = drawW / bodyWidthInches;
      const pxPerInchH = drawH / bodyLengthInches;

      const printW = bodyMapping.widthInches * pxPerInchW;
      const printH = bodyMapping.heightInches * pxPerInchH;
      const printTopOffset = bodyMapping.topOffsetInches * pxPerInchH;

      const bodyX = drawX + (drawW - printW) / 2;
      const bodyY = drawY + printTopOffset;

      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2 / zoom;
      ctx.setLineDash([6 / zoom, 4 / zoom]);
      ctx.strokeRect(bodyX, bodyY, printW, printH);
      ctx.setLineDash([]);

      // Label
      ctx.fillStyle = 'rgba(37, 99, 235, 0.8)';
      ctx.font = `${11 / zoom}px Inter, sans-serif`;
      ctx.fillText(`Print Area: ${bodyMapping.widthInches}" × ${bodyMapping.heightInches}"`, bodyX + 4 / zoom, bodyY - 4 / zoom);

      ctx.restore();
    };
    img.src = garmentImage.dataUrl;
  }, [garmentImage, zoom, pan, bodyMapping]);

  // Pan handlers
  const handleCanvasMouseDown = (e) => {
    if (zoom > 1) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };
  const handleCanvasMouseMove = (e) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  };
  const handleCanvasMouseUp = () => setIsPanning(false);

  // Zoom controls
  const zoomIn = () => setZoom((z) => Math.min(z + 0.25, 4));
  const zoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));
  const zoomFit = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // Save to library
  const saveToLibrary = () => {
    if (!garmentImage) return;
    if (library.length >= MAX_GARMENTS) {
      setErrorMsg(`Maximum ${MAX_GARMENTS} garments allowed. Delete one first.`);
      return;
    }

    // Resize image for storage (max 800px)
    const img = new Image();
    img.onload = () => {
      const maxSize = 800;
      let w = img.width, h = img.height;
      if (w > maxSize || h > maxSize) {
        if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
        else { w = Math.round(w * maxSize / h); h = maxSize; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const compressedUrl = canvas.toDataURL('image/png');

      const newGarment = {
        name: garmentName || 'Untitled',
        type: garmentType,
        size: garmentSize,
        dataUrl: compressedUrl,
        width: garmentImage.width,
        height: garmentImage.height,
        bodyMapping: { ...bodyMapping },
      };

      // Save to server API
      setErrorMsg('Saving...');
      fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newGarment),
      })
        .then(res => {
          if (!res.ok) throw new Error(`Server error: ${res.status} ${res.statusText}`);
          return res.json();
        })
        .then(saved => {
          if (saved.error) throw new Error(saved.error);
          saved.dataUrl = compressedUrl;
          const newLibrary = [...library, saved];
          saveLibrary(newLibrary);
          setSelectedLibraryId(saved.id);
          setErrorMsg('✓ Saved successfully!');
          setTimeout(() => setErrorMsg(''), 2000);
        })
        .catch(e => {
          console.error('Server save failed:', e);
          // Fallback: save locally with a generated ID
          newGarment.id = Date.now().toString();
          newGarment.imageFile = null;
          const newLibrary = [...library, newGarment];
          saveLibrary(newLibrary);
          setSelectedLibraryId(newGarment.id);
          setErrorMsg(`⚠️ Saved locally only (server error: ${e.message}). Garment may not persist across sessions.`);
        });
    };
    img.src = garmentImage.dataUrl;
  };

  // Delete from library
  const deleteFromLibrary = (id) => {
    const newLibrary = library.filter((g) => g.id !== id);
    saveLibrary(newLibrary);
    if (selectedLibraryId === id) setSelectedLibraryId(null);

    // Delete from server
    fetch(API_URL, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  };

  // Select from library
  const selectFromLibrary = (garment) => {
    setSelectedLibraryId(garment.id);
    setGarmentImage({ dataUrl: garment.dataUrl, width: garment.width, height: garment.height, fileName: garment.name });
    setGarmentName(garment.name);
    setGarmentType(garment.type);
    setGarmentSize(garment.size || '');
    setBodyMapping(garment.bodyMapping);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Use as mockup
  const handleUseAsMockup = () => {
    if (!garmentImage) return;
    onUseAsMockup({
      dataUrl: garmentImage.dataUrl,
      bodyMapping: { ...bodyMapping },
      name: garmentName || 'Custom Garment',
      type: garmentType,
    });
  };

  const getTypeBadgeClass = (type) => {
    return type.toLowerCase().replace(/\s+/g, '-');
  };

  return (
    <div className="garment-manager">
      {/* Header */}
      <div className="garment-manager-header">
        <div className="garment-manager-header-left">
          <h1>Garment Manager</h1>
          <p>Upload and manage garment mockups for preview</p>
        </div>
        <button className="gm-btn-use" onClick={handleUseAsMockup} disabled={!garmentImage}>
          Use in Mockup
        </button>
      </div>

      <div className="garment-manager-body">
        {/* Left Panel - Upload */}
        <div className="gm-left-panel">
          <div
            className={`gm-upload-area ${dragOver ? 'drag-over' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17,8 12,3 7,8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p>Drop PNG here or click to upload</p>
            <p className="gm-upload-hint">PNG files only</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,image/png"
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files[0])}
          />

          {errorMsg && <div className="gm-error-msg">{errorMsg}</div>}

          {garmentImage && (
            <div className="gm-file-info">
              <p><strong>{garmentImage.fileName}</strong></p>
              <p>Dimensions: {garmentImage.width} × {garmentImage.height} px</p>
              <p>Color Mode: RGBA (PNG)</p>
              <p>Aspect Ratio: {(garmentImage.width / garmentImage.height).toFixed(2)}</p>
              <div className="gm-input-row" style={{ marginTop: '8px' }}>
                <label>Shirt W</label>
                <input
                  type="number" min="1" max="50" step="0.5"
                  className="gm-num-input"
                  value={bodyMapping.shirtWidthInches}
                  onChange={(e) => setBodyMapping({ ...bodyMapping, shirtWidthInches: parseFloat(e.target.value) || 20 })}
                />
                <span style={{ fontSize: '11px', color: '#64748b' }}>in</span>
              </div>
              <div className="gm-input-row">
                <label>Shirt H</label>
                <input
                  type="number" min="1" max="50" step="0.5"
                  className="gm-num-input"
                  value={bodyMapping.shirtHeightInches}
                  onChange={(e) => setBodyMapping({ ...bodyMapping, shirtHeightInches: parseFloat(e.target.value) || 29 })}
                />
                <span style={{ fontSize: '11px', color: '#64748b' }}>in</span>
              </div>
              <p>DPI: ~{Math.round(garmentImage.width / bodyMapping.shirtWidthInches)}</p>
              {originalDimensions && originalDimensions.width !== garmentImage.width && (
                <p>Before Trim: {originalDimensions.width} × {originalDimensions.height} px</p>
              )}
            </div>
          )}

          <div className="gm-trim-controls">
            <div className="gm-toggle-row">
              <span>Auto Trim</span>
              <div
                className={`gm-toggle ${autoTrim ? 'active' : ''}`}
                onClick={() => setAutoTrim(!autoTrim)}
              />
            </div>
            <button className="gm-btn-trim" onClick={handleTrimNow} disabled={!garmentImage}>
              Trim Now
            </button>
          </div>
        </div>

        {/* Center Panel - Canvas */}
        <div className="gm-center-panel">
          <div className="gm-canvas-controls">
            <button onClick={zoomIn}>+</button>
            <button onClick={zoomOut}>−</button>
            <button onClick={zoomFit}>Fit</button>
          </div>
          <div
            className="gm-canvas-wrapper"
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
          >
            <canvas ref={canvasRef} width={600} height={500} />
          </div>
          {garmentImage && (
            <div className="gm-canvas-dimensions">
              {garmentImage.width} × {garmentImage.height} px | 
              Body: {bodyMapping.shirtWidthInches}" × {bodyMapping.shirtHeightInches}" | 
              Zoom: {Math.round(zoom * 100)}%
            </div>
          )}
        </div>

        {/* Right Panel - Garment Library */}
        <div className="gm-right-panel">
          <h3>Garment Library</h3>
          {library.length === 0 ? (
            <div className="gm-library-empty">
              <p>No garments saved yet.</p>
              <p>Upload and save a garment to get started.</p>
            </div>
          ) : (
            <div className="gm-library-grid">
              {library.map((g) => (
                <div
                  key={g.id}
                  className={`gm-library-card ${selectedLibraryId === g.id ? 'selected' : ''}`}
                  onClick={() => selectFromLibrary(g)}
                >
                  <img className="gm-library-card-thumb" src={g.dataUrl} alt={g.name} />
                  <div className="gm-library-card-info">
                    <div className="gm-library-card-name">{g.name}</div>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <span className={`gm-type-badge ${getTypeBadgeClass(g.type)}`}>{g.type}</span>
                      {g.size && <span className="gm-type-badge" style={{ background: '#fef3c7', color: '#d97706' }}>{g.size}</span>}
                    </div>
                  </div>
                  <button
                    className="gm-library-card-delete"
                    onClick={(e) => { e.stopPropagation(); deleteFromLibrary(g.id); }}
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="gm-library-count">{library.length}/{MAX_GARMENTS} garments</div>
        </div>
      </div>

      {/* Bottom Panel - Settings */}
      <div className="gm-bottom-panel">
        <div className="gm-setting-group">
          <label>Garment Type</label>
          <select value={garmentType} onChange={(e) => setGarmentType(e.target.value)}>
            {GARMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="gm-setting-group">
          <label>Size Tag</label>
          <select value={garmentSize} onChange={(e) => setGarmentSize(e.target.value)}>
            <option value="">No Size</option>
            <option value="2T">2T</option>
            <option value="3T">3T</option>
            <option value="4T">4T</option>
            <option value="5T">5T</option>
            <option value="YS">YS</option>
            <option value="YM">YM</option>
            <option value="YL">YL</option>
            <option value="YXL">YXL</option>
            <option value="S">S</option>
            <option value="M">M</option>
            <option value="L">L</option>
            <option value="XL">XL</option>
            <option value="2XL">2XL</option>
            <option value="3XL">3XL</option>
            <option value="4XL">4XL</option>
            <option value="5XL">5XL</option>
          </select>
        </div>
        <div className="gm-setting-group">
          <label>Garment Name</label>
          <input
            type="text"
            value={garmentName}
            onChange={(e) => setGarmentName(e.target.value)}
            placeholder="Enter garment name"
          />
        </div>
        <div className="gm-setting-group gm-slider-group">
          <label>Print Area Config</label>
          <div className="gm-input-row">
            <label>Width</label>
            <input
              type="number" min="1" max="30" step="0.5"
              className="gm-num-input"
              value={bodyMapping.widthInches}
              onChange={(e) => setBodyMapping({ ...bodyMapping, widthInches: Number(e.target.value) || 13 })}
            />
            <span style={{ fontSize: '11px', color: '#64748b' }}>in</span>
          </div>
          <div className="gm-input-row">
            <label>Height</label>
            <input
              type="number" min="1" max="30" step="0.5"
              className="gm-num-input"
              value={bodyMapping.heightInches}
              onChange={(e) => setBodyMapping({ ...bodyMapping, heightInches: Number(e.target.value) || 14.5 })}
            />
            <span style={{ fontSize: '11px', color: '#64748b' }}>in</span>
          </div>
          <div className="gm-input-row">
            <label>Top Offset</label>
            <input
              type="number" min="0" max="15" step="0.5"
              className="gm-num-input"
              value={bodyMapping.topOffsetInches}
              onChange={(e) => setBodyMapping({ ...bodyMapping, topOffsetInches: Number(e.target.value) || 0 })}
            />
            <span style={{ fontSize: '11px', color: '#64748b' }}>in</span>
          </div>
        </div>
        <div className="gm-bottom-actions">
          <button className="gm-btn-save" onClick={saveToLibrary} disabled={!garmentImage}>
            Save to Library
          </button>
          <button className="gm-btn-use" onClick={handleUseAsMockup} disabled={!garmentImage}>
            Use as Mockup
          </button>
        </div>
      </div>
    </div>
  );
}

export default GarmentManager;
