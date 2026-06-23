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

  // TIGHT PACK: MaxRects with Bottom-Left scoring
  // Always fills the lowest available position first — minimizes sheet height
  items.sort((a, b) => (b.w * b.h) - (a.w * a.h)); // largest area first

  let freeRects = [{ x: marg.left, y: marg.top, w: availableWidth, h: 100000 }];
  const placed = [];
  let maxY = marg.top;

  for (const item of items) {
    let bestY = Infinity, bestX = Infinity;
    let bestW = item.w, bestH = item.h;
    let bestRotated = false;
    let bestFound = false;

    for (const rect of freeRects) {
      // Try normal orientation
      if (item.w <= rect.w + 0.001 && item.h <= rect.h + 0.001) {
        // Bottom-Left: prefer lowest Y, then leftmost X
        if (rect.y < bestY || (rect.y === bestY && rect.x < bestX)) {
          bestY = rect.y;
          bestX = rect.x;
          bestW = item.w;
          bestH = item.h;
          bestRotated = false;
          bestFound = true;
        }
      }
      // Try rotated orientation
      if (item.h <= rect.w + 0.001 && item.w <= rect.h + 0.001) {
        if (rect.y < bestY || (rect.y === bestY && rect.x < bestX)) {
          bestY = rect.y;
          bestX = rect.x;
          bestW = item.h;
          bestH = item.w;
          bestRotated = true;
          bestFound = true;
        }
      }
    }

    if (bestFound) {
      placed.push({ ...item, x: bestX, y: bestY, w: bestW, h: bestH, rotated: bestRotated });
      maxY = Math.max(maxY, bestY + bestH);

      // Split free rects around placed item (occupies bestW+hGap × bestH+vGap)
      const px = bestX, py = bestY;
      const pw = bestW + hGap, ph = bestH + vGap;

      const newFreeRects = [];
      for (const fr of freeRects) {
        // No overlap → keep as is
        if (px >= fr.x + fr.w || px + pw <= fr.x || py >= fr.y + fr.h || py + ph <= fr.y) {
          newFreeRects.push(fr);
          continue;
        }
        // Left portion
        if (px > fr.x)
          newFreeRects.push({ x: fr.x, y: fr.y, w: px - fr.x, h: fr.h });
        // Right portion
        if (px + pw < fr.x + fr.w)
          newFreeRects.push({ x: px + pw, y: fr.y, w: (fr.x + fr.w) - (px + pw), h: fr.h });
        // Top portion
        if (py > fr.y)
          newFreeRects.push({ x: fr.x, y: fr.y, w: fr.w, h: py - fr.y });
        // Bottom portion
        if (py + ph < fr.y + fr.h)
          newFreeRects.push({ x: fr.x, y: py + ph, w: fr.w, h: (fr.y + fr.h) - (py + ph) });
      }

      // Remove redundant (contained) rects
      freeRects = [];
      outer: for (let i = 0; i < newFreeRects.length; i++) {
        const a = newFreeRects[i];
        if (a.w < 0.25 || a.h < 0.25) continue;
        for (let j = 0; j < newFreeRects.length; j++) {
          if (i === j) continue;
          const b = newFreeRects[j];
          if (a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h) {
            continue outer;
          }
        }
        freeRects.push(a);
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
  const [zoom, setZoom] = useState(50);
  const [layout, setLayout] = useState({ items: [], totalHeight: 0 });
  const [detailsArtwork, setDetailsArtwork] = useState(null); // artwork being shown in details popup
  const COST_PER_FOOT = 5; // USD per linear foot

  // Order info for header strip
  const [poNumber, setPoNumber] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [orderLink, setOrderLink] = useState('');
  const [headerTopMargin, setHeaderTopMargin] = useState(0); // inches above header strip
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
    const scale = (containerWidth * Math.min(zoom, 100) / 100) / SHEET_WIDTH_INCHES;
    const headerH = Math.max(1 * scale, 40);
    const headerMarginTop = headerTopMargin * scale;
    const canvasWidth = SHEET_WIDTH_INCHES * scale;
    const canvasHeight = Math.max((layout.totalHeight) * scale + headerH + headerMarginTop, 200);

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const ctx = canvas.getContext('2d');

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // === HEADER STRIP (transparent bg, dark text, with thumbnails) ===
    const headerY = headerMarginTop;
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(2, headerY + 2, canvasWidth - 4, headerH - 4);

    const fs = Math.max(10, Math.round(headerH * 0.28));
    const fsSmall = Math.max(8, Math.round(headerH * 0.18));
    ctx.textAlign = 'left';
    ctx.fillStyle = '#666666';
    ctx.font = `500 ${fsSmall}px Arial`;
    ctx.fillText('PO#:', 8, headerY + headerH * 0.35);
    ctx.fillStyle = '#000000';
    ctx.font = `bold ${fs}px Arial`;
    ctx.fillText(poNumber || '—', 8 + fsSmall * 2.5, headerY + headerH * 0.35);
    ctx.fillStyle = '#666666';
    ctx.font = `500 ${fsSmall}px Arial`;
    ctx.fillText('ORDER#:', 8, headerY + headerH * 0.7);
    ctx.fillStyle = '#000000';
    ctx.font = `bold ${fs}px Arial`;
    ctx.fillText(orderNumber || '—', 8 + fsSmall * 5, headerY + headerH * 0.7);

    // Artwork thumbnails + info in header
    if (artworks.length > 0) {
      const thumbAreaX = canvasWidth * 0.28;
      const maxItems = Math.min(artworks.length, 4);
      const itemWidth = (canvasWidth * 0.45) / maxItems;
      const thumbSize = Math.max(8, Math.min(headerH - 16, 30));
      
      for (let i = 0; i < maxItems; i++) {
        const a = artworks[i];
        const ix = thumbAreaX + i * itemWidth;
        
        // Draw thumbnail
        const img = imageCache.current[a.dataUrl];
        if (img && img.complete) {
          const ty = headerY + (headerH - thumbSize) / 2;
          ctx.drawImage(img, ix, ty, thumbSize, thumbSize);
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(ix, ty, thumbSize, thumbSize);
        }
        
        // Size + qty text next to thumbnail
        ctx.fillStyle = '#000000';
        ctx.font = `500 ${fsSmall}px Arial`;
        ctx.textAlign = 'left';
        ctx.fillText(`${a.widthInches}"×${a.heightInches}" ×${a.repetitions}`, ix + thumbSize + 4, headerY + headerH * 0.55);
      }
    }

    // QR indicator in header
    if (orderLink) {
      const qrSize = Math.max(headerH - 12, 20);
      const qrX = canvasWidth - qrSize - 8;
      const qrY = headerY + (headerH - qrSize) / 2;
      // Draw mini QR pattern
      ctx.fillStyle = '#000000';
      const cells = 7;
      const cellSz = qrSize / cells;
      for (let r = 0; r < cells; r++) {
        for (let c = 0; c < cells; c++) {
          const isBorder = r === 0 || r === cells-1 || c === 0 || c === cells-1;
          const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          if (isBorder || isCenter) {
            ctx.fillRect(qrX + c * cellSz, qrY + r * cellSz, cellSz - 0.5, cellSz - 0.5);
          }
        }
      }
    }

    // === BACKGROUND FOR ARTWORK AREA ===
    if (bgTransparent) {
      const sz = 10;
      for (let y = Math.ceil(headerH + headerMarginTop); y < canvasHeight; y += sz) {
        for (let x = 0; x < canvasWidth; x += sz) {
          ctx.fillStyle = ((Math.floor(x / sz) + Math.floor(y / sz)) % 2 === 0) ? '#ffffff' : '#e2e8f0';
          ctx.fillRect(x, y, sz, sz);
        }
      }
    }

    // Grid lines
    if (showGrid) {
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= SHEET_WIDTH_INCHES; i++) {
        const x = i * scale;
        ctx.beginPath();
        ctx.moveTo(x, headerH + headerMarginTop);
        ctx.lineTo(x, canvasHeight);
        ctx.stroke();
      }
      const maxH = Math.ceil(layout.totalHeight) || 1;
      for (let i = 0; i <= maxH; i++) {
        const y = i * scale + headerH + headerMarginTop;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasWidth, y);
        ctx.stroke();
      }
    }

    // Draw artworks (offset by header + margin)
    for (const item of layout.items) {
      const x = item.x * scale;
      const y = item.y * scale + headerH + headerMarginTop;
      const w = item.w * scale;
      const h = item.h * scale;

      const img = imageCache.current[item.dataUrl];
      if (img && img.complete) {
        if (item.rotated) {
          ctx.save();
          ctx.translate(x + w, y);
          ctx.rotate(Math.PI / 2);
          ctx.drawImage(img, 0, 0, h, w);
          ctx.restore();
        } else {
          ctx.drawImage(img, x, y, w, h);
        }
      } else {
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#cbd5e1';
        ctx.strokeRect(x, y, w, h);
      }

      if (showCutLines) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
      }
    }

    // Border
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.strokeRect(0, 0, canvasWidth, canvasHeight);
  }, [layout, zoom, showGrid, showCutLines, bgTransparent, artworks, poNumber, orderNumber, orderLink, headerTopMargin]);

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
    if (layout.items.length === 0) {
      alert('No artworks to download. Please add artwork first.');
      return;
    }

    // Pre-load all images (from both layout items and artworks for thumbnails)
    const loadedImages = {};
    const allUrls = [
      ...new Set([
        ...layout.items.map(i => i.dataUrl),
        ...artworks.map(a => a.dataUrl),
      ])
    ];
    
    await Promise.all(allUrls.map(dataUrl => new Promise((resolve) => {
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
    const HEADER_HEIGHT = 1.2 * DPI; // 1.2 inch header for larger text
    const HEADER_MARGIN_TOP = headerTopMargin * DPI;
    const totalHeightPx = Math.round(layout.totalHeight * DPI) + HEADER_HEIGHT + HEADER_MARGIN_TOP;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = exportWidth;
    exportCanvas.height = totalHeightPx;
    const ctx = exportCanvas.getContext('2d');

    if (!ctx) {
      alert('Canvas creation failed. Your browser may not support this size.');
      return;
    }

    // Transparent background (PNG) — only fill white below header for artwork area
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, HEADER_HEIGHT + HEADER_MARGIN_TOP, exportWidth, totalHeightPx - HEADER_HEIGHT - HEADER_MARGIN_TOP);

    // === DRAW HEADER STRIP (no background, just border + text) ===
    const headerStartY = HEADER_MARGIN_TOP;
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, headerStartY + 6, exportWidth - 12, HEADER_HEIGHT - 12);

    const hPad = 40;
    const colPO = hPad;
    const colTable = exportWidth * 0.2;
    const colQR = exportWidth * 0.76;

    // PO Number — larger text
    ctx.fillStyle = '#555555';
    ctx.font = '500 28px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('PO#:', colPO, headerStartY + 60);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 48px Arial, sans-serif';
    ctx.fillText(poNumber || '—', colPO, headerStartY + 110);

    // Divider line
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(colPO, headerStartY + 135);
    ctx.lineTo(colTable - 30, headerStartY + 135);
    ctx.stroke();

    // Order Number — larger text
    ctx.fillStyle = '#555555';
    ctx.font = '500 28px Arial, sans-serif';
    ctx.fillText('ORDER#:', colPO, headerStartY + 175);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 48px Arial, sans-serif';
    ctx.fillText(orderNumber || '—', colPO, headerStartY + 225);

    // Artwork table header
    ctx.fillStyle = '#222222';
    ctx.font = 'bold 22px Arial, sans-serif';
    ctx.textAlign = 'center';
    const tColName = colTable + 100;
    const tColThumb = colTable + 280;
    const tColSize = colTable + 440;
    const tColQty = colTable + 580;
    ctx.fillText('ARTWORK NO.', tColName, headerStartY + 50);
    ctx.fillText('THUMB', tColThumb, headerStartY + 50);
    ctx.fillText('SIZE', tColSize, headerStartY + 50);
    ctx.fillText('QTY', tColQty, headerStartY + 50);

    // Table divider
    ctx.strokeStyle = '#888888';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(colTable, headerStartY + 62);
    ctx.lineTo(colQR - 30, headerStartY + 62);
    ctx.stroke();

    // Artwork rows
    const maxRows = Math.min(artworks.length, 4);
    const rowH = (HEADER_HEIGHT - 90) / Math.max(maxRows, 1);
    for (let i = 0; i < maxRows; i++) {
      const art = artworks[i];
      const rowY = headerStartY + 70 + i * rowH;

      // Artwork name
      ctx.fillStyle = '#000000';
      ctx.font = '500 22px Arial, sans-serif';
      ctx.textAlign = 'center';
      const name = art.filename.length > 14 ? art.filename.substring(0, 14) + '…' : art.filename;
      ctx.fillText(name, tColName, rowY + rowH / 2 + 7);

      // Thumbnail
      const thumbImg = loadedImages[art.dataUrl];
      if (thumbImg) {
        const thumbSize = Math.min(rowH - 14, 55);
        const thumbX = tColThumb - thumbSize / 2;
        const thumbY = rowY + (rowH - thumbSize) / 2;
        ctx.drawImage(thumbImg, thumbX, thumbY, thumbSize, thumbSize);
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 1;
        ctx.strokeRect(thumbX, thumbY, thumbSize, thumbSize);
      }

      // Size
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 24px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${art.widthInches}" x ${art.heightInches}"`, tColSize, rowY + rowH / 2 + 7);

      // Qty
      ctx.font = 'bold 28px Arial, sans-serif';
      ctx.fillText(`${art.repetitions}`, tColQty, rowY + rowH / 2 + 7);
    }

    // QR Code
    if (orderLink) {
      const qrSize = HEADER_HEIGHT - 80;
      const qrX = colQR;
      const qrY = headerStartY + 30;
      drawQRCode(ctx, orderLink, qrX, qrY, qrSize);
      ctx.fillStyle = '#444444';
      ctx.font = '500 18px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Scan for order details', qrX + qrSize / 2, headerStartY + HEADER_HEIGHT - 20);
    }

    // === DRAW GANG SHEET ITEMS (offset by header + margin) ===
    for (const item of layout.items) {
      const img = loadedImages[item.dataUrl];
      if (!img) continue;
      const x = item.x * DPI;
      const y = item.y * DPI + HEADER_HEIGHT + HEADER_MARGIN_TOP;
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

    const filename = `gang-sheet-${SHEET_WIDTH_INCHES}x${Math.ceil(layout.totalHeight + 1.2)}-${DPI}dpi.png`;

    // Download
    try {
      const blob = await new Promise((resolve, reject) => {
        exportCanvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error('toBlob returned null'));
        }, 'image/png');
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = filename;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      console.error('Blob export failed, trying dataURL:', err);
      try {
        const dataUrl = exportCanvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (e) {
        alert('Export failed: ' + e.message);
      }
    }
  };

  // Simple QR code generator (generates a basic QR-like pattern from text)
  function drawQRCode(ctx, text, x, y, size) {
    // Use a simple hash-based pattern for visual QR representation
    // For production, consider a proper QR library
    const modules = 21; // 21x21 grid
    const cellSize = size / modules;
    
    // Generate a deterministic pattern from the text
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash = hash & hash;
    }
    
    ctx.fillStyle = '#000000';
    
    // Fixed position patterns (corners)
    const drawFinder = (fx, fy) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
          const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          if (isBorder || isInner) {
            ctx.fillRect(x + (fx + c) * cellSize, y + (fy + r) * cellSize, cellSize, cellSize);
          }
        }
      }
    };
    
    drawFinder(0, 0); // top-left
    drawFinder(modules - 7, 0); // top-right
    drawFinder(0, modules - 7); // bottom-left
    
    // Data area — pseudo-random fill based on text hash
    let seed = Math.abs(hash);
    for (let r = 0; r < modules; r++) {
      for (let c = 0; c < modules; c++) {
        // Skip finder patterns
        if ((r < 8 && c < 8) || (r < 8 && c >= modules - 8) || (r >= modules - 8 && c < 8)) continue;
        
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        if (seed % 3 !== 0) {
          ctx.fillRect(x + c * cellSize, y + r * cellSize, cellSize, cellSize);
        }
      }
    }
  }

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
                  className="gs-artwork-info-btn"
                  onClick={() => setDetailsArtwork(detailsArtwork?.id === art.id ? null : art)}
                  title="View artwork details"
                >
                  ⓘ
                </button>
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
            <button className="gs-zoom-btn" onClick={() => setZoom((z) => Math.max(20, z - 10))}>−</button>
            <span className="gs-zoom-label">{zoom}%</span>
            <button className="gs-zoom-btn" onClick={() => setZoom((z) => Math.min(100, z + 10))}>+</button>
            <button className="gs-zoom-btn" onClick={() => setZoom(50)}>Fit</button>
          </div>
          <div className="gs-canvas-container">
            <canvas ref={canvasRef} />
          </div>
          {layout.totalHeight > 0 && (
            <div className="gs-height-indicator">
              Sheet: {SHEET_WIDTH_INCHES}" × {Math.ceil(layout.totalHeight)}" | {totalItemCount} item{totalItemCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Right Panel - Settings */}
        <div className="gs-right-panel">
          <div className="gs-settings-section">
            <h3>Order Info (Header Strip)</h3>
            <div className="gs-setting-row">
              <label>PO #</label>
              <input
                type="text"
                placeholder="PO-0425"
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                className="gs-text-input"
              />
            </div>
            <div className="gs-setting-row">
              <label>Order #</label>
              <input
                type="text"
                placeholder="ORD-1538"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                className="gs-text-input"
              />
            </div>
            <div className="gs-setting-row">
              <label>Order Link (QR)</label>
              <input
                type="text"
                placeholder="https://..."
                value={orderLink}
                onChange={(e) => setOrderLink(e.target.value)}
                className="gs-text-input"
              />
            </div>
            <div className="gs-setting-row">
              <label>Header Top Margin</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="5"
                value={headerTopMargin}
                onChange={(e) => setHeaderTopMargin(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

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
              <span className="highlight">{Math.ceil(layout.totalHeight)}"</span>
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
              <span>{SHEET_WIDTH_INCHES * DPI} × {Math.ceil(layout.totalHeight) * DPI} px ({SHEET_WIDTH_INCHES}" × {Math.ceil(layout.totalHeight)}")</span>
            </div>
          </div>

          {/* Cost Calculation */}
          {layout.totalHeight > 0 && (
            <div className="gs-cost-box">
              <div className="gs-cost-title">💰 Cost Estimate</div>
              <div className="gs-cost-row">
                <span>Sheet length</span>
                <span>{Math.ceil(layout.totalHeight)}" ({(Math.ceil(layout.totalHeight) / 12).toFixed(2)} ft)</span>
              </div>
              <div className="gs-cost-row">
                <span>Rate</span>
                <span>${COST_PER_FOOT.toFixed(2)} / linear ft</span>
              </div>
              <div className="gs-cost-divider" />
              <div className="gs-cost-row gs-cost-total">
                <span>Total</span>
                <span>${((Math.ceil(layout.totalHeight) / 12) * COST_PER_FOOT).toFixed(2)} USD</span>
              </div>
            </div>
          )}

          <button className="gs-btn-recalc" onClick={() => {
            const newLayout = calculateLayout(artworks, SHEET_WIDTH_INCHES, hGap, vGap, margins, tightPack);
            setLayout(newLayout);
          }}>
            ↻ Recalculate Layout
          </button>
        </div>
      </div>

      {/* Artwork Details Popup */}
      {detailsArtwork && (
        <div className="gs-details-overlay" onClick={() => setDetailsArtwork(null)}>
          <div className="gs-details-popup" onClick={(e) => e.stopPropagation()}>
            <div className="gs-details-header">
              <span>Artwork Details</span>
              <button className="gs-details-close" onClick={() => setDetailsArtwork(null)}>×</button>
            </div>
            <img src={detailsArtwork.dataUrl} alt={detailsArtwork.filename} className="gs-details-preview" />
            <div className="gs-details-body">
              <div className="gs-details-row">
                <label>Filename</label>
                <span title={detailsArtwork.filename}>{detailsArtwork.filename}</span>
              </div>
              <div className="gs-details-row">
                <label>Pixel Size</label>
                <span>{detailsArtwork.originalWidth} × {detailsArtwork.originalHeight} px</span>
              </div>
              <div className="gs-details-row">
                <label>Print Size</label>
                <span>{detailsArtwork.widthInches}" × {detailsArtwork.heightInches}"</span>
              </div>
              <div className="gs-details-row">
                <label>Aspect Ratio</label>
                <span>
                  {(() => {
                    const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
                    const w = detailsArtwork.originalWidth;
                    const h = detailsArtwork.originalHeight;
                    const d = gcd(w, h);
                    return `${w/d} : ${h/d}`;
                  })()}
                  {' '}({(detailsArtwork.originalWidth / detailsArtwork.originalHeight).toFixed(3)})
                </span>
              </div>
              <div className="gs-details-row">
                <label>DPI</label>
                <span>~{Math.round(detailsArtwork.originalWidth / detailsArtwork.widthInches)} DPI</span>
              </div>
              <div className="gs-details-row">
                <label>Repetitions</label>
                <span>{detailsArtwork.repetitions}×</span>
              </div>
              <div className="gs-details-row">
                <label>Area per item</label>
                <span>{(detailsArtwork.widthInches * detailsArtwork.heightInches / 144).toFixed(3)} sq ft</span>
              </div>
              <div className="gs-details-divider" />
              <div className="gs-details-row gs-details-cost">
                <label>Cost (all reps)</label>
                <span>
                  ${((detailsArtwork.heightInches * detailsArtwork.repetitions / 12) * COST_PER_FOOT).toFixed(2)} USD
                  <small> ({detailsArtwork.repetitions} × {(detailsArtwork.heightInches / 12).toFixed(2)} ft × ${COST_PER_FOOT}/ft)</small>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GangSheet;
