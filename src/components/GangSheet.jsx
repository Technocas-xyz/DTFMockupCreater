import React, { useState, useRef, useEffect, useCallback } from 'react';
import './GangSheet.css';

const SHEET_WIDTH_INCHES = 22;
const DPI = 300;

function calculateLayout(artworks, sheetWidth, hGap, vGap, margins, tightPack = false) {
  const marg = margins || { top: 0, bottom: 0, left: 0, right: 0 };
  const items = [];
  for (const art of artworks) {
    for (let i = 0; i < art.repetitions; i++) {
      items.push({ artworkId: art.id, w: art.widthInches, h: art.heightInches, dataUrl: art.dataUrl });
    }
  }

  if (items.length === 0) return { items: [], totalHeight: 0 };

  const availableWidth = sheetWidth - marg.left - marg.right;

  if (!tightPack) {
    // Simple row-by-row packing
    items.sort((a, b) => b.h - a.h);
    const placed = [];
    let currentY = marg.top;
    let rowX = marg.left;
    let rowMaxH = 0;

    for (const item of items) {
      // Check if adding this item would exceed the right boundary
      // Only add cutting gap between items (not after last item in row)
      const neededWidth = rowX > marg.left ? item.w + hGap : item.w;
      const endPos = rowX > marg.left ? rowX + hGap + item.w : rowX + item.w;

      if (rowX > marg.left && endPos > sheetWidth - marg.right + 0.01) {
        // Doesn't fit, wrap to next row
        currentY += rowMaxH + vGap;
        rowX = marg.left;
        rowMaxH = 0;
      }

      // Place item (add gap before if not first in row)
      const placeX = rowX > marg.left ? rowX + hGap : rowX;
      placed.push({ ...item, x: placeX, y: currentY, rotated: false });
      rowX = placeX + item.w;
      rowMaxH = Math.max(rowMaxH, item.h);
    }
    currentY += rowMaxH + marg.bottom;
    return { items: placed, totalHeight: currentY };
  }

  // TIGHT PACK: 2D free-rectangle bin packing with rotation
  // Uses maxrects algorithm - maintains a list of free rectangles
  items.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h));

  let freeRects = [{ x: marg.left, y: marg.top, w: availableWidth, h: 10000 }]; // start with huge height
  const placed = [];
  let maxY = marg.top;

  for (const item of items) {
    let bestScore = Infinity;
    let bestRect = -1;
    let bestX = 0, bestY = 0;
    let bestW = item.w, bestH = item.h;
    let bestRotated = false;

    // Try fitting in each free rectangle (normal + rotated)
    for (let ri = 0; ri < freeRects.length; ri++) {
      const rect = freeRects[ri];

      // Item only needs to fit within the free rect (gap is handled during splitting)
      // Try normal orientation first
      let normalFits = false;
      if (item.w <= rect.w + 0.01 && item.h <= rect.h + 0.01) {
        normalFits = true;
        // Score: prefer positions closer to top-left (shorter y, then shorter x)
        const score = rect.y * 1000 + rect.x;
        if (score < bestScore) {
          bestScore = score;
          bestRect = ri;
          bestX = rect.x;
          bestY = rect.y;
          bestW = item.w;
          bestH = item.h;
          bestRotated = false;
        }
      }

      // Only try rotated if normal doesn't fit in this rect
      if (!normalFits && item.h <= rect.w + 0.01 && item.w <= rect.h + 0.01) {
        const score = rect.y * 1000 + rect.x;
        if (score < bestScore) {
          bestScore = score;
          bestRect = ri;
          bestX = rect.x;
          bestY = rect.y;
          bestW = item.h; // swapped
          bestH = item.w; // swapped
          bestRotated = true;
        }
      }
    }

    if (bestRect >= 0) {
      // Place the item
      placed.push({ ...item, x: bestX, y: bestY, w: bestW, h: bestH, rotated: bestRotated });
      maxY = Math.max(maxY, bestY + bestH);

      // Split free rectangles around the placed item (include cutting gap in the occupied space)
      const placedRect = { x: bestX, y: bestY, w: bestW + hGap, h: bestH + vGap };
      const newFreeRects = [];

      for (const fr of freeRects) {
        // Check if this free rect overlaps with placed item
        if (placedRect.x >= fr.x + fr.w || placedRect.x + placedRect.w <= fr.x ||
            placedRect.y >= fr.y + fr.h || placedRect.y + placedRect.h <= fr.y) {
          // No overlap, keep as is
          newFreeRects.push(fr);
          continue;
        }

        // Split into up to 4 remaining rectangles
        // Left portion
        if (placedRect.x > fr.x) {
          newFreeRects.push({ x: fr.x, y: fr.y, w: placedRect.x - fr.x, h: fr.h });
        }
        // Right portion
        if (placedRect.x + placedRect.w < fr.x + fr.w) {
          newFreeRects.push({ x: placedRect.x + placedRect.w, y: fr.y, w: (fr.x + fr.w) - (placedRect.x + placedRect.w), h: fr.h });
        }
        // Top portion
        if (placedRect.y > fr.y) {
          newFreeRects.push({ x: fr.x, y: fr.y, w: fr.w, h: placedRect.y - fr.y });
        }
        // Bottom portion
        if (placedRect.y + placedRect.h < fr.y + fr.h) {
          newFreeRects.push({ x: fr.x, y: placedRect.y + placedRect.h, w: fr.w, h: (fr.y + fr.h) - (placedRect.y + placedRect.h) });
        }
      }

      // Remove free rects that are fully contained in another
      freeRects = [];
      for (let i = 0; i < newFreeRects.length; i++) {
        let contained = false;
        for (let j = 0; j < newFreeRects.length; j++) {
          if (i === j) continue;
          const a = newFreeRects[i], b = newFreeRects[j];
          if (a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h) {
            contained = true;
            break;
          }
        }
        if (!contained && newFreeRects[i].w > 0.5 && newFreeRects[i].h > 0.5) {
          freeRects.push(newFreeRects[i]);
        }
      }
    }
  }

  return { items: placed, totalHeight: maxY + marg.bottom };
}

function GangSheet({ sharedArtwork }) {
  const [artworks, setArtworks] = useState([]);
  const [hGap, setHGap] = useState(0.5);
  const [vGap, setVGap] = useState(0.5);
  const [margins, setMargins] = useState({ top: 0, bottom: 0, left: 0, right: 0 });
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
    const newLayout = calculateLayout(artworks, SHEET_WIDTH_INCHES, hGap, vGap, margins, tightPack);
    setLayout(newLayout);
  }, [artworks, hGap, vGap, margins, tightPack]);

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
        if (item.rotated) {
          // Draw rotated 90° clockwise
          ctx.save();
          ctx.translate(x + w, y);
          ctx.rotate(Math.PI / 2);
          ctx.drawImage(img, 0, 0, h, w); // swap w/h for drawing
          ctx.restore();
        } else {
          ctx.drawImage(img, x, y, w, h);
        }
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
      if (!file.type.includes('png')) continue; // PNG only
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const id = nextId.current++;
          const aspect = img.naturalWidth / img.naturalHeight;
          // Use actual image size at 300 DPI
          let widthInches = parseFloat((img.naturalWidth / DPI).toFixed(2));
          let heightInches = parseFloat((img.naturalHeight / DPI).toFixed(2));
          // Cap to sheet width if wider
          if (widthInches > SHEET_WIDTH_INCHES - 1) {
            widthInches = SHEET_WIDTH_INCHES - 1;
            heightInches = parseFloat((widthInches / aspect).toFixed(2));
          }

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
      let widthInches = parseFloat((img.naturalWidth / DPI).toFixed(2));
      let heightInches = parseFloat((img.naturalHeight / DPI).toFixed(2));
      if (widthInches > SHEET_WIDTH_INCHES - 1) {
        widthInches = SHEET_WIDTH_INCHES - 1;
        heightInches = parseFloat((widthInches / aspect).toFixed(2));
      }

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

    // First, ensure all images are loaded and decoded
    const loadedImages = {};
    const uniqueUrls = [...new Set(layout.items.map(i => i.dataUrl))];
    
    await Promise.all(uniqueUrls.map(dataUrl => new Promise((resolve) => {
      const existing = imageCache.current[dataUrl];
      if (existing && existing.complete && existing.naturalWidth > 0) {
        loadedImages[dataUrl] = existing;
        resolve();
      } else {
        const img = new Image();
        img.onload = () => { loadedImages[dataUrl] = img; resolve(); };
        img.onerror = () => resolve();
        img.src = dataUrl;
      }
    })));

    const exportWidth = SHEET_WIDTH_INCHES * DPI;
    const totalHeightInches = layout.totalHeight;
    const totalHeightPx = Math.round(totalHeightInches * DPI);

    // Chrome supports up to ~32767px, Firefox similar. Use 30000 as safe single-canvas limit.
    const MAX_CANVAS_PX = 30000;

    if (totalHeightPx <= MAX_CANVAS_PX) {
      // Entire sheet fits in a single canvas — no splitting needed
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = exportWidth;
      exportCanvas.height = totalHeightPx;
      const ctx = exportCanvas.getContext('2d');
      if (!ctx) { alert('Canvas creation failed.'); return; }

      if (!bgTransparent) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, exportWidth, totalHeightPx);
      }

      for (const item of layout.items) {
        const img = loadedImages[item.dataUrl];
        if (!img) continue;
        const x = item.x * DPI;
        const y = item.y * DPI;
        const w = item.w * DPI;
        const h = item.h * DPI;

        if (item.rotated) {
          ctx.save();
          ctx.translate(x + w, y);
          ctx.rotate(Math.PI / 2);
          ctx.drawImage(img, 0, 0, h, w);
          ctx.restore();
        } else {
          ctx.drawImage(img, x, y, w, h);
        }

        if (showCutLines) {
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2;
          ctx.setLineDash([8, 6]);
          ctx.strokeRect(x, y, w, h);
          ctx.setLineDash([]);
        }
      }

      const filename = `gang-sheet-${SHEET_WIDTH_INCHES}x${totalHeightInches.toFixed(1)}-${DPI}dpi.png`;
      await triggerDownload(exportCanvas, filename);

    } else {
      // Sheet exceeds single canvas limit — split at row boundaries (never cut an item)
      // Find unique row Y positions (items on the same row share the same y)
      const rowBottoms = [];
      const itemsByRow = {};
      for (const item of layout.items) {
        const rowKey = item.y.toFixed(4);
        if (!itemsByRow[rowKey]) {
          itemsByRow[rowKey] = [];
        }
        itemsByRow[rowKey].push(item);
      }
      // Get sorted unique row starts and compute each row's bottom
      const rowKeys = Object.keys(itemsByRow).sort((a, b) => parseFloat(a) - parseFloat(b));
      const rows = rowKeys.map(key => {
        const items = itemsByRow[key];
        const y = parseFloat(key);
        const maxBottom = Math.max(...items.map(i => i.y + i.h));
        return { y, bottom: maxBottom, items };
      });

      // Group rows into pages that fit within MAX_CANVAS_PX
      const maxPageInches = MAX_CANVAS_PX / DPI;
      const pages = [];
      let pageRows = [];
      let pageStartInch = 0;

      for (const row of rows) {
        const rowBottom = row.bottom;
        const pageHeightIfAdded = rowBottom - pageStartInch;

        if (pageHeightIfAdded * DPI > MAX_CANVAS_PX && pageRows.length > 0) {
          // Start a new page
          const pageEnd = pageRows[pageRows.length - 1].bottom;
          pages.push({ start: pageStartInch, end: pageEnd, items: pageRows.flatMap(r => r.items) });
          pageStartInch = row.y;
          pageRows = [row];
        } else {
          pageRows.push(row);
        }
      }
      // Last page
      if (pageRows.length > 0) {
        const pageEnd = Math.max(pageRows[pageRows.length - 1].bottom, totalHeightInches);
        pages.push({ start: pageStartInch, end: pageEnd, items: pageRows.flatMap(r => r.items) });
      }

      for (let pi = 0; pi < pages.length; pi++) {
        const pg = pages[pi];
        const pageHeightInches = pg.end - pg.start;
        const pageHeightPx = Math.round(pageHeightInches * DPI);

        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = exportWidth;
        exportCanvas.height = pageHeightPx;
        const ctx = exportCanvas.getContext('2d');
        if (!ctx) continue;

        if (!bgTransparent) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, exportWidth, pageHeightPx);
        }

        for (const item of pg.items) {
          const img = loadedImages[item.dataUrl];
          if (!img) continue;
          const x = item.x * DPI;
          const y = (item.y - pg.start) * DPI;
          const w = item.w * DPI;
          const h = item.h * DPI;

          if (item.rotated) {
            ctx.save();
            ctx.translate(x + w, y);
            ctx.rotate(Math.PI / 2);
            ctx.drawImage(img, 0, 0, h, w);
            ctx.restore();
          } else {
            ctx.drawImage(img, x, y, w, h);
          }

          if (showCutLines) {
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 6]);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);
          }
        }

        const pageLabel = pages.length > 1 ? `-page${pi + 1}of${pages.length}` : '';
        const filename = `gang-sheet-${SHEET_WIDTH_INCHES}x${pageHeightInches.toFixed(1)}${pageLabel}-${DPI}dpi.png`;
        await triggerDownload(exportCanvas, filename);

        if (pi < pages.length - 1) {
          await new Promise(r => setTimeout(r, 600));
        }
      }
    }
  };

  const triggerDownload = (canvas, filename) => {
    return new Promise((resolve) => {
      try {
        canvas.toBlob((blob) => {
          if (blob && blob.size > 0) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = filename;
            link.href = url;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 2000);
            resolve();
          } else {
            // Fallback to toDataURL
            try {
              const dataUrl = canvas.toDataURL('image/png');
              const link = document.createElement('a');
              link.download = filename;
              link.href = dataUrl;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            } catch (err) {
              alert('Export failed. Try fewer repetitions.');
            }
            resolve();
          }
        }, 'image/png');
      } catch (err) {
        try {
          const dataUrl = canvas.toDataURL('image/png');
          const link = document.createElement('a');
          link.download = filename;
          link.href = dataUrl;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } catch (e) {
          alert('Export failed. Try fewer repetitions.');
        }
        resolve();
      }
    });
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
            accept=".png,image/png"
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
              <label>H Gap (horizontal)</label>
              <input
                type="number"
                step="0.05"
                min="0"
                max="2"
                value={hGap}
                onChange={(e) => setHGap(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="gs-setting-row">
              <label>V Gap (vertical)</label>
              <input
                type="number"
                step="0.05"
                min="0"
                max="2"
                value={vGap}
                onChange={(e) => setVGap(parseFloat(e.target.value) || 0)}
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
            <div className="gs-stat-row">
              <label>Pages</label>
              <span>{Math.ceil(layout.totalHeight / 200)} {layout.totalHeight > 200 ? '(auto-paginated at 200")' : ''}</span>
            </div>
          </div>

          <button className="gs-btn-recalc" onClick={() => {
            const newLayout = calculateLayout(artworks, SHEET_WIDTH_INCHES, hGap, vGap, margins, tightPack);
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
