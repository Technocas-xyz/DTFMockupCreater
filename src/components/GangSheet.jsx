import React, { useState, useRef, useEffect, useCallback } from 'react';
import './GangSheet.css';
import { detectApiBase } from '../utils/apiConfig';

const SHEET_WIDTH_INCHES = 22;
const MAX_SHEET_HEIGHT = 108;
const DPI = 300;
const COST_PER_FOOT = 5;

// ═══════════════════════════════════════════════════════════════════════════════
// 2D RECTANGLE PACKING ENGINE (MaxRects BSSF/BAF)
// Objective: Minimize sheet height → minimize material waste
// Works in physical inches. Preview/export scale from this authoritative layout.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * MaxRects packing algorithm.
 * Places items into a fixed-width sheet, returns placed items and final height.
 * Uses Best Area Fit scoring: lowest Y, then tightest fit.
 */
function maxRectsPack(items, sheetWidth, hGap, vGap, margins, maxHeight, allowRotation = true) {
  const marg = margins || { top: 0, bottom: 0, left: 0, right: 0 };
  const usableW = sheetWidth - marg.left - marg.right;
  const usableH = (maxHeight || 9999) - marg.top - marg.bottom;

  // Initial free rectangle = entire usable area
  let freeRects = [{ x: marg.left, y: marg.top, w: usableW, h: usableH }];
  const placed = [];

  for (const item of items) {
    let bestScore = Infinity;
    let bestRect = null;
    let bestRotated = false;

    // Try placing in every free rectangle, both orientations
    for (const rect of freeRects) {
      // Normal orientation: can it fit?
      if (item.w <= rect.w + 0.001 && item.h <= rect.h + 0.001) {
        // Score: endY*10000 + x*10 + shortSideFit
        // This prioritizes: lowest bottom edge > leftmost > tightest fit
        const endY = rect.y + item.h;
        const shortSide = Math.min(rect.w - item.w, rect.h - item.h);
        const score = endY * 10000 + rect.x * 10 + shortSide;
        if (score < bestScore) {
          bestScore = score;
          bestRect = rect;
          bestRotated = false;
        }
      }
      // Rotated orientation (only if different and allowed)
      if (allowRotation && Math.abs(item.w - item.h) > 0.01) {
        if (item.h <= rect.w + 0.001 && item.w <= rect.h + 0.001) {
          const endY = rect.y + item.w;
          const shortSide = Math.min(rect.w - item.h, rect.h - item.w);
          const score = endY * 10000 + rect.x * 10 + shortSide;
          if (score < bestScore) {
            bestScore = score;
            bestRect = rect;
            bestRotated = true;
          }
        }
      }
    }

    if (!bestRect) continue; // Skip — try smaller items that might fit

    const pw = bestRotated ? item.h : item.w;
    const ph = bestRotated ? item.w : item.h;
    const px = bestRect.x;
    const py = bestRect.y;

    placed.push({ ...item, x: px, y: py, w: pw, h: ph, rotated: bestRotated });

    // Occupied region including gaps (gap goes AFTER the item, not before)
    const occW = pw + hGap;
    const occH = ph + vGap;

    // Split all free rects that overlap with the placed item
    const newFree = [];
    for (const fr of freeRects) {
      // No intersection → keep
      if (px >= fr.x + fr.w || px + occW <= fr.x || py >= fr.y + fr.h || py + occH <= fr.y) {
        newFree.push(fr);
        continue;
      }
      // Generate up to 4 remainders
      // Right of placed item
      if (px + occW < fr.x + fr.w) {
        newFree.push({ x: px + occW, y: fr.y, w: fr.x + fr.w - px - occW, h: fr.h });
      }
      // Left of placed item
      if (px > fr.x) {
        newFree.push({ x: fr.x, y: fr.y, w: px - fr.x, h: fr.h });
      }
      // Below placed item
      if (py + occH < fr.y + fr.h) {
        newFree.push({ x: fr.x, y: py + occH, w: fr.w, h: fr.y + fr.h - py - occH });
      }
      // Above placed item
      if (py > fr.y) {
        newFree.push({ x: fr.x, y: fr.y, w: fr.w, h: py - fr.y });
      }
    }

    // Prune: remove any free rect fully contained within another
    freeRects = [];
    for (let i = 0; i < newFree.length; i++) {
      const a = newFree[i];
      if (a.w < 0.1 || a.h < 0.1) continue;
      let contained = false;
      for (let j = 0; j < newFree.length; j++) {
        if (i === j) continue;
        const b = newFree[j];
        if (a.x >= b.x - 0.001 && a.y >= b.y - 0.001 &&
            a.x + a.w <= b.x + b.w + 0.001 && a.y + a.h <= b.y + b.h + 0.001) {
          contained = true;
          break;
        }
      }
      if (!contained) freeRects.push(a);
    }
    // Safety cap
    if (freeRects.length > 400) {
      freeRects.sort((a, b) => (b.w * b.h) - (a.w * a.h));
      freeRects = freeRects.slice(0, 200);
    }
  }

  // Calculate actual used height from placed items
  let maxBottom = marg.top;
  for (const p of placed) {
    const bottom = p.y + p.h;
    if (bottom > maxBottom) maxBottom = bottom;
  }
  const totalHeight = maxBottom + marg.bottom;

  return { placed, totalHeight };
}

/**
 * Main layout engine. Runs MaxRects with multiple sort orders, keeps best result.
 * Both tightPack ON and OFF use real 2D packing — tightPack ON adds rotation.
 */
function calculateLayout(artworks, sheetWidth, hGap, vGap, margins, tightPack = false) {
  const marg = margins || { top: 0, bottom: 0, left: 0, right: 0 };
  const allowRotation = tightPack; // Tight Pack enables rotation optimization

  // Step 1: Expand quantities into individual placement items
  const items = [];
  const dataUrlMap = {};
  for (const art of artworks) {
    dataUrlMap[art.id] = art.dataUrl;
    for (let i = 0; i < art.repetitions; i++) {
      items.push({ artworkId: art.id, w: art.widthInches, h: art.heightInches, qIdx: i });
    }
  }
  if (items.length === 0) return { sheets: [{ items: [], totalHeight: 0 }], totalSheets: 1 };

  const enrichItems = (placedItems) => placedItems.map(item => ({ ...item, dataUrl: dataUrlMap[item.artworkId] }));

  // Step 2: Define sort strategies (different item orderings to test)
  const sortStrategies = [
    (a, b) => (b.w * b.h) - (a.w * a.h),                    // Largest area
    (a, b) => b.h - a.h || b.w - a.w,                       // Tallest then widest
    (a, b) => b.w - a.w || b.h - a.h,                       // Widest then tallest
    (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h),      // Longest side
    (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h),      // Largest short side
    (a, b) => (b.w + b.h) - (a.w + a.h),                    // Largest perimeter
    (a, b) => (b.w / b.h) - (a.w / a.h),                    // Widest aspect ratio
    (a, b) => (a.w / a.h) - (b.w / b.h),                    // Tallest aspect ratio
    (a, b) => (b.w * b.h) - (a.w * a.h) || (b.w+b.h) - (a.w+a.h), // Area then perimeter
    (a, b) => b.h - a.h || (b.w * b.h) - (a.w * a.h),      // Height then area
  ];

  // Step 3: Try all sort strategies, pack into sheets, keep best global result
  let bestLayout = null;
  let bestTotalHeight = Infinity;

  for (const sortFn of sortStrategies) {
    const sortedItems = [...items].sort(sortFn);
    const sheets = [];
    let remaining = [...sortedItems];

    while (remaining.length > 0) {
      if (sheets.length >= 50) break; // safety

      const result = maxRectsPack(remaining, sheetWidth, hGap, vGap, marg, MAX_SHEET_HEIGHT, allowRotation);

      if (result.placed.length === 0) {
        // Force-place one oversized item
        const forced = remaining.shift();
        sheets.push({
          items: [{ ...forced, x: marg.left, y: marg.top, rotated: false }],
          totalHeight: forced.h + marg.top + marg.bottom,
        });
        continue;
      }

      sheets.push({ items: result.placed, totalHeight: result.totalHeight });

      // Remove placed items from remaining (handle rotation: match by artworkId + original dims)
      const placedCounts = new Map();
      for (const p of result.placed) {
        const origW = p.rotated ? p.h : p.w;
        const origH = p.rotated ? p.w : p.h;
        const key = `${p.artworkId}_${origW}_${origH}`;
        placedCounts.set(key, (placedCounts.get(key) || 0) + 1);
      }
      const nextRemaining = [];
      for (const item of remaining) {
        const key = `${item.artworkId}_${item.w}_${item.h}`;
        const count = placedCounts.get(key) || 0;
        if (count > 0) {
          placedCounts.set(key, count - 1);
        } else {
          nextRemaining.push(item);
        }
      }
      remaining = nextRemaining;
    }

    // Evaluate this layout: total height across all sheets
    const totalH = sheets.reduce((sum, s) => sum + s.totalHeight, 0);
    if (totalH < bestTotalHeight) {
      bestTotalHeight = totalH;
      bestLayout = sheets;
    }
  }

  if (!bestLayout || bestLayout.length === 0) {
    return { sheets: [{ items: [], totalHeight: 0 }], totalSheets: 1 };
  }

  return {
    sheets: bestLayout.map(s => ({ ...s, items: enrichItems(s.items) })),
    totalSheets: bestLayout.length,
  };
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────
function GangSheet({ sharedArtwork, onRegisterExport }) {
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
  const [layoutData, setLayoutData] = useState({ sheets: [{ items: [], totalHeight: 0 }], totalSheets: 1 });
  const [activeSheet, setActiveSheet] = useState(0);
  const [detailsArtwork, setDetailsArtwork] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [integrationLoading, setIntegrationLoading] = useState(false);
  const [integrationMessage, setIntegrationMessage] = useState('');
  const [savingSheet, setSavingSheet] = useState(false);

  // Order info
  const [poNumber, setPoNumber] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [orderLink, setOrderLink] = useState('');
  const [headerTopMargin, setHeaderTopMargin] = useState(0);
  const [includeHeader, setIncludeHeader] = useState(true);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageCache = useRef({});
  const nextId = useRef(1);

  // Current sheet data
  const currentSheet = layoutData.sheets[activeSheet] || { items: [], totalHeight: 0 };
  const totalItemCount = artworks.reduce((sum, a) => sum + a.repetitions, 0);
  const selectedCustomer = customers.find((customer) => String(customer.id) === selectedCustomerId);
  const visibleCustomers = customers.filter((customer) => `${customer.name} ${customer.email || ''} ${customer.orders.map(o => o.order_number).join(' ')}`.toLowerCase().includes(customerSearch.toLowerCase()));

  const apiHeaders = () => ({ 'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}` });

  const refreshCustomers = useCallback(async () => {
    try {
      const base = await detectApiBase();
      const response = await fetch(`${base}/production-orders.php`, { headers: apiHeaders() });
      if (!response.ok) throw new Error('Could not load DTF customers');
      const data = await response.json();
      setCustomers(data.customers || []);
    } catch (error) { setIntegrationMessage(error.message); }
  }, []);

  useEffect(() => {
    refreshCustomers();
    const timer = window.setInterval(refreshCustomers, 15000);
    return () => window.clearInterval(timer);
  }, [refreshCustomers]);

  const loadProductionOrder = async (orderId) => {
    if (!orderId) return;
    setIntegrationLoading(true); setIntegrationMessage('Loading sales order and artworks...');
    try {
      const base = await detectApiBase();
      const response = await fetch(`${base}/production-orders.php?order_id=${encodeURIComponent(orderId)}`, { headers: apiHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load sales order');
      const imported = [];
      for (const [idx, item] of (data.items || []).entries()) {
        if (!item.has_image) continue;
        const imageResponse = await fetch(`${base}/artwork-image.php?item_id=${encodeURIComponent(item.order_item_id)}`, { headers: apiHeaders() });
        if (!imageResponse.ok) continue;
        const blob = await imageResponse.blob();
        const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
        const img = await new Promise((resolve, reject) => { const value = new Image(); value.onload = () => resolve(value); value.onerror = reject; value.src = dataUrl; });
        const sizeMatch = String(item.size || '').match(/([\d.]+)\s*(?:"|in)?\s*[x×]\s*([\d.]+)/i);
        const aspect = img.naturalWidth / img.naturalHeight;
        let widthInches = Number(item.width_inches) || Number(sizeMatch?.[1]) || Math.min(SHEET_WIDTH_INCHES - 1, img.naturalWidth / DPI);
        let heightInches = Number(item.height_inches) || Number(sizeMatch?.[2]) || (widthInches / aspect);
        if (widthInches > SHEET_WIDTH_INCHES) { widthInches = SHEET_WIDTH_INCHES - 1; heightInches = widthInches / aspect; }
        imported.push({ id: nextId.current++, filename: item.stored_name || item.artwork_name || item.artwork_no || `Artwork ${idx + 1}`, artworkNo: item.artwork_no || item.stored_artwork_no || `AW-${idx + 1}`, orderItemId: item.order_item_id, artworkId: item.artwork_id, dataUrl, originalWidth: img.naturalWidth, originalHeight: img.naturalHeight, widthInches: Number(widthInches.toFixed(2)), heightInches: Number(heightInches.toFixed(2)), aspect, repetitions: Math.max(1, Number(item.artwork_qty) || 1) });
      }
      setSelectedOrder(data.order); setArtworks(imported); setOrderNumber(data.order.order_number || ''); setPoNumber(data.order.po_number || ''); setOrderLink(`https://printshop.decoinkssuite.com/orders/${data.order.id}`);
      setIntegrationMessage(imported.length ? `${imported.length} artwork(s) imported from ${data.order.order_number}.` : 'Order loaded, but no artwork image or print size is available for this order.');
    } catch (error) { setIntegrationMessage(error.message); }
    finally { setIntegrationLoading(false); }
  };

  const saveGangSheet = async () => {
    if (!selectedOrder?.id || artworks.length === 0) { setIntegrationMessage('Select a DTF sales order with artwork before saving a gang sheet.'); return; }
    setSavingSheet(true);
    try {
      const base = await detectApiBase();
      const payload = { order_id: selectedOrder.id, total_height: totalHeight, total_sheets: layoutData.totalSheets, total_quantity: totalItemCount, estimated_price: (Math.ceil(totalHeight) / 12) * COST_PER_FOOT,
        settings: { hGap, vGap, margins, arrangement, tightPack, showCutLines, includeHeader, headerTopMargin },
        artworks: artworks.map(a => ({ orderItemId:a.orderItemId,artworkId:a.artworkId,artworkNo:a.artworkNo,filename:a.filename,widthInches:a.widthInches,heightInches:a.heightInches,repetitions:a.repetitions })),
        layout: {
          sheets: layoutData.sheets.map(sheet => ({
            totalHeight: sheet.totalHeight,
            items: sheet.items.map(({ dataUrl, ...item }) => item),
          })),
        },
      };
      const response = await fetch(`${base}/production-orders.php`, { method:'POST', headers:{...apiHeaders(),'Content-Type':'application/json'}, body:JSON.stringify(payload) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Save failed');
      setIntegrationMessage(`Gang sheet saved successfully (${data.saved_at}).`);
    } catch (error) { setIntegrationMessage(error.message); }
    finally { setSavingSheet(false); }
  };

  // Recalculate layout when artworks or settings change
  // Recalculate layout when artworks or settings change (500ms debounce to prevent freezing)
  useEffect(() => {
    if (artworks.length === 0) {
      setLayoutData({ sheets: [{ items: [], totalHeight: 0 }], totalSheets: 1 });
      return;
    }
    const timer = setTimeout(() => {
      try {
        const newLayout = calculateLayout(artworks, SHEET_WIDTH_INCHES, hGap, vGap, margins, tightPack);
        setLayoutData(newLayout);
        if (activeSheet >= newLayout.totalSheets) setActiveSheet(0);
      } catch(e) { console.error('Layout calc error:', e); }
    }, 500);
    return () => clearTimeout(timer);
  }, [artworks, hGap, vGap, margins, tightPack]);

  // Draw canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const containerWidth = canvas.parentElement?.clientWidth - 40 || 600;
    const scale = (containerWidth * Math.min(zoom, 100) / 100) / SHEET_WIDTH_INCHES;
    const headerH = includeHeader ? Math.max(1 * scale, 40) : 0;
    const headerMarginTop = includeHeader ? headerTopMargin * scale : 0;
    const canvasWidth = SHEET_WIDTH_INCHES * scale;
    const sheetHeight = currentSheet.totalHeight || 1;
    const canvasHeight = Math.max(sheetHeight * scale + headerH + headerMarginTop, 200);

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // === HEADER STRIP (only if enabled) ===
    if (includeHeader) {
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

    // Artwork thumbnails in header
    if (artworks.length > 0) {
      const thumbAreaX = canvasWidth * 0.28;
      const maxItems = Math.min(artworks.length, 4);
      const itemWidth = (canvasWidth * 0.45) / maxItems;
      const thumbSize = Math.max(8, Math.min(headerH - 16, 30));
      for (let i = 0; i < maxItems; i++) {
        const a = artworks[i];
        const ix = thumbAreaX + i * itemWidth;
        const img = imageCache.current[a.dataUrl];
        if (img && img.complete) {
          const ty = headerY + (headerH - thumbSize) / 2;
          ctx.drawImage(img, ix, ty, thumbSize, thumbSize);
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(ix, ty, thumbSize, thumbSize);
        }
        ctx.fillStyle = '#000000';
        ctx.font = `500 ${fsSmall}px Arial`;
        ctx.textAlign = 'left';
        ctx.fillText(`${a.widthInches}"×${a.heightInches}" ×${a.repetitions}`, ix + thumbSize + 4, headerY + headerH * 0.55);
      }
    }

    // QR in header
    if (orderLink) {
      const qrSize = Math.max(headerH - 12, 20);
      const qrX = canvasWidth - qrSize - 8;
      const qrY = headerY + (headerH - qrSize) / 2;
      ctx.fillStyle = '#000000';
      const cells = 7;
      const cellSz = qrSize / cells;
      for (let r = 0; r < cells; r++) {
        for (let c = 0; c < cells; c++) {
          const isBorder = r === 0 || r === cells - 1 || c === 0 || c === cells - 1;
          const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          if (isBorder || isCenter) {
            ctx.fillRect(qrX + c * cellSz, qrY + r * cellSz, cellSz - 0.5, cellSz - 0.5);
          }
        }
      }
    }

    // Sheet number indicator for multi-sheet
    if (layoutData.totalSheets > 1) {
      ctx.fillStyle = '#2563eb';
      ctx.font = `bold ${fsSmall + 2}px Arial`;
      ctx.textAlign = 'right';
      ctx.fillText(`Sheet ${activeSheet + 1} of ${layoutData.totalSheets}`, canvasWidth - 10, headerY + headerH * 0.35);
    }

    } // end includeHeader preview

    // === BACKGROUND ===
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
        ctx.beginPath(); ctx.moveTo(x, headerH + headerMarginTop); ctx.lineTo(x, canvasHeight); ctx.stroke();
      }
      const maxH = Math.ceil(sheetHeight) || 1;
      for (let i = 0; i <= maxH; i++) {
        const y = i * scale + headerH + headerMarginTop;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvasWidth, y); ctx.stroke();
      }
    }

    // Draw artworks
    for (const item of currentSheet.items) {
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
  }, [currentSheet, zoom, showGrid, showCutLines, bgTransparent, poNumber, orderNumber, orderLink, headerTopMargin, layoutData, activeSheet, includeHeader]);

  // Load images into cache (separate from draw cycle to avoid cascade)
  useEffect(() => {
    for (const art of artworks) {
      if (!imageCache.current[art.dataUrl]) {
        const img = new Image();
        const url = art.dataUrl;
        img.onload = () => { imageCache.current[url] = img; drawCanvas(); };
        img.src = url;
      }
    }
  }, [artworks]); // eslint-disable-line — intentionally exclude drawCanvas to avoid loop

  useEffect(() => { drawCanvas(); }, [drawCanvas]);

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
      // Use object URL instead of base64 to avoid 20MB strings in memory
      const objectUrl = URL.createObjectURL(file);
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
        // Cache the image immediately
        imageCache.current[objectUrl] = img;
        setArtworks((prev) => [...prev, {
          id, filename: file.name, dataUrl: objectUrl,
          originalWidth: img.naturalWidth, originalHeight: img.naturalHeight,
          widthInches, heightInches, aspect, repetitions: 1,
        }]);
      };
      img.src = objectUrl;
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
      setArtworks((prev) => [...prev, {
        id, filename: sharedArtwork.filename || 'shared-artwork.png',
        dataUrl: sharedArtwork.dataUrl, originalWidth: img.naturalWidth,
        originalHeight: img.naturalHeight, widthInches, heightInches, aspect, repetitions: 1,
      }]);
    };
    img.src = sharedArtwork.dataUrl;
  };

  const updateArtwork = (id, field, value) => {
    setArtworks((prev) => prev.map((art) => {
      if (art.id !== id) return art;
      const updated = { ...art };
      if (field === 'widthInches') {
        updated.widthInches = parseFloat(value) || 0;
        updated.heightInches = parseFloat((updated.widthInches / art.aspect).toFixed(2));
      } else if (field === 'heightInches') {
        updated.heightInches = parseFloat(value) || 0;
        updated.widthInches = parseFloat((updated.heightInches * art.aspect).toFixed(2));
      } else if (field === 'repetitions') {
        updated.repetitions = Math.max(1, parseInt(value) || 1);
      }
      return updated;
    }));
  };

  const removeArtwork = (id) => { setArtworks((prev) => prev.filter((a) => a.id !== id)); };

  // ─── EXPORT: Render a single sheet to a production-quality canvas ──────────
  const renderSheetCanvas = async (sheetData, sheetIndex) => {
    // Pre-load all images
    const loadedImages = {};
    const allUrls = [...new Set([...sheetData.items.map(i => i.dataUrl), ...artworks.map(a => a.dataUrl)])];
    await Promise.all(allUrls.map(dataUrl => new Promise((resolve) => {
      const existing = imageCache.current[dataUrl];
      if (existing && existing.complete && existing.naturalWidth > 0) {
        loadedImages[dataUrl] = existing; resolve();
      } else {
        const img = new Image();
        img.onload = () => { loadedImages[dataUrl] = img; resolve(); };
        img.onerror = () => resolve();
        img.src = dataUrl;
      }
    })));

    const exportWidth = SHEET_WIDTH_INCHES * DPI;
    const HEADER_HEIGHT = includeHeader ? Math.round(1.2 * DPI) : 0;
    const HEADER_MARGIN_TOP = includeHeader ? Math.round(headerTopMargin * DPI) : 0;
    const sheetContentHeight = Math.round(sheetData.totalHeight * DPI);
    const totalHeightPx = sheetContentHeight + HEADER_HEIGHT + HEADER_MARGIN_TOP;

    // ═══ VALIDATION: Ensure dimensions match expected print size ═══
    const expectedW = exportWidth;
    const expectedH = totalHeightPx;
    console.log(`[GangSheet Export] Sheet ${sheetIndex+1}: ${expectedW}×${expectedH}px (${SHEET_WIDTH_INCHES}"×${(totalHeightPx/DPI).toFixed(1)}" at ${DPI}DPI)`);

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = expectedW;
    exportCanvas.height = expectedH;
    const ctx = exportCanvas.getContext('2d');

    // Validate canvas was actually created at correct size
    if (!ctx || exportCanvas.width !== expectedW || exportCanvas.height !== expectedH) {
      alert(`Export resolution mismatch detected.\nExpected: ${expectedW}×${expectedH}\nGot: ${exportCanvas.width}×${exportCanvas.height}\n\nThe image may be too large for your browser. Try reducing sheet height.`);
      return null;
    }

    // Fully transparent background for DTF printing (no white BG)
    ctx.clearRect(0, 0, exportWidth, totalHeightPx);

    // === DRAW HEADER STRIP (only if includeHeader is enabled) ===
    if (includeHeader) {
    const headerStartY = HEADER_MARGIN_TOP;
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, headerStartY + 6, exportWidth - 12, HEADER_HEIGHT - 12);

    const hPad = 40;
    const colPO = hPad;
    const colTable = exportWidth * 0.2;
    const colQR = exportWidth * 0.76;

    ctx.fillStyle = '#555555';
    ctx.font = '500 28px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('PO#:', colPO, headerStartY + 60);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 48px Arial, sans-serif';
    ctx.fillText(poNumber || '—', colPO, headerStartY + 110);
    ctx.strokeStyle = '#cccccc'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(colPO, headerStartY + 135); ctx.lineTo(colTable - 30, headerStartY + 135); ctx.stroke();
    ctx.fillStyle = '#555555';
    ctx.font = '500 28px Arial, sans-serif';
    ctx.fillText('ORDER#:', colPO, headerStartY + 175);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 48px Arial, sans-serif';
    ctx.fillText(orderNumber || '—', colPO, headerStartY + 225);

    // Sheet number
    if (layoutData.totalSheets > 1) {
      ctx.fillStyle = '#2563eb';
      ctx.font = 'bold 36px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Sheet ${sheetIndex + 1} of ${layoutData.totalSheets}`, colPO, headerStartY + HEADER_HEIGHT - 30);
    }

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
    ctx.strokeStyle = '#888888'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(colTable, headerStartY + 62); ctx.lineTo(colQR - 30, headerStartY + 62); ctx.stroke();

    const maxRows = Math.min(artworks.length, 4);
    const rowH = (HEADER_HEIGHT - 90) / Math.max(maxRows, 1);
    for (let i = 0; i < maxRows; i++) {
      const art = artworks[i];
      const rowY = headerStartY + 70 + i * rowH;
      ctx.fillStyle = '#000000';
      ctx.font = '500 22px Arial, sans-serif';
      ctx.textAlign = 'center';
      const name = art.filename.length > 14 ? art.filename.substring(0, 14) + '…' : art.filename;
      ctx.fillText(name, tColName, rowY + rowH / 2 + 7);
      const thumbImg = loadedImages[art.dataUrl];
      if (thumbImg) {
        const thumbSize = Math.min(rowH - 14, 55);
        const thumbX = tColThumb - thumbSize / 2;
        const thumbY = rowY + (rowH - thumbSize) / 2;
        ctx.drawImage(thumbImg, thumbX, thumbY, thumbSize, thumbSize);
        ctx.strokeStyle = '#cccccc'; ctx.lineWidth = 1;
        ctx.strokeRect(thumbX, thumbY, thumbSize, thumbSize);
      }
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 24px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${art.widthInches}" x ${art.heightInches}"`, tColSize, rowY + rowH / 2 + 7);
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

    } // end includeHeader

    // === DRAW GANG SHEET ITEMS ===
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    for (const item of sheetData.items) {
      const img = loadedImages[item.dataUrl];
      if (!img) continue;
      const x = Math.round(item.x * DPI);
      const y = Math.round(item.y * DPI) + HEADER_HEIGHT + HEADER_MARGIN_TOP;
      const w = Math.round(item.w * DPI);
      const h = Math.round(item.h * DPI);
      if (item.rotated) {
        ctx.save();
        ctx.translate(x + w, y);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, h, w);
        ctx.restore();
      } else {
        ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, x, y, w, h);
      }
    }

    return exportCanvas;
  };

  // ─── DOWNLOAD HANDLER ─────────────────────────────────────────────────────
  // Embeds DPI metadata (pHYs chunk) into PNG for RIP software compatibility
  const embedDpiInPng = (blob, dpi) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const buffer = new Uint8Array(reader.result);
        // PNG pHYs chunk: pixels per meter = dpi * 39.3701
        const ppm = Math.round(dpi * 39.3701);
        // Create pHYs chunk: 4 bytes X ppm + 4 bytes Y ppm + 1 byte unit(1=meter)
        const phys = new Uint8Array(25);
        const dv = new DataView(phys.buffer);
        dv.setUint32(0, 9); // chunk data length
        phys[4] = 0x70; phys[5] = 0x48; phys[6] = 0x59; phys[7] = 0x73; // "pHYs"
        dv.setUint32(8, ppm); // X pixels per unit
        dv.setUint32(12, ppm); // Y pixels per unit
        phys[16] = 1; // unit = meter
        // CRC32 of type+data
        const crcData = phys.slice(4, 17);
        const crc = crc32(crcData);
        dv.setUint32(17, crc);
        // Find IHDR end (always at byte 8 + 4+4+13+4 = 33)
        // Insert pHYs after IHDR chunk (position 33)
        const ihdrEnd = 8 + 25; // PNG sig(8) + IHDR chunk(25)
        const result = new Uint8Array(buffer.length + 21);
        result.set(buffer.slice(0, ihdrEnd), 0);
        result.set(phys, ihdrEnd);
        result.set(buffer.slice(ihdrEnd), ihdrEnd + 21);
        resolve(new Blob([result], { type: 'image/png' }));
      };
      reader.readAsArrayBuffer(blob);
    });
  };

  // CRC32 for PNG chunks
  const crc32 = (data) => {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
      }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  };

  // Hand the parent the print-ready sheets on demand, so "Save GS" stores the
  // exact same PNGs (300 DPI metadata and all) that Download produces. Each
  // sheet is saved as its own version rather than being flattened together.
  useEffect(() => {
    if (!onRegisterExport) return undefined;
    onRegisterExport(async () => {
      const blobs = [];
      for (let i = 0; i < layoutData.totalSheets; i++) {
        const sheet = layoutData.sheets[i];
        if (!sheet || sheet.items.length === 0) continue;
        const canvas = await renderSheetCanvas(sheet, i);
        if (!canvas) continue;
        let blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (blob) blobs.push(await embedDpiInPng(blob, DPI));
      }
      return blobs;
    });
    return () => onRegisterExport(null);
  }, [onRegisterExport, layoutData, includeHeader, headerTopMargin, DPI]);

  const handleDownload = async () => {
    if (layoutData.sheets.every(s => s.items.length === 0)) {
      alert('No artworks to download. Please add artwork first.');
      return;
    }
    setIsExporting(true);
    try {
      for (let i = 0; i < layoutData.totalSheets; i++) {
        const sheet = layoutData.sheets[i];
        if (sheet.items.length === 0) continue;
        const canvas = await renderSheetCanvas(sheet, i);
        if (!canvas) continue;
        const sheetH = Math.ceil(sheet.totalHeight + (includeHeader ? 1.2 + headerTopMargin : 0));
        const suffix = layoutData.totalSheets > 1 ? `-${i + 1}` : '';
        const filename = `GangSheet${suffix}-${SHEET_WIDTH_INCHES}x${sheetH}-${DPI}dpi.png`;
        try {
          let blob = await new Promise((resolve, reject) => {
            canvas.toBlob((b) => { if (b) resolve(b); else reject(new Error('toBlob null')); }, 'image/png');
          });
          // Embed 300 DPI metadata for RIP software
          blob = await embedDpiInPng(blob, DPI);
          // Validate size
          console.log(`[GangSheet Export] File: ${filename}, Size: ${(blob.size/1024/1024).toFixed(1)}MB, Canvas: ${canvas.width}×${canvas.height}`);
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = filename;
          link.href = url;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        } catch (err) {
          console.error('Blob export failed:', err);
          const dataUrl = canvas.toDataURL('image/png');
          const link = document.createElement('a');
          link.download = filename;
          link.href = dataUrl;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
        // Small delay between multiple sheet downloads
        if (layoutData.totalSheets > 1 && i < layoutData.totalSheets - 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
    } catch (err) {
      alert('Export failed: ' + err.message);
    }
    setIsExporting(false);
  };

  // QR code drawing helper
  function drawQRCode(ctx, text, x, y, size) {
    const modules = 21;
    const cellSize = size / modules;
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash = hash & hash;
    }
    ctx.fillStyle = '#000000';
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
    drawFinder(0, 0);
    drawFinder(modules - 7, 0);
    drawFinder(0, modules - 7);
    let seed = Math.abs(hash);
    for (let r = 0; r < modules; r++) {
      for (let c = 0; c < modules; c++) {
        if ((r < 8 && c < 8) || (r < 8 && c >= modules - 8) || (r >= modules - 8 && c < 8)) continue;
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        if (seed % 3 !== 0) {
          ctx.fillRect(x + c * cellSize, y + r * cellSize, cellSize, cellSize);
        }
      }
    }
  }

  // ─── STATS ───────────────────────────────────────────────────────────────────
  const totalHeight = layoutData.sheets.reduce((sum, s) => sum + s.totalHeight, 0);
  const utilizationPct = totalItemCount > 0 ? (
    (layoutData.sheets.reduce((sum, s) => sum + s.items.reduce((a, i) => a + i.w * i.h, 0), 0) /
    (SHEET_WIDTH_INCHES * totalHeight)) * 100
  ).toFixed(1) : 0;

  return (
    <div className="gang-sheet">
      <div className="gang-sheet-header">
        <div className="gang-sheet-header-left">
          <h1>Gang Sheet Generator</h1>
          <p>Arrange artworks on a {SHEET_WIDTH_INCHES}" wide roll for DTF printing</p>
        </div>
        <div className="gang-sheet-header-actions">
          <button className="gs-btn-save" onClick={saveGangSheet} disabled={!selectedOrder || artworks.length === 0 || savingSheet}>{savingSheet ? 'Saving...' : 'Save Gang Sheet'}</button>
          <button className="gs-btn-download" onClick={handleDownload}
            disabled={currentSheet.items.length === 0 || isExporting}>
            {isExporting ? 'Exporting...' : layoutData.totalSheets > 1
              ? `Download All (${layoutData.totalSheets} Sheets)` : 'Download Gang Sheet'}
          </button>
          <button className="gs-btn-pdf" onClick={() => alert('PDF export coming soon!')}>
            Export PDF
          </button>
        </div>
      </div>

      <div className="gang-sheet-body">
        {/* Left Panel */}
        <div className="gs-left-panel">
          <div className="gs-order-import">
            <div className="gs-order-import-title"><span>Decoinks DTF Customers</span><button onClick={refreshCustomers} title="Refresh now">↻</button></div>
            <input className="gs-customer-search" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="Search customer or order..." />
            <select className="gs-customer-select" value={selectedCustomerId} onChange={e => { const id=e.target.value; setSelectedCustomerId(id); const customer=customers.find(c=>String(c.id)===id); const orderId=customer?.orders?.[0]?.id || ''; setSelectedOrderId(orderId); if(orderId) loadProductionOrder(orderId); }}>
              <option value="">Select DTF customer</option>{visibleCustomers.map(customer => <option key={customer.id} value={customer.id}>{customer.name} ({customer.orders.length})</option>)}
            </select>
            {selectedCustomer && <select className="gs-customer-select" value={selectedOrderId} onChange={e => { setSelectedOrderId(e.target.value); loadProductionOrder(e.target.value); }}><option value="">Select sales order</option>{selectedCustomer.orders.map(order => <option key={order.id} value={order.id}>{order.order_number} · {order.status} · ${Number(order.total).toFixed(2)}</option>)}</select>}
            {selectedOrder && <div className="gs-order-summary"><strong>{selectedOrder.order_number}</strong><span>{selectedOrder.customer_name}</span><span>{selectedOrder.customer_email || 'No email'} · {selectedOrder.customer_phone || 'No phone'}</span><span>Order total: ${Number(selectedOrder.total || 0).toFixed(2)} · Status: {selectedOrder.status}</span></div>}
            {integrationMessage && <div className={`gs-integration-message ${integrationLoading ? 'loading' : ''}`}>{integrationMessage}</div>}
          </div>
          <div className="gs-add-buttons">
            <button className="gs-btn-add primary" onClick={() => fileInputRef.current?.click()}>
              + Add Artwork
            </button>
            <button className="gs-btn-add" onClick={handleUsePrevious}
              disabled={!sharedArtwork?.dataUrl}
              title={sharedArtwork?.dataUrl ? 'Load artwork from BG Remover / QA' : 'No shared artwork available'}>
              Use Previous
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept=".png,image/png" multiple
            style={{ display: 'none' }} onChange={handleFileSelect} />

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
                  <div className="gs-artwork-dims">{art.originalWidth} × {art.originalHeight} px</div>
                  <div className="gs-artwork-controls">
                    <div className="gs-input-group">
                      <label>W</label>
                      <input type="number" step="0.1" min="0.5" max={SHEET_WIDTH_INCHES}
                        value={art.widthInches}
                        onChange={(e) => updateArtwork(art.id, 'widthInches', e.target.value)} />
                      <span>"</span>
                    </div>
                    <div className="gs-input-group">
                      <label>H</label>
                      <input type="number" step="0.1" min="0.5" max="108"
                        value={art.heightInches}
                        onChange={(e) => updateArtwork(art.id, 'heightInches', e.target.value)} />
                      <span>"</span>
                    </div>
                    <div className="gs-input-group">
                      <label>×</label>
                      <input type="number" min="1" value={art.repetitions}
                        onChange={(e) => updateArtwork(art.id, 'repetitions', e.target.value)} />
                    </div>
                  </div>
                </div>
                <button className="gs-artwork-info-btn"
                  onClick={() => setDetailsArtwork(detailsArtwork?.id === art.id ? null : art)}
                  title="View artwork details">ⓘ</button>
                <button className="gs-artwork-delete" onClick={() => removeArtwork(art.id)}
                  title="Remove artwork">×</button>
              </div>
            ))}
          </div>
          {artworks.length > 0 && (
            <div className="gs-total-count">
              {artworks.length} artwork{artworks.length !== 1 ? 's' : ''} · {totalItemCount} total item{totalItemCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Center Panel - Canvas */}
        <div className="gs-center-panel">
          <div className="gs-canvas-toolbar">
            <button className="gs-zoom-btn" onClick={() => setZoom((z) => Math.max(20, z - 10))}>−</button>
            <span className="gs-zoom-label">{zoom}%</span>
            <button className="gs-zoom-btn" onClick={() => setZoom((z) => Math.min(100, z + 10))}>+</button>
            <button className="gs-zoom-btn" onClick={() => setZoom(50)}>Fit</button>
            {layoutData.totalSheets > 1 && (
              <>
                <span className="gs-sheet-separator">|</span>
                <button className="gs-zoom-btn" disabled={activeSheet === 0}
                  onClick={() => setActiveSheet(a => a - 1)}>◀</button>
                <span className="gs-zoom-label">Sheet {activeSheet + 1}/{layoutData.totalSheets}</span>
                <button className="gs-zoom-btn" disabled={activeSheet >= layoutData.totalSheets - 1}
                  onClick={() => setActiveSheet(a => a + 1)}>▶</button>
              </>
            )}
          </div>
          <div className="gs-canvas-container">
            <canvas ref={canvasRef} />
          </div>
          {currentSheet.totalHeight > 0 && (
            <div className="gs-height-indicator">
              Sheet {activeSheet + 1}: {SHEET_WIDTH_INCHES}" × {Math.ceil(currentSheet.totalHeight)}" | {currentSheet.items.length} item{currentSheet.items.length !== 1 ? 's' : ''}
              {layoutData.totalSheets > 1 && ` | ${layoutData.totalSheets} sheets total`}
            </div>
          )}
        </div>

        {/* Right Panel - Settings */}
        <div className="gs-right-panel">
          <div className="gs-settings-section">
            <h3>Order Info (Header Strip)</h3>
            <div className="gs-setting-row">
              <label>Include Header in Export</label>
              <button className={`gs-toggle ${includeHeader ? 'active' : ''}`}
                onClick={() => setIncludeHeader(!includeHeader)} />
            </div>
            <div className="gs-setting-row">
              <label>PO #</label>
              <input type="text" placeholder="PO-0425" value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)} className="gs-text-input" />
            </div>
            <div className="gs-setting-row">
              <label>Order #</label>
              <input type="text" placeholder="ORD-1538" value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)} className="gs-text-input" />
            </div>
            <div className="gs-setting-row">
              <label>Order Link (QR)</label>
              <input type="text" placeholder="https://..." value={orderLink}
                onChange={(e) => setOrderLink(e.target.value)} className="gs-text-input" />
            </div>
            <div className="gs-setting-row">
              <label>Header Top Margin</label>
              <input type="number" step="0.1" min="0" max="5" value={headerTopMargin}
                onChange={(e) => setHeaderTopMargin(parseFloat(e.target.value) || 0)} />
            </div>
          </div>

          <div className="gs-settings-section">
            <h3>Sheet Settings</h3>
            <div className="gs-setting-row">
              <label>Sheet Width</label>
              <span className="gs-setting-value">{SHEET_WIDTH_INCHES}"</span>
            </div>
            <div className="gs-setting-row">
              <label>Max Height</label>
              <span className="gs-setting-value">{MAX_SHEET_HEIGHT}" (auto-split)</span>
            </div>
            <div className="gs-setting-row">
              <label>H Gap (horizontal)</label>
              <input type="number" step="0.05" min="0" max="2" value={hGap}
                onChange={(e) => setHGap(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="gs-setting-row">
              <label>V Gap (vertical)</label>
              <input type="number" step="0.05" min="0" max="2" value={vGap}
                onChange={(e) => setVGap(parseFloat(e.target.value) || 0)} />
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
              <button className={`gs-toggle ${bgTransparent ? 'active' : ''}`}
                onClick={() => setBgTransparent(!bgTransparent)} title={bgTransparent ? 'Transparent' : 'White'} />
            </div>
            <div className="gs-setting-row">
              <label>Show Grid</label>
              <button className={`gs-toggle ${showGrid ? 'active' : ''}`}
                onClick={() => setShowGrid(!showGrid)} />
            </div>
            <div className="gs-setting-row">
              <label>Tight Pack</label>
              <button className={`gs-toggle ${tightPack ? 'active' : ''}`}
                onClick={() => setTightPack(!tightPack)} />
            </div>
            <div className="gs-setting-row">
              <label>Show Cut Lines</label>
              <button className={`gs-toggle ${showCutLines ? 'active' : ''}`}
                onClick={() => setShowCutLines(!showCutLines)} />
            </div>
          </div>

          <div className="gs-stats">
            <div className="gs-stat-row">
              <label>Total Height</label>
              <span className="highlight">{Math.ceil(totalHeight)}"</span>
            </div>
            <div className="gs-stat-row">
              <label>Sheets</label>
              <span className="highlight">{layoutData.totalSheets}</span>
            </div>
            <div className="gs-stat-row">
              <label>Utilization</label>
              <span className="highlight">{utilizationPct}%</span>
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
              <span>{SHEET_WIDTH_INCHES * DPI} × {Math.ceil(currentSheet.totalHeight) * DPI} px</span>
            </div>
          </div>

          {/* Cost Calculation */}
          {totalHeight > 0 && (
            <div className="gs-cost-box">
              <div className="gs-cost-title">💰 Cost Estimate</div>
              <div className="gs-cost-row">
                <span>Total sheet length</span>
                <span>{Math.ceil(totalHeight)}" ({(Math.ceil(totalHeight) / 12).toFixed(2)} ft)</span>
              </div>
              <div className="gs-cost-row">
                <span>Rate</span>
                <span>${COST_PER_FOOT.toFixed(2)} / linear ft</span>
              </div>
              <div className="gs-cost-divider" />
              <div className="gs-cost-row gs-cost-total">
                <span>Total</span>
                <span>${((Math.ceil(totalHeight) / 12) * COST_PER_FOOT).toFixed(2)} USD</span>
              </div>
            </div>
          )}

          <button className="gs-btn-recalc" onClick={() => {
            const newLayout = calculateLayout(artworks, SHEET_WIDTH_INCHES, hGap, vGap, margins, tightPack);
            setLayoutData(newLayout);
          }}>
            ↻ Recalculate Layout
          </button>
          <button className="gs-btn-optimize" onClick={async () => {
            if (artworks.length === 0) return;
            const prevHeight = totalHeight;
            // Run optimization with rotation enabled for maximum packing
            const optimized = calculateLayout(artworks, SHEET_WIDTH_INCHES, hGap, vGap, margins, true);
            // Also try without rotation
            const noRot = calculateLayout(artworks, SHEET_WIDTH_INCHES, hGap, vGap, margins, false);
            const optH = optimized.sheets.reduce((s, sh) => s + sh.totalHeight, 0);
            const noRotH = noRot.sheets.reduce((s, sh) => s + sh.totalHeight, 0);
            const best = optH <= noRotH ? optimized : noRot;
            const bestH = Math.min(optH, noRotH);
            setLayoutData(best);
            const saved = prevHeight - bestH;
            if (saved > 0.1) {
              alert(`✓ Optimized! Height: ${Math.ceil(bestH)}" (saved ${saved.toFixed(1)}" / ${(saved * SHEET_WIDTH_INCHES).toFixed(0)} sq.in.)`);
            } else {
              alert(`✓ Already optimal at ${Math.ceil(bestH)}"`);
            }
          }}>
            ⚡ Optimize Now
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
