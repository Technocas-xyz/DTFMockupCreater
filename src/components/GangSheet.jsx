import React, { useState, useRef, useEffect, useCallback } from 'react';
import './GangSheet.css';

const SHEET_WIDTH_INCHES = 22;
const DPI = 300;

function calculateLayout(artworks, sheetWidth, cuttingGap, margins = { top: 0, bottom: 0, left: 0, right: 0 }) {
  const items = [];
  for (const art of artworks) {
    for (let i = 0; i < art.repetitions; i++) {
      items.push({ artworkId: art.id, w: art.widthInches, h: art.heightInches, dataUrl: art.dataUrl });
    }
  }

  // Sort by height descending for better packing
  items.sort((a, b) => b.h - a.h);

  // Available width = sheet width minus left and right margins
  const availableWidth = sheetWidth - margins.left - margins.right;

  const placed = [];
  let currentY = margins.top;
  let rowItems = [];
  let rowX = margins.left;
  let rowMaxH = 0;

  for (const item of items) {
    if (rowX + item.w > sheetWidth - margins.right && rowItems.length > 0) {
      placed.push(...rowItems);
      currentY += rowMaxH + cuttingGap;
      rowItems = [];
      rowX = margins.left;
      rowMaxH = 0;
    }
    rowItems.push({ ...item, x: rowX, y: currentY });
    rowX += item.w + cuttingGap;
    rowMaxH = Math.max(rowMaxH, item.h);
  }
  if (rowItems.length > 0) {
    placed.push(...rowItems);
    currentY += rowMaxH;
  }

  currentY += margins.bottom;

  return { items: placed, totalHeight: currentY };
}

function GangSheet({ sharedArtwork }) {
  const [artworks, setArtworks] = useState([]);
  const [cuttingGap, setCuttingGap] = useState(0.25);
  const [margins, setMargins] = useState({ top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 });
  const [arrangement, setArrangement] = useState('auto');
  const [tightPack, setTightPack] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [showCutLines, setShowCutLines] = useState(true);
  const [bgTransparent, setBgTransparent] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [layout, setLayout] = useState({ items: [], totalHeight: 0 });

  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageCache = useRef({});
  const nextId = useRef(1);

  // Recalculate layout when artworks or settings change
  useEffect(() => {
    const newLayout = calculateLayout(artworks, SHEET_WIDTH_INCHES, cuttingGap, margins);
    setLayout(newLayout);
  }, [artworks, cuttingGap, margins]);

  // Draw canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const containerWidth = canvas.parentElement?.clientWidth - 40 || 600;
    const scale = (containerWidth * (zoom / 100)) / SHEET_WIDTH_INCHES;
    const canvasWidth = SHEET_WIDTH_INCHES * scale;
    const canvasHeight = Math.max(layout.totalHeight * scale, 200);

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const ctx = canvas.getContext('2d');

    // Background
    if (bgTransparent) {
      // Checkerboard
      const sz = 10;
      for (let y = 0; y < canvasHeight; y += sz) {
        for (let x = 0; x < canvasWidth; x += sz) {
          ctx.fillStyle = ((x / sz + y / sz) % 2 === 0) ? '#ffffff' : '#e2e8f0';
          ctx.fillRect(x, y, sz, sz);
        }
      }
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    // Grid lines
    if (showGrid) {
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= SHEET_WIDTH_INCHES; i++) {
        const x = i * scale;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasHeight);
        ctx.stroke();
      }
      const maxH = Math.ceil(layout.totalHeight) || 1;
      for (let i = 0; i <= maxH; i++) {
        const y = i * scale;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasWidth, y);
        ctx.stroke();
      }
    }

    // Draw artworks
    for (const item of layout.items) {
      const x = item.x * scale;
      const y = item.y * scale;
      const w = item.w * scale;
      const h = item.h * scale;

      const img = imageCache.current[item.dataUrl];
      if (img && img.complete) {
        ctx.drawImage(img, x, y, w, h);
      } else {
        // Placeholder
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#cbd5e1';
        ctx.strokeRect(x, y, w, h);
      }

      // Cut lines
      if (showCutLines) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
      }
    }

    // Border around sheet
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.strokeRect(0, 0, canvasWidth, canvasHeight);
  }, [layout, zoom, showGrid, showCutLines, bgTransparent]);

  // Load images into cache when artworks change
  useEffect(() => {
    let allLoaded = true;
    for (const art of artworks) {
      if (!imageCache.current[art.dataUrl]) {
        allLoaded = false;
        const img = new Image();
        img.onload = () => {
          imageCache.current[art.dataUrl] = img;
          drawCanvas();
        };
        img.src = art.dataUrl;
      }
    }
    if (allLoaded) drawCanvas();
  }, [artworks, drawCanvas]);

  // Redraw when layout or settings change
  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // Resize observer for canvas container
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas?.parentElement) return;
    const observer = new ResizeObserver(() => drawCanvas());
    observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, [drawCanvas]);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const id = nextId.current++;
          const aspect = img.naturalWidth / img.naturalHeight;
          // Default: fit within 4" wide
          let widthInches = Math.min(4, SHEET_WIDTH_INCHES);
          let heightInches = widthInches / aspect;
          if (heightInches > 10) {
            heightInches = 10;
            widthInches = heightInches * aspect;
          }
          widthInches = parseFloat(widthInches.toFixed(2));
          heightInches = parseFloat(heightInches.toFixed(2));

          setArtworks((prev) => [
            ...prev,
            {
              id,
              filename: file.name,
              dataUrl: ev.target.result,
              originalWidth: img.naturalWidth,
              originalHeight: img.naturalHeight,
              widthInches,
              heightInches,
              aspect,
              repetitions: 1,
            },
          ]);
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleUsePrevious = () => {
    if (!sharedArtwork?.dataUrl) return;
    const img = new Image();
    img.onload = () => {
      const id = nextId.current++;
      const aspect = img.naturalWidth / img.naturalHeight;
      let widthInches = Math.min(4, SHEET_WIDTH_INCHES);
      let heightInches = widthInches / aspect;
      widthInches = parseFloat(widthInches.toFixed(2));
      heightInches = parseFloat(heightInches.toFixed(2));

      setArtworks((prev) => [
        ...prev,
        {
          id,
          filename: sharedArtwork.filename || 'shared-artwork.png',
          dataUrl: sharedArtwork.dataUrl,
          originalWidth: img.naturalWidth,
          originalHeight: img.naturalHeight,
          widthInches,
          heightInches,
          aspect,
          repetitions: 1,
        },
      ]);
    };
    img.src = sharedArtwork.dataUrl;
  };

  const updateArtwork = (id, field, value) => {
    setArtworks((prev) =>
      prev.map((art) => {
        if (art.id !== id) return art;
        const updated = { ...art };
        if (field === 'widthInches') {
          updated.widthInches = parseFloat(value) || 0;
          updated.heightInches = parseFloat((updated.widthInches / art.aspect).toFixed(2));
        } else if (field === 'heightInches') {
          updated.heightInches = parseFloat(value) || 0;
          updated.widthInches = parseFloat((updated.heightInches * art.aspect).toFixed(2));
        } else if (field === 'repetitions') {
          updated.repetitions = Math.max(1, Math.min(100, parseInt(value) || 1));
        }
        return updated;
      })
    );
  };

  const removeArtwork = (id) => {
    setArtworks((prev) => prev.filter((a) => a.id !== id));
  };

  const handleDownload = async () => {
    if (layout.items.length === 0) return;

    const exportCanvas = document.createElement('canvas');
    const exportWidth = SHEET_WIDTH_INCHES * DPI;
    const exportHeight = layout.totalHeight * DPI;
    exportCanvas.width = exportWidth;
    exportCanvas.height = exportHeight;

    const ctx = exportCanvas.getContext('2d');

    if (!bgTransparent) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, exportWidth, exportHeight);
    }

    // Draw all items at 300 DPI
    const drawPromises = layout.items.map((item) => {
      return new Promise((resolve) => {
        const img = imageCache.current[item.dataUrl];
        if (img && img.complete) {
          ctx.drawImage(
            img,
            item.x * DPI,
            item.y * DPI,
            item.w * DPI,
            item.h * DPI
          );
          resolve();
        } else {
          const newImg = new Image();
          newImg.onload = () => {
            ctx.drawImage(
              newImg,
              item.x * DPI,
              item.y * DPI,
              item.w * DPI,
              item.h * DPI
            );
            resolve();
          };
          newImg.onerror = resolve;
          newImg.src = item.dataUrl;
        }
      });
    });

    await Promise.all(drawPromises);

    // Draw cut lines on export
    if (showCutLines) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      for (const item of layout.items) {
        ctx.strokeRect(
          item.x * DPI,
          item.y * DPI,
          item.w * DPI,
          item.h * DPI
        );
      }
    }

    const link = document.createElement('a');
    link.download = `gang-sheet-${SHEET_WIDTH_INCHES}x${layout.totalHeight.toFixed(1)}-${DPI}dpi.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  };

  const totalItemCount = artworks.reduce((sum, a) => sum + a.repetitions, 0);

  return (
    <div className="gang-sheet">
      <div className="gang-sheet-header">
        <div className="gang-sheet-header-left">
          <h1>Gang Sheet Generator</h1>
          <p>Arrange artworks on a {SHEET_WIDTH_INCHES}" wide roll for DTF printing</p>
        </div>
        <div className="gang-sheet-header-actions">
          <button
            className="gs-btn-download"
            onClick={handleDownload}
            disabled={layout.items.length === 0}
          >
            Download Gang Sheet
          </button>
          <button className="gs-btn-pdf" onClick={() => alert('PDF export coming soon!')}>
            Export PDF
          </button>
        </div>
      </div>

      <div className="gang-sheet-body">
        {/* Left Panel - Artwork List */}
        <div className="gs-left-panel">
          <div className="gs-add-buttons">
            <button
              className="gs-btn-add primary"
              onClick={() => fileInputRef.current?.click()}
            >
              + Add Artwork
            </button>
            <button
              className="gs-btn-add"
              onClick={handleUsePrevious}
              disabled={!sharedArtwork?.dataUrl}
              title={sharedArtwork?.dataUrl ? 'Load artwork from BG Remover / QA' : 'No shared artwork available'}
            >
              Use Previous
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />

          <div className="gs-artwork-list">
            {artworks.length === 0 && (
              <div className="gs-empty-state">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 15l4-4a2 2 0 012.8 0L15 16" />
                  <path d="M14 14l1-1a2 2 0 012.8 0L21 16" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                </svg>
                <p>No artworks added yet.<br />Click "Add Artwork" to begin.</p>
              </div>
            )}
            {artworks.map((art) => (
              <div key={art.id} className="gs-artwork-item">
                <img src={art.dataUrl} alt={art.filename} className="gs-artwork-thumb" />
                <div className="gs-artwork-info">
                  <div className="gs-artwork-name" title={art.filename}>{art.filename}</div>
                  <div className="gs-artwork-dims">
                    {art.originalWidth} × {art.originalHeight} px
                  </div>
                  <div className="gs-artwork-controls">
                    <div className="gs-input-group">
                      <label>W</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.5"
                        max={SHEET_WIDTH_INCHES}
                        value={art.widthInches}
                        onChange={(e) => updateArtwork(art.id, 'widthInches', e.target.value)}
                      />
                      <span>"</span>
                    </div>
                    <div className="gs-input-group">
                      <label>H</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.5"
                        max="100"
                        value={art.heightInches}
                        onChange={(e) => updateArtwork(art.id, 'heightInches', e.target.value)}
                      />
                      <span>"</span>
                    </div>
                    <div className="gs-input-group">
                      <label>×</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={art.repetitions}
                        onChange={(e) => updateArtwork(art.id, 'repetitions', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <button
                  className="gs-artwork-delete"
                  onClick={() => removeArtwork(art.id)}
                  title="Remove artwork"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {artworks.length > 0 && (
            <div className="gs-total-count">
              {artworks.length} artwork{artworks.length !== 1 ? 's' : ''} · {totalItemCount} total item{totalItemCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Center Panel - Canvas Preview */}
        <div className="gs-center-panel">
          <div className="gs-canvas-toolbar">
            <button className="gs-zoom-btn" onClick={() => setZoom((z) => Math.max(25, z - 25))}>−</button>
            <span className="gs-zoom-label">{zoom}%</span>
            <button className="gs-zoom-btn" onClick={() => setZoom((z) => Math.min(200, z + 25))}>+</button>
            <button className="gs-zoom-btn" onClick={() => setZoom(100)}>Fit</button>
          </div>
          <div className="gs-canvas-container">
            <canvas ref={canvasRef} />
          </div>
          {layout.totalHeight > 0 && (
            <div className="gs-height-indicator">
              Sheet: {SHEET_WIDTH_INCHES}" × {layout.totalHeight.toFixed(2)}" | {totalItemCount} item{totalItemCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Right Panel - Settings */}
        <div className="gs-right-panel">
          <div className="gs-settings-section">
            <h3>Sheet Settings</h3>
            <div className="gs-setting-row">
              <label>Sheet Width</label>
              <span className="gs-setting-value">{SHEET_WIDTH_INCHES}"</span>
            </div>
            <div className="gs-setting-row">
              <label>Cutting Gap</label>
              <input
                type="number"
                step="0.05"
                min="0"
                max="2"
                value={cuttingGap}
                onChange={(e) => setCuttingGap(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="gs-setting-row">
              <label>Arrangement</label>
              <select value={arrangement} onChange={(e) => setArrangement(e.target.value)}>
                <option value="auto">Auto Pack</option>
                <option value="manual">Manual</option>
              </select>
            </div>
          </div>

          <div className="gs-settings-section">
            <h3>Page Margins</h3>
            <div className="gs-setting-row">
              <label>Top</label>
              <input type="number" step="0.1" min="0" max="5" value={margins.top}
                onChange={(e) => setMargins({ ...margins, top: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="gs-setting-row">
              <label>Bottom</label>
              <input type="number" step="0.1" min="0" max="5" value={margins.bottom}
                onChange={(e) => setMargins({ ...margins, bottom: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="gs-setting-row">
              <label>Left</label>
              <input type="number" step="0.1" min="0" max="5" value={margins.left}
                onChange={(e) => setMargins({ ...margins, left: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="gs-setting-row">
              <label>Right</label>
              <input type="number" step="0.1" min="0" max="5" value={margins.right}
                onChange={(e) => setMargins({ ...margins, right: parseFloat(e.target.value) || 0 })} />
            </div>
          </div>

          <div className="gs-settings-section">
            <h3>Display</h3>
            <div className="gs-setting-row">
              <label>Background</label>
              <button
                className={`gs-toggle ${bgTransparent ? 'active' : ''}`}
                onClick={() => setBgTransparent(!bgTransparent)}
                title={bgTransparent ? 'Transparent' : 'White'}
              />
            </div>
            <div className="gs-setting-row">
              <label>Show Grid</label>
              <button
                className={`gs-toggle ${showGrid ? 'active' : ''}`}
                onClick={() => setShowGrid(!showGrid)}
              />
            </div>
            <div className="gs-setting-row">
              <label>Tight Pack</label>
              <button
                className={`gs-toggle ${tightPack ? 'active' : ''}`}
                onClick={() => setTightPack(!tightPack)}
              />
            </div>
            <div className="gs-setting-row">
              <label>Show Cut Lines</label>
              <button
                className={`gs-toggle ${showCutLines ? 'active' : ''}`}
                onClick={() => setShowCutLines(!showCutLines)}
              />
            </div>
          </div>

          <div className="gs-stats">
            <div className="gs-stat-row">
              <label>Total Height</label>
              <span className="highlight">{layout.totalHeight.toFixed(2)}"</span>
            </div>
            <div className="gs-stat-row">
              <label>Total Artworks</label>
              <span>{artworks.length}</span>
            </div>
            <div className="gs-stat-row">
              <label>Total Items</label>
              <span>{totalItemCount}</span>
            </div>
            <div className="gs-stat-row">
              <label>Export Size</label>
              <span>{SHEET_WIDTH_INCHES * DPI} × {Math.round(layout.totalHeight * DPI)} px ({SHEET_WIDTH_INCHES}" × {layout.totalHeight.toFixed(2)}")</span>
            </div>
          </div>

          <button className="gs-btn-recalc" onClick={() => {
            const newLayout = calculateLayout(artworks, SHEET_WIDTH_INCHES, cuttingGap, margins);
            setLayout(newLayout);
          }}>
            ↻ Recalculate Layout
          </button>
        </div>
      </div>
    </div>
  );
}

export default GangSheet;
