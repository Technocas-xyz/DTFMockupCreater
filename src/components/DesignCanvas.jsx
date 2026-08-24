import React, { useRef, useEffect, useState, useCallback } from 'react';
import { TSHIRT_SIZES } from '../constants/tshirtSizes';
import { drawRecoloredGarment } from '../utils/garmentTintEngine';
import './DesignCanvas.css';

// Canvas dimensions (pixels) — 4x for sharp artwork preview
const CANVAS_SCALE = 4;
const CANVAS_WIDTH = 700 * CANVAS_SCALE;
const CANVAS_HEIGHT = 850 * CANVAS_SCALE;
const LOGICAL_WIDTH = 700;
const LOGICAL_HEIGHT = 850;

// Color tinting utility — uses the new V2 garment tint engine
function applyColorTint(ctx, img, dx, dy, dw, dh, canvasW, canvasH, colorHex) {
  drawRecoloredGarment(ctx, img, dx, dy, dw, dh, colorHex, canvasW, canvasH);
}

function DesignCanvas({
  artwork,
  selectedSize,
  selectedColor,
  artworkDimensions,
  viewSide,
  artworkPosition,
  artworkScale,
  artworkAreaSettings,
  onPositionChange,
  customGarment,
  onRegisterExport,
  multiLayerEnabled,
  layers,
  activeLayerId,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [artworkImage, setArtworkImage] = useState(null);
  const [tshirtImage, setTshirtImage] = useState(null);
  const [canvasZoom, setCanvasZoom] = useState(1);
  // Cache of loaded images per layer (keyed by layer id)
  const [layerImages, setLayerImages] = useState({});

  // Load artwork image
  useEffect(() => {
    if (artwork) {
      const img = new Image();
      img.onload = () => setArtworkImage(img);
      img.src = artwork;
    } else {
      setArtworkImage(null);
    }
  }, [artwork]);

  // Load layer images (only in multi-layer mode)
  useEffect(() => {
    if (!multiLayerEnabled || !layers || layers.length === 0) return;
    const newImages = {};
    let pending = 0;
    layers.forEach(layer => {
      if (!layer.artwork) return;
      // Reuse existing cached image if artwork hasn't changed
      if (layerImages[layer.id] && layerImages[layer.id]._src === layer.artwork) {
        newImages[layer.id] = layerImages[layer.id];
        return;
      }
      pending++;
      const img = new Image();
      img.onload = () => {
        img._src = layer.artwork;
        newImages[layer.id] = img;
        pending--;
        if (pending === 0) setLayerImages(prev => ({ ...prev, ...newImages }));
      };
      img.src = layer.artwork;
    });
    if (pending === 0) {
      // All images either cached or no artwork — sync state
      setLayerImages(prev => {
        const updated = {};
        layers.forEach(l => { if (newImages[l.id]) updated[l.id] = newImages[l.id]; });
        return updated;
      });
    }
  }, [multiLayerEnabled, layers]);

  // Load t-shirt base image (use custom garment if selected)
  useEffect(() => {
    if (customGarment && customGarment.dataUrl) {
      // Use garment from Garment Manager
      const img = new Image();
      img.onload = () => setTshirtImage(img);
      img.onerror = () => setTshirtImage(null);
      img.src = customGarment.dataUrl;
      return;
    }
    // No garment selected — use vector fallback (drawn in canvas render)
    setTshirtImage(null);
  }, [viewSide, selectedColor, customGarment]);

  // Calculate print area on canvas
  const getPrintArea = useCallback(() => {
    const sizeData = TSHIRT_SIZES[selectedSize];
    const bodyWidth = sizeData.bodyWidth;
    const bodyLength = sizeData.bodyLength;

    let pxPerInchW, pxPerInchH, pxPerInch, tshirtW, tshirtH, tshirtX, tshirtY;

    if (customGarment && tshirtImage) {
      // Custom garment: scale based on stored shirt dimensions using a fixed reference
      // This ensures different sizes appear at proportionally different visual sizes
      const garmentBodyWidth = customGarment.bodyMapping?.shirtWidthInches || bodyWidth;
      const garmentBodyHeight = customGarment.bodyMapping?.shirtHeightInches || bodyLength;

      // Use the same reference scale as default t-shirts (based on 5XL = largest)
      const maxBodyWidth = 32;
      const maxBodyHeight = 35;
      const maxTshirtW = CANVAS_WIDTH * 0.52;
      const maxTshirtH = CANVAS_HEIGHT * 0.68;
      const refPxPerInchW = maxTshirtW / maxBodyWidth;
      const refPxPerInchH = maxTshirtH / maxBodyHeight;
      pxPerInch = Math.min(refPxPerInchW, refPxPerInchH);

      // Draw garment at its actual proportional size on canvas
      tshirtW = garmentBodyWidth * pxPerInch;
      tshirtH = garmentBodyHeight * pxPerInch;
      tshirtX = (CANVAS_WIDTH - tshirtW) / 2;
      tshirtY = (CANVAS_HEIGHT - tshirtH) / 2;
      pxPerInchW = pxPerInch;
      pxPerInchH = pxPerInch;
    } else {
      // Default: use 5XL reference scaling
      const maxBodyWidth = 32;
      const maxBodyLength = 35;
      const maxTshirtW = CANVAS_WIDTH * 0.52;
      const maxTshirtH = CANVAS_HEIGHT * 0.68;
      pxPerInchW = maxTshirtW / maxBodyWidth;
      pxPerInchH = maxTshirtH / maxBodyLength;
      pxPerInch = Math.min(pxPerInchW, pxPerInchH);

      tshirtW = bodyWidth * pxPerInchW;
      tshirtH = bodyLength * pxPerInchH;
      tshirtX = (CANVAS_WIDTH - tshirtW) / 2;
      tshirtY = CANVAS_HEIGHT * 0.20 + (maxTshirtH - tshirtH) / 2;
    }

    // Print area from artwork area settings (uniform pxPerInch)
    const printAreaPxW = artworkAreaSettings.width * pxPerInch;
    const printAreaPxH = artworkAreaSettings.height * pxPerInch;

    // Centered horizontally, positioned by top offset
    const printX = tshirtX + (tshirtW - printAreaPxW) / 2;
    const printY = tshirtY + (artworkAreaSettings.topOffset * pxPerInch);

    // Artwork at fixed physical size
    const artworkPxW = artworkDimensions.width * pxPerInch;
    const artworkPxH = artworkDimensions.height * pxPerInch;

    return {
      x: printX,
      y: printY,
      width: printAreaPxW,
      height: printAreaPxH,
      artworkWidth: artworkPxW,
      artworkHeight: artworkPxH,
      pxPerInch,
      tshirtX,
      tshirtY,
      tshirtW,
      tshirtH,
    };
  }, [selectedSize, artworkDimensions, artworkAreaSettings, customGarment, tshirtImage]);

  // One renderer, two uses. The on-screen preview draws the guides a designer
  // works against — print area, selection handles, dimensions, rulers. The saved
  // mockup draws the same scene without them, so what reaches the customer is
  // just the garment and the artwork.
  const drawScene = useCallback((ctx, { guides = true } = {}) => {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const printArea = getPrintArea();

    // Draw t-shirt
    if (tshirtImage) {
      const imgW = tshirtImage.naturalWidth || tshirtImage.width;
      const imgH = tshirtImage.naturalHeight || tshirtImage.height;
      const imgAspect = imgW / imgH;

      if (customGarment) {
        // Custom garment — draw with color tint
        const drawW = printArea.tshirtW;
        const drawH = printArea.tshirtH;
        const drawX = printArea.tshirtX;
        const drawY = printArea.tshirtY;

        applyColorTint(ctx, tshirtImage, drawX, drawY, drawW, drawH, CANVAS_WIDTH, CANVAS_HEIGHT, selectedColor.hex);
      } else {
        // Default t-shirt image — scale based on size, apply color tint
        const { tshirtW, tshirtH, tshirtX, tshirtY } = printArea;

        const shirtPadding = 1.3;
        const shirtImgW = tshirtW * shirtPadding;
        const shirtImgH = shirtImgW / imgAspect;
        const shirtImgX = (CANVAS_WIDTH - shirtImgW) / 2;
        const shirtImgY = tshirtY - (shirtImgH - tshirtH) * 0.15;

        applyColorTint(ctx, tshirtImage, shirtImgX, shirtImgY, shirtImgW, shirtImgH, CANVAS_WIDTH, CANVAS_HEIGHT, selectedColor.hex);
      }
    } else {
      // Fallback: draw vector t-shirt shape
      drawTshirt(ctx, selectedColor.hex, viewSide, printArea);
    }

    // Draw print area guide (dashed border)
    if (guides) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1 * CANVAS_SCALE;
      ctx.setLineDash([6 * CANVAS_SCALE, 4 * CANVAS_SCALE]);
      ctx.strokeRect(printArea.x, printArea.y, printArea.width, printArea.height);
      ctx.setLineDash([]);
    }

    // Draw artwork
    // Helper to draw a single artwork layer given its image, dimensions, and position
    const drawOneArtwork = (img, dims, pos, isActive, layerOpacity = 1) => {
      const pxPerInch = printArea.pxPerInch;
      const boxW = dims.width * pxPerInch * artworkScale;
      const boxH = dims.height * pxPerInch * artworkScale;

      const imgNatW = img.naturalWidth || img.width;
      const imgNatH = img.naturalHeight || img.height;
      const imgAspect = imgNatW / imgNatH;
      const boxAspect = boxW / boxH;

      let artW, artH;
      if (imgAspect > boxAspect) { artW = boxW; artH = boxW / imgAspect; }
      else { artH = boxH; artW = boxH * imgAspect; }

      const drawX = printArea.x + (printArea.width - artW) / 2 + pos.x * CANVAS_SCALE;
      const drawY = printArea.y + pos.y * CANVAS_SCALE;

      ctx.save();
      ctx.globalAlpha = layerOpacity;
      ctx.beginPath();
      ctx.rect(printArea.x - 2, printArea.y - 2, printArea.width + 4, printArea.height + 4);
      ctx.clip();
      ctx.drawImage(img, drawX, drawY, artW, artH);
      ctx.restore();

      // Selection handles and dimension labels only for the active layer
      if (isActive && guides && !isDragging) {
        const handleSize = 8 * CANVAS_SCALE;
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2 * CANVAS_SCALE;
        ctx.strokeRect(drawX, drawY, artW, artH);

        ctx.fillStyle = 'white';
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2 * CANVAS_SCALE;
        const corners = [
          [drawX, drawY],
          [drawX + artW, drawY],
          [drawX, drawY + artH],
          [drawX + artW, drawY + artH],
        ];
        corners.forEach(([cx, cy]) => {
          ctx.fillRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
          ctx.strokeRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
        });
      }

      if (isActive && guides) {
        ctx.strokeStyle = '#ef4444';
        ctx.fillStyle = '#ef4444';
        ctx.lineWidth = 1.5 * CANVAS_SCALE;
        ctx.setLineDash([]);

        const actualW = dims.width.toFixed(2);
        const actualH = dims.height.toFixed(2);

        const dimY = drawY - 14;
        ctx.beginPath(); ctx.moveTo(drawX, dimY); ctx.lineTo(drawX + artW, dimY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(drawX, dimY - 4); ctx.lineTo(drawX, dimY + 4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(drawX + artW, dimY - 4); ctx.lineTo(drawX + artW, dimY + 4); ctx.stroke();
        ctx.font = `bold ${12 * CANVAS_SCALE}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(`${actualW}"`, drawX + artW / 2, dimY - 4 * CANVAS_SCALE);

        const dimX = drawX + artW + 14;
        ctx.beginPath(); ctx.moveTo(dimX, drawY); ctx.lineTo(dimX, drawY + artH); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(dimX - 4, drawY); ctx.lineTo(dimX + 4, drawY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(dimX - 4, drawY + artH); ctx.lineTo(dimX + 4, drawY + artH); ctx.stroke();
        ctx.save();
        ctx.translate(dimX + 14, drawY + artH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ef4444';
        ctx.font = `bold ${12 * CANVAS_SCALE}px Inter, sans-serif`;
        ctx.fillText(`${actualH}"`, 0, 0);
        ctx.restore();
      }

      // Draw a subtle border for non-active layers in multi-layer mode (guides only)
      if (!isActive && guides && multiLayerEnabled) {
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
        ctx.lineWidth = 1 * CANVAS_SCALE;
        ctx.setLineDash([4 * CANVAS_SCALE, 3 * CANVAS_SCALE]);
        ctx.strokeRect(drawX, drawY, artW, artH);
        ctx.setLineDash([]);
      }
    };

    if (multiLayerEnabled && layers && layers.length > 0) {
      // Multi-layer mode: draw all visible layers in order
      let hasVisibleArtwork = false;
      layers.forEach(layer => {
        if (!layer.visible) return;
        const img = layerImages[layer.id];
        if (!img) return;
        hasVisibleArtwork = true;
        const isActive = layer.id === activeLayerId;
        drawOneArtwork(img, layer.artworkDimensions, layer.artworkPosition, isActive, layer.opacity ?? 1);
      });
      if (!hasVisibleArtwork && guides) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = `${14 * CANVAS_SCALE}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('Upload artwork to a layer', printArea.x + printArea.width / 2, printArea.y + printArea.height / 2);
      }
    } else if (artworkImage) {
      // Single-layer mode (original behavior)
      drawOneArtwork(artworkImage, artworkDimensions, artworkPosition, true, 1);
    } else if (guides) {
      // Placeholder text
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = `${14 * CANVAS_SCALE}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('Upload artwork to preview', printArea.x + printArea.width / 2, printArea.y + printArea.height / 2);
      ctx.fillText(`Print area: ${artworkAreaSettings.width}" × ${artworkAreaSettings.height}"`, printArea.x + printArea.width / 2, printArea.y + printArea.height / 2 + 24 * CANVAS_SCALE);
    }

    // Size label
    if (guides) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = `bold ${13 * CANVAS_SCALE}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`Size: ${selectedSize} | ${viewSide.toUpperCase()}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 20 * CANVAS_SCALE);
    }

    // Draw rulers (inch marks along top and left)
    if (guides && printArea.pxPerInch > 0) {
      const rulerColor = '#94a3b8';
      const rulerTextColor = '#64748b';
      const ppi = printArea.pxPerInch;

      ctx.strokeStyle = rulerColor;
      ctx.fillStyle = rulerTextColor;
      ctx.lineWidth = 1;
      ctx.font = `${10 * CANVAS_SCALE}px Inter, sans-serif`;

      // Top ruler (horizontal) — starts from shirt left edge
      const rulerTopY = printArea.tshirtY - 14;
      const rulerStartX = printArea.tshirtX;
      const maxInchesW = Math.ceil(printArea.tshirtW / ppi);
      ctx.textAlign = 'center';
      for (let i = 0; i <= maxInchesW; i++) {
        const x = rulerStartX + i * ppi;
        if (x > CANVAS_WIDTH - 10) break;
        const tickH = i % 5 === 0 ? 10 : 5;
        ctx.beginPath();
        ctx.moveTo(x, rulerTopY);
        ctx.lineTo(x, rulerTopY + tickH);
        ctx.stroke();
        if (i % 5 === 0 || i === maxInchesW) {
          ctx.fillText(`${i}"`, x, rulerTopY - 4);
        }
      }
      // Ruler baseline
      ctx.beginPath();
      ctx.moveTo(rulerStartX, rulerTopY);
      ctx.lineTo(rulerStartX + maxInchesW * ppi, rulerTopY);
      ctx.stroke();

      // Left ruler (vertical) — starts from shirt top edge
      const rulerLeftX = printArea.tshirtX - 14;
      const rulerStartY = printArea.tshirtY;
      const maxInchesH = Math.ceil(printArea.tshirtH / ppi);
      ctx.textAlign = 'right';
      for (let i = 0; i <= maxInchesH; i++) {
        const y = rulerStartY + i * ppi;
        if (y > CANVAS_HEIGHT - 30) break;
        const tickW = i % 5 === 0 ? 10 : 5;
        ctx.beginPath();
        ctx.moveTo(rulerLeftX, y);
        ctx.lineTo(rulerLeftX + tickW, y);
        ctx.stroke();
        if (i % 5 === 0 || i === maxInchesH) {
          ctx.fillText(`${i}"`, rulerLeftX - 3, y + 4);
        }
      }
      // Ruler baseline
      ctx.beginPath();
      ctx.moveTo(rulerLeftX, rulerStartY);
      ctx.lineTo(rulerLeftX, rulerStartY + maxInchesH * ppi);
      ctx.stroke();
    }

  }, [artworkImage, tshirtImage, selectedSize, selectedColor, artworkDimensions, viewSide, artworkPosition, artworkScale, artworkAreaSettings, isDragging, customGarment, getPrintArea, multiLayerEnabled, layers, activeLayerId, layerImages]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawScene(canvas.getContext('2d'), { guides: true });
  }, [drawScene]);

  // "Save MU" saves what is on screen, so the mockup it stores comes from this
  // very canvas — re-rendered once, clean, at the moment the button is pressed.
  useEffect(() => {
    if (!onRegisterExport) return undefined;
    onRegisterExport(async () => {
      // Check if there's anything to export
      const hasContent = multiLayerEnabled
        ? (layers && layers.some(l => l.visible && layerImages[l.id]))
        : !!artworkImage;
      if (!hasContent) return null;
      const out = document.createElement('canvas');
      out.width = CANVAS_WIDTH;
      out.height = CANVAS_HEIGHT;
      drawScene(out.getContext('2d'), { guides: false });
      return new Promise(resolve => out.toBlob(resolve, 'image/png'));
    });
    return () => onRegisterExport(null);
  }, [onRegisterExport, drawScene, artworkImage, multiLayerEnabled, layers, layerImages]);

  // Mouse handlers for dragging artwork
  const handleMouseDown = (e) => {
    // Determine which image and position to use for hit-testing
    let img, dims, pos;
    if (multiLayerEnabled && layers && activeLayerId) {
      const activeLayer = layers.find(l => l.id === activeLayerId);
      if (!activeLayer || !activeLayer.visible) return;
      img = layerImages[activeLayerId];
      dims = activeLayer.artworkDimensions;
      pos = activeLayer.artworkPosition;
    } else {
      img = artworkImage;
      dims = artworkDimensions;
      pos = artworkPosition;
    }
    if (!img) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
    const y = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);

    const printArea = getPrintArea();
    const pxPerInch = printArea.pxPerInch;
    const boxW = dims.width * pxPerInch * artworkScale;
    const boxH = dims.height * pxPerInch * artworkScale;
    const imgNatW = img.naturalWidth || img.width;
    const imgNatH = img.naturalHeight || img.height;
    const imgAspect = imgNatW / imgNatH;
    const boxAspect = boxW / boxH;
    let artW, artH;
    if (imgAspect > boxAspect) { artW = boxW; artH = boxW / imgAspect; }
    else { artH = boxH; artW = boxH * imgAspect; }

    const drawX = printArea.x + (printArea.width - artW) / 2 + pos.x * CANVAS_SCALE;
    const drawY = printArea.y + pos.y * CANVAS_SCALE;

    if (x >= drawX && x <= drawX + artW && y >= drawY && y <= drawY + artH) {
      setIsDragging(true);
      setDragStart({ x: x - pos.x * CANVAS_SCALE, y: y - pos.y * CANVAS_SCALE });
    }
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
    const y = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);

    onPositionChange({
      x: (x - dragStart.x) / CANVAS_SCALE,
      y: (y - dragStart.y) / CANVAS_SCALE,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div className="design-canvas-container" ref={containerRef}>
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="design-canvas"
        style={{ transform: `scale(${canvasZoom})`, width: `${LOGICAL_WIDTH}px`, height: `${LOGICAL_HEIGHT}px` }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      <div className="canvas-zoom-controls">
        <button onClick={() => setCanvasZoom((z) => Math.max(0.5, z - 0.1))}>−</button>
        <span>{Math.round(canvasZoom * 100)}%</span>
        <button onClick={() => setCanvasZoom((z) => Math.min(2, z + 0.1))}>+</button>
      </div>
    </div>
  );
}

// Fallback: Draw a realistic t-shirt shape directly on the canvas
function drawTshirt(ctx, color, side, printArea) {
  const { tshirtX, tshirtY, tshirtW, tshirtH } = printArea;
  const cx = tshirtX + tshirtW / 2;

  const shoulderY = tshirtY - tshirtH * 0.12;
  const bodyBottom = tshirtY + tshirtH + tshirtH * 0.05;
  const bodyLeft = tshirtX - tshirtW * 0.05;
  const bodyRight = tshirtX + tshirtW + tshirtW * 0.05;
  const sleeveOuterLeft = tshirtX - tshirtW * 0.35;
  const sleeveOuterRight = tshirtX + tshirtW + tshirtW * 0.35;
  const sleeveBottomY = tshirtY + tshirtH * 0.2;
  const collarWidth = tshirtW * 0.14;
  const collarDepth = side === 'front' ? tshirtH * 0.08 : tshirtH * 0.03;

  // Drop shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 8;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(bodyLeft, sleeveBottomY);
  ctx.lineTo(sleeveOuterLeft + tshirtW * 0.06, sleeveBottomY - tshirtH * 0.04);
  ctx.lineTo(sleeveOuterLeft, shoulderY + tshirtH * 0.1);
  ctx.lineTo(bodyLeft, shoulderY);
  ctx.lineTo(cx - collarWidth, shoulderY);
  ctx.quadraticCurveTo(cx, shoulderY + collarDepth, cx + collarWidth, shoulderY);
  ctx.lineTo(bodyRight, shoulderY);
  ctx.lineTo(sleeveOuterRight, shoulderY + tshirtH * 0.1);
  ctx.lineTo(sleeveOuterRight - tshirtW * 0.06, sleeveBottomY - tshirtH * 0.04);
  ctx.lineTo(bodyRight, sleeveBottomY);
  ctx.lineTo(bodyRight, bodyBottom);
  ctx.quadraticCurveTo(cx, bodyBottom + tshirtH * 0.01, bodyLeft, bodyBottom);
  ctx.lineTo(bodyLeft, sleeveBottomY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Side shading
  const shade = ctx.createLinearGradient(bodyLeft, 0, bodyRight, 0);
  shade.addColorStop(0, 'rgba(0,0,0,0.08)');
  shade.addColorStop(0.15, 'rgba(0,0,0,0.02)');
  shade.addColorStop(0.5, 'rgba(0,0,0,0)');
  shade.addColorStop(0.85, 'rgba(0,0,0,0.02)');
  shade.addColorStop(1, 'rgba(0,0,0,0.08)');
  ctx.save();
  ctx.fillStyle = shade;
  ctx.fill();
  ctx.restore();

  // Collar
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - collarWidth, shoulderY);
  ctx.quadraticCurveTo(cx, shoulderY + collarDepth, cx + collarWidth, shoulderY);
  ctx.stroke();

  // Shoulder seams
  ctx.strokeStyle = 'rgba(0,0,0,0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bodyLeft, shoulderY);
  ctx.lineTo(bodyLeft, sleeveBottomY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(bodyRight, shoulderY);
  ctx.lineTo(bodyRight, sleeveBottomY);
  ctx.stroke();
}

export default DesignCanvas;
