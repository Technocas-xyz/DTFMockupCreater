import React, { useRef, useEffect, useState, useCallback } from 'react';
import { TSHIRT_SIZES } from '../constants/tshirtSizes';
import './DesignCanvas.css';

// Canvas dimensions (pixels)
const CANVAS_WIDTH = 700;
const CANVAS_HEIGHT = 850;

// Color tinting utility — replaces hue/saturation but preserves lightness
// This works correctly on any shirt color (black, white, colored, etc.)
function applyColorTint(ctx, img, dx, dy, dw, dh, canvasW, canvasH, colorHex) {
  // If color is white (#ffffff or close), just draw as-is
  const hex = colorHex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Draw original image first
  const offscreen = document.createElement('canvas');
  offscreen.width = canvasW;
  offscreen.height = canvasH;
  const offCtx = offscreen.getContext('2d');
  offCtx.drawImage(img, dx, dy, dw, dh);

  // If white is selected, just draw original
  if (r > 240 && g > 240 && b > 240) {
    ctx.drawImage(offscreen, 0, 0);
    return;
  }

  // For colored tinting: use 'hue' blend which changes hue/sat but keeps luminosity
  // Step 1: draw original (to get the alpha mask)
  // Step 2: overlay the color using 'multiply' for dark colors or 'screen' for light
  // Best approach for garments: draw original, then overlay color at ~60% opacity with 'multiply'
  // + draw original at low opacity on top to preserve texture

  // Approach: screen blend for light colors, multiply for mid, for dark overlay
  // Simplest that works well: draw original, then overlay color with 'color' blend mode
  offCtx.globalCompositeOperation = 'source-atop';
  offCtx.fillStyle = colorHex;
  offCtx.globalAlpha = 0.75;
  offCtx.fillRect(0, 0, canvasW, canvasH);
  offCtx.globalAlpha = 1;

  // Draw texture back on top using multiply to get shading
  const texture = document.createElement('canvas');
  texture.width = canvasW;
  texture.height = canvasH;
  const texCtx = texture.getContext('2d');
  texCtx.drawImage(img, dx, dy, dw, dh);
  texCtx.globalCompositeOperation = 'multiply';
  texCtx.globalAlpha = 0.6;
  texCtx.drawImage(img, dx, dy, dw, dh);

  offCtx.globalCompositeOperation = 'multiply';
  offCtx.globalAlpha = 0.5;
  offCtx.drawImage(texture, 0, 0);
  offCtx.globalAlpha = 1;
  offCtx.globalCompositeOperation = 'source-over';

  ctx.drawImage(offscreen, 0, 0);
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
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [artworkImage, setArtworkImage] = useState(null);
  const [tshirtImage, setTshirtImage] = useState(null);
  const [canvasZoom, setCanvasZoom] = useState(1);

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

  // Load t-shirt base image (use custom garment if selected)
  useEffect(() => {
    if (customGarment && customGarment.dataUrl) {
      // Use custom garment from Garment Manager
      const img = new Image();
      img.onload = () => setTshirtImage(img);
      img.src = customGarment.dataUrl;
      return;
    }

    const side = viewSide === 'front' ? 'front' : 'back';
    const colorName = selectedColor.name.toLowerCase().replace(/\s+/g, '-');

    // Try color-specific image first, then fall back to white
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setTshirtImage(img);
    img.onerror = () => {
      // Try white version
      const fallback = new Image();
      fallback.crossOrigin = 'anonymous';
      fallback.onload = () => setTshirtImage(fallback);
      fallback.onerror = () => setTshirtImage(null);
      fallback.src = `/tshirts/white-${side}.png`;
    };
    img.src = `/tshirts/${colorName}-${side}.png`;
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

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

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
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(printArea.x, printArea.y, printArea.width, printArea.height);
    ctx.setLineDash([]);

    // Draw artwork
    if (artworkImage) {
      ctx.save();
      // Artwork bounding box from set dimensions
      const boxW = printArea.artworkWidth * artworkScale;
      const boxH = printArea.artworkHeight * artworkScale;

      // Maintain image aspect ratio within the bounding box
      const imgNatW = artworkImage.naturalWidth || artworkImage.width;
      const imgNatH = artworkImage.naturalHeight || artworkImage.height;
      const imgAspect = imgNatW / imgNatH;
      const boxAspect = boxW / boxH;

      let artW, artH;
      if (imgAspect > boxAspect) {
        artW = boxW;
        artH = boxW / imgAspect;
      } else {
        artH = boxH;
        artW = boxH * imgAspect;
      }

      // Center artwork within print area
      const drawX = printArea.x + (printArea.width - artW) / 2 + artworkPosition.x;
      const drawY = printArea.y + (printArea.height - artH) / 2 + artworkPosition.y;

      // Clip to print area
      ctx.beginPath();
      ctx.rect(printArea.x - 2, printArea.y - 2, printArea.width + 4, printArea.height + 4);
      ctx.clip();

      ctx.drawImage(artworkImage, drawX, drawY, artW, artH);
      ctx.restore();

      // Selection handles
      if (!isDragging) {
        const handleSize = 8;
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2;
        ctx.strokeRect(drawX, drawY, artW, artH);

        ctx.fillStyle = 'white';
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2;
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

      // Dimension labels — show the set artwork dimensions
      ctx.strokeStyle = '#ef4444';
      ctx.fillStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);

      // Show exact dimensions from user input (not from pixel calculation)
      const actualW = artworkDimensions.width.toFixed(2);
      const actualH = artworkDimensions.height.toFixed(2);

      // Width line above artwork
      const dimY = drawY - 14;
      ctx.beginPath();
      ctx.moveTo(drawX, dimY);
      ctx.lineTo(drawX + artW, dimY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(drawX, dimY - 4);
      ctx.lineTo(drawX, dimY + 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(drawX + artW, dimY - 4);
      ctx.lineTo(drawX + artW, dimY + 4);
      ctx.stroke();
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${actualW}"`, drawX + artW / 2, dimY - 4);

      // Height line on right
      const dimX = drawX + artW + 14;
      ctx.beginPath();
      ctx.moveTo(dimX, drawY);
      ctx.lineTo(dimX, drawY + artH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(dimX - 4, drawY);
      ctx.lineTo(dimX + 4, drawY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(dimX - 4, drawY + artH);
      ctx.lineTo(dimX + 4, drawY + artH);
      ctx.stroke();
      ctx.save();
      ctx.translate(dimX + 14, drawY + artH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.fillText(`${actualH}"`, 0, 0);
      ctx.restore();

    } else {
      // Placeholder text
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Upload artwork to preview', printArea.x + printArea.width / 2, printArea.y + printArea.height / 2);
      ctx.fillText(`Print area: ${artworkAreaSettings.width}" × ${artworkAreaSettings.height}"`, printArea.x + printArea.width / 2, printArea.y + printArea.height / 2 + 24);
    }

    // Size label
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Size: ${selectedSize} | ${viewSide.toUpperCase()}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 20);

    // Draw rulers (inch marks along top and left)
    if (printArea.pxPerInch > 0) {
      const rulerColor = 'rgba(255,255,255,0.5)';
      const rulerTextColor = 'rgba(255,255,255,0.7)';
      const ppi = printArea.pxPerInch;
      const rulerOffset = 20; // padding from edge

      ctx.strokeStyle = rulerColor;
      ctx.fillStyle = rulerTextColor;
      ctx.lineWidth = 1;
      ctx.font = '9px Inter, sans-serif';

      // Top ruler (horizontal) — starts from shirt left edge
      const rulerTopY = printArea.tshirtY - 12;
      const rulerStartX = printArea.tshirtX;
      const maxInchesW = Math.ceil(printArea.tshirtW / ppi);
      ctx.textAlign = 'center';
      for (let i = 0; i <= maxInchesW; i++) {
        const x = rulerStartX + i * ppi;
        if (x > CANVAS_WIDTH - 10) break;
        const tickH = i % 5 === 0 ? 8 : 4;
        ctx.beginPath();
        ctx.moveTo(x, rulerTopY);
        ctx.lineTo(x, rulerTopY + tickH);
        ctx.stroke();
        if (i % 5 === 0 || i === maxInchesW) {
          ctx.fillText(`${i}`, x, rulerTopY - 3);
        }
      }

      // Left ruler (vertical) — starts from shirt top edge
      const rulerLeftX = printArea.tshirtX - 12;
      const rulerStartY = printArea.tshirtY;
      const maxInchesH = Math.ceil(printArea.tshirtH / ppi);
      ctx.textAlign = 'right';
      for (let i = 0; i <= maxInchesH; i++) {
        const y = rulerStartY + i * ppi;
        if (y > CANVAS_HEIGHT - 30) break;
        const tickW = i % 5 === 0 ? 8 : 4;
        ctx.beginPath();
        ctx.moveTo(rulerLeftX, y);
        ctx.lineTo(rulerLeftX + tickW, y);
        ctx.stroke();
        if (i % 5 === 0 || i === maxInchesH) {
          ctx.fillText(`${i}"`, rulerLeftX - 2, y + 3);
        }
      }
    }

  }, [artworkImage, tshirtImage, selectedSize, selectedColor, artworkDimensions, viewSide, artworkPosition, artworkScale, isDragging, getPrintArea]);

  // Mouse handlers for dragging artwork
  const handleMouseDown = (e) => {
    if (!artworkImage) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
    const y = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);

    const printArea = getPrintArea();
    const boxW = printArea.artworkWidth * artworkScale;
    const boxH = printArea.artworkHeight * artworkScale;
    const imgNatW = artworkImage.naturalWidth || artworkImage.width;
    const imgNatH = artworkImage.naturalHeight || artworkImage.height;
    const imgAspect = imgNatW / imgNatH;
    const boxAspect = boxW / boxH;
    let artW, artH;
    if (imgAspect > boxAspect) { artW = boxW; artH = boxW / imgAspect; }
    else { artH = boxH; artW = boxH * imgAspect; }

    const drawX = printArea.x + (printArea.width - artW) / 2 + artworkPosition.x;
    const drawY = printArea.y + (printArea.height - artH) / 2 + artworkPosition.y;

    if (x >= drawX && x <= drawX + artW && y >= drawY && y <= drawY + artH) {
      setIsDragging(true);
      setDragStart({ x: x - artworkPosition.x, y: y - artworkPosition.y });
    }
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
    const y = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);

    onPositionChange({
      x: x - dragStart.x,
      y: y - dragStart.y,
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
        style={{ transform: `scale(${canvasZoom})` }}
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
