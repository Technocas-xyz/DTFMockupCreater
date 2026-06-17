import React, { useRef, useEffect, useState, useCallback } from 'react';
import { TSHIRT_SIZES } from '../constants/tshirtSizes';
import './DesignCanvas.css';

// Canvas dimensions (pixels)
const CANVAS_WIDTH = 700;
const CANVAS_HEIGHT = 850;

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
      // Custom garment: image fills 90% of canvas, body = full image
      const imgW = tshirtImage.naturalWidth || tshirtImage.width;
      const imgH = tshirtImage.naturalHeight || tshirtImage.height;
      const imgAspect = imgW / imgH;
      const canvasAspect = CANVAS_WIDTH / CANVAS_HEIGHT;

      let drawW, drawH;
      if (imgAspect > canvasAspect) {
        drawW = CANVAS_WIDTH * 0.9;
        drawH = drawW / imgAspect;
      } else {
        drawH = CANVAS_HEIGHT * 0.9;
        drawW = drawH * imgAspect;
      }

      // The garment image IS the body, so pxPerInch = drawn size / body inches
      tshirtW = drawW;
      tshirtH = drawH;
      tshirtX = (CANVAS_WIDTH - drawW) / 2;
      tshirtY = (CANVAS_HEIGHT - drawH) / 2;
      // Use a uniform scale so artwork inches are correct in both directions
      pxPerInchW = drawW / bodyWidth;
      pxPerInchH = drawH / bodyLength;
      pxPerInch = Math.min(pxPerInchW, pxPerInchH);
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

    // Print area from artwork area settings (use uniform scale for artwork, non-uniform for shirt positioning)
    const printAreaPxW = artworkAreaSettings.width * pxPerInch;
    const printAreaPxH = artworkAreaSettings.height * pxPerInch;

    // Centered horizontally, positioned by top offset
    const printX = tshirtX + (tshirtW - printAreaPxW) / 2;
    const printY = tshirtY + (artworkAreaSettings.topOffset * pxPerInchH);

    // Artwork at fixed physical size — uniform scale so width/height labels match input
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
        // Custom garment from Garment Manager — fit to canvas, apply color tint
        const canvasAspect = CANVAS_WIDTH / CANVAS_HEIGHT;
        let drawW, drawH, drawX, drawY;
        if (imgAspect > canvasAspect) {
          drawW = CANVAS_WIDTH * 0.9;
          drawH = drawW / imgAspect;
          drawX = (CANVAS_WIDTH - drawW) / 2;
          drawY = (CANVAS_HEIGHT - drawH) / 2;
        } else {
          drawH = CANVAS_HEIGHT * 0.9;
          drawW = drawH * imgAspect;
          drawX = (CANVAS_WIDTH - drawW) / 2;
          drawY = (CANVAS_HEIGHT - drawH) / 2;
        }

        // Apply color tint using offscreen canvas
        const offscreen = document.createElement('canvas');
        offscreen.width = CANVAS_WIDTH;
        offscreen.height = CANVAS_HEIGHT;
        const offCtx = offscreen.getContext('2d');
        offCtx.drawImage(tshirtImage, drawX, drawY, drawW, drawH);
        offCtx.globalCompositeOperation = 'multiply';
        offCtx.fillStyle = selectedColor.hex;
        offCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        offCtx.globalCompositeOperation = 'destination-in';
        offCtx.drawImage(tshirtImage, drawX, drawY, drawW, drawH);
        ctx.drawImage(offscreen, 0, 0);
      } else {
        // Default t-shirt image — scale based on size, apply color tint
        const { tshirtW, tshirtH, tshirtX, tshirtY } = printArea;

        const shirtPadding = 1.3;
        const shirtImgW = tshirtW * shirtPadding;
        const shirtImgH = shirtImgW / imgAspect;
        const shirtImgX = (CANVAS_WIDTH - shirtImgW) / 2;
        const shirtImgY = tshirtY - (shirtImgH - tshirtH) * 0.15;

        const offscreen = document.createElement('canvas');
        offscreen.width = CANVAS_WIDTH;
        offscreen.height = CANVAS_HEIGHT;
        const offCtx = offscreen.getContext('2d');
        offCtx.drawImage(tshirtImage, shirtImgX, shirtImgY, shirtImgW, shirtImgH);
        offCtx.globalCompositeOperation = 'multiply';
        offCtx.fillStyle = selectedColor.hex;
        offCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        offCtx.globalCompositeOperation = 'destination-in';
        offCtx.drawImage(tshirtImage, shirtImgX, shirtImgY, shirtImgW, shirtImgH);
        ctx.drawImage(offscreen, 0, 0);
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

      // Calculate actual inches from rendered pixels using uniform pxPerInch
      const actualW = (artW / printArea.pxPerInch).toFixed(2);
      const actualH = (artH / printArea.pxPerInch).toFixed(2);

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
