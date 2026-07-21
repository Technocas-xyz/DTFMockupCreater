import React, { useRef, useEffect, useState } from 'react';
import { TSHIRT_SIZES, SIZE_ORDER } from '../constants/tshirtSizes';
import './MockupPreview.css';

function MockupPreview({
  artwork,
  selectedColor,
  artworkDimensions,
  artworkPosition,
  artworkScale,
  artworkAreaSettings,
  selectedMockupSizes,
  viewSide,
  garmentLibrary,
}) {
  const activeSizes = SIZE_ORDER.filter((size) => selectedMockupSizes[size]);
  const mockupRefs = useRef({});

  // Render a high-resolution mockup for download
  const renderHighRes = (size, showAnnotations = true) => {
    const W = 6000;
    const H = 7200;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const sizeData = TSHIRT_SIZES[size];

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    return new Promise((resolve) => {
      // Check if there's a tagged garment for this size AND side in the library
      const taggedGarment = garmentLibrary && garmentLibrary.find(g => g.size === size && (g.side || 'front') === viewSide);

      const side = viewSide === 'front' ? 'front' : 'back';
      const colorName = selectedColor.name.toLowerCase().replace(/\s+/g, '-');
      const tshirtImg = new Image();

      const drawWithShirt = (shirtImg, isCustomGarment) => {
        // Use fixed pxPerInch based on largest size (same as DesignCanvas)
        // Use selected size directly to maximize shirt size on canvas
        const maxBodyWidth = sizeData.bodyWidth;
        const maxBodyLength = sizeData.bodyLength;
        const maxTshirtW = W * 0.88;
        const maxTshirtH = H * 0.80;
        const pxPerInchW = maxTshirtW / maxBodyWidth;
        const pxPerInchH = maxTshirtH / maxBodyLength;

        // T-shirt body area (for artwork placement)
        let tshirtW, tshirtH, tshirtX, tshirtY;

        if (shirtImg && isCustomGarment) {
          // Custom garment — image IS the body
          const imgW = shirtImg.naturalWidth || shirtImg.width;
          const imgH = shirtImg.naturalHeight || shirtImg.height;
          const imgAspect = imgW / imgH;
          const canvasAspect = W / H;
          let dw, dh, dx, dy;
          if (imgAspect > canvasAspect) {
            dw = W * 0.9;
            dh = dw / imgAspect;
            dx = (W - dw) / 2;
            dy = (H - dh) / 2;
          } else {
            dh = H * 0.9;
            dw = dh * imgAspect;
            dx = (W - dw) / 2;
            dy = (H - dh) / 2;
          }

          // Body = drawn image area
          tshirtW = dw;
          tshirtH = dh;
          tshirtX = dx;
          tshirtY = dy;

          // Draw with color tint
          const offscreen = document.createElement('canvas');
          offscreen.width = W;
          offscreen.height = H;
          const offCtx = offscreen.getContext('2d');
          offCtx.imageSmoothingEnabled = true;
          offCtx.imageSmoothingQuality = 'high';
          const hex = selectedColor.hex.replace('#', '');
          const cr = parseInt(hex.substring(0, 2), 16);
          const cg = parseInt(hex.substring(2, 4), 16);
          const cb = parseInt(hex.substring(4, 6), 16);

          offCtx.drawImage(shirtImg, dx, dy, dw, dh);

          if (!(cr > 240 && cg > 240 && cb > 240)) {
            offCtx.globalCompositeOperation = 'source-atop';
            offCtx.fillStyle = selectedColor.hex;
            offCtx.fillRect(0, 0, W, H);
            offCtx.globalCompositeOperation = 'luminosity';
            offCtx.drawImage(shirtImg, dx, dy, dw, dh);
            const lumC = (cr * 0.299 + cg * 0.587 + cb * 0.114) / 255;
            if (lumC < 0.4) {
              offCtx.globalCompositeOperation = 'source-atop';
              offCtx.globalAlpha = 0.2;
              offCtx.fillStyle = '#000000';
              offCtx.fillRect(0, 0, W, H);
              offCtx.globalAlpha = 1;
            }
            offCtx.globalCompositeOperation = 'source-over';
          }
          ctx.drawImage(offscreen, 0, 0);
        } else if (shirtImg) {
          // Default t-shirt — scale based on size, apply color tint
          tshirtW = sizeData.bodyWidth * pxPerInchW;
          tshirtH = sizeData.bodyLength * pxPerInchH;
          tshirtX = (W - tshirtW) / 2;
          tshirtY = H * 0.20 + (maxTshirtH - tshirtH) / 2;

          const imgW = shirtImg.naturalWidth || shirtImg.width;
          const imgH = shirtImg.naturalHeight || shirtImg.height;
          const imgAspect = imgW / imgH;
          const shirtPadding = 1.3;
          const shirtImgW = tshirtW * shirtPadding;
          const shirtImgH = shirtImgW / imgAspect;
          const shirtImgX = (W - shirtImgW) / 2;
          const shirtImgY = tshirtY - (shirtImgH - tshirtH) * 0.15;

          const offscreen = document.createElement('canvas');
          offscreen.width = W;
          offscreen.height = H;
          const offCtx = offscreen.getContext('2d');
          offCtx.imageSmoothingEnabled = true;
          offCtx.imageSmoothingQuality = 'high';
          offCtx.drawImage(shirtImg, shirtImgX, shirtImgY, shirtImgW, shirtImgH);
          // Accurate color tinting — constrained to shirt pixels
          offCtx.globalCompositeOperation = 'source-atop';
          offCtx.fillStyle = selectedColor.hex;
          offCtx.fillRect(0, 0, W, H);
          offCtx.globalCompositeOperation = 'luminosity';
          offCtx.drawImage(shirtImg, shirtImgX, shirtImgY, shirtImgW, shirtImgH);
          const hexD = selectedColor.hex.replace('#','');
          const lumD = (parseInt(hexD.substring(0,2),16)*0.299 + parseInt(hexD.substring(2,4),16)*0.587 + parseInt(hexD.substring(4,6),16)*0.114)/255;
          if (lumD < 0.4) {
            offCtx.globalCompositeOperation = 'source-atop';
            offCtx.globalAlpha = 0.2;
            offCtx.fillStyle = '#000000';
            offCtx.fillRect(0, 0, W, H);
            offCtx.globalAlpha = 1;
          }
          offCtx.globalCompositeOperation = 'destination-in';
          offCtx.drawImage(shirtImg, shirtImgX, shirtImgY, shirtImgW, shirtImgH);
          ctx.drawImage(offscreen, 0, 0);
        } else {
          // Vector fallback
          tshirtW = sizeData.bodyWidth * pxPerInchW;
          tshirtH = sizeData.bodyLength * pxPerInchH;
          tshirtX = (W - tshirtW) / 2;
          tshirtY = H * 0.20 + (maxTshirtH - tshirtH) / 2;
          drawMiniTshirt(ctx, selectedColor.hex, viewSide, tshirtX - tshirtW * 0.1, tshirtY - tshirtH * 0.05, tshirtW * 1.2, tshirtH * 1.1);
        }

        // Draw artwork
        if (!artwork) {
          resolve(canvas);
          return;
        }
        const img = new Image();
        img.onload = () => {
          // Calculate position — center artwork on shirt
          let artPxPerInch;
          if (isCustomGarment && taggedGarment && taggedGarment.bodyMapping) {
            const garmentBodyWidth = taggedGarment.bodyMapping.shirtWidthInches || sizeData.bodyWidth;
            artPxPerInch = tshirtW / garmentBodyWidth;
          } else {
            artPxPerInch = tshirtW / sizeData.bodyWidth;
          }

          const printW = artworkAreaSettings.width * artPxPerInch;
          const printH = artworkAreaSettings.height * artPxPerInch;
          const printX = tshirtX + (tshirtW - printW) / 2;
          const printY = tshirtY + (artworkAreaSettings.topOffset * artPxPerInch);

          // Calculate the target area where artwork should fit
          const targetW = artworkDimensions.width * artPxPerInch * artworkScale;
          const targetH = artworkDimensions.height * artPxPerInch * artworkScale;

          // Maintain aspect ratio within target bounding box
          const imgAR = img.naturalWidth / img.naturalHeight;
          const targetAR = targetW / targetH;
          let drawW, drawH;
          if (imgAR > targetAR) {
            drawW = targetW;
            drawH = targetW / imgAR;
          } else {
            drawH = targetH;
            drawW = targetH * imgAR;
          }

          // Position
          const scaleFactor = W / 700;
          const scaledPosX = artworkPosition.x * scaleFactor;
          const scaledPosY = artworkPosition.y * scaleFactor;
          const drawX2 = printX + (printW - drawW) / 2 + scaledPosX;
          const drawY2 = printY + scaledPosY;

          // === HIGH-QUALITY RENDERING STRATEGY ===
          // If artwork is being upscaled (target > source), use multi-step downscale
          // technique in reverse: draw at source size on intermediate canvas, then
          // use browser's high-quality bicubic to scale up
          const srcW = img.naturalWidth;
          const srcH = img.naturalHeight;
          const isUpscaling = drawW > srcW || drawH > srcH;

          if (isUpscaling) {
            // For upscaling: use an intermediate canvas at 2x the target size
            // then scale down to target — this gives sharper edges
            const interScale = Math.min(2, Math.max(1, srcW / drawW));
            // Draw source at native resolution, let browser scale up with high quality
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, srcW, srcH, drawX2, drawY2, drawW, drawH);
          } else {
            // Downscaling — use stepped downscaling for best quality
            // Step down by half until within 2x of target, then final draw
            let stepCanvas = document.createElement('canvas');
            let stepW = srcW;
            let stepH = srcH;
            stepCanvas.width = stepW;
            stepCanvas.height = stepH;
            const stepCtx = stepCanvas.getContext('2d');
            stepCtx.imageSmoothingEnabled = true;
            stepCtx.imageSmoothingQuality = 'high';
            stepCtx.drawImage(img, 0, 0);

            // Step down by halves
            while (stepW / 2 > drawW && stepH / 2 > drawH) {
              const nextW = Math.round(stepW / 2);
              const nextH = Math.round(stepH / 2);
              const nextCanvas = document.createElement('canvas');
              nextCanvas.width = nextW;
              nextCanvas.height = nextH;
              const nextCtx = nextCanvas.getContext('2d');
              nextCtx.imageSmoothingEnabled = true;
              nextCtx.imageSmoothingQuality = 'high';
              nextCtx.drawImage(stepCanvas, 0, 0, stepW, stepH, 0, 0, nextW, nextH);
              stepCanvas = nextCanvas;
              stepW = nextW;
              stepH = nextH;
            }

            // Final draw from stepped canvas to export canvas
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(stepCanvas, 0, 0, stepW, stepH, drawX2, drawY2, drawW, drawH);
          }

          // Artwork size values (used in both annotated and clean downloads)
          const artWidthInches = (artworkDimensions.width * artworkScale).toFixed(1);
          const artHeightInches = (artworkDimensions.height * artworkScale).toFixed(1);

          // Draw dimension annotations (only if enabled)
          if (showAnnotations) {
          const canvasTshirtX = tshirtX;
          const canvasTshirtY = tshirtY;
          const canvasTshirtW = tshirtW;
          const canvasTshirtH = tshirtH;
          const pxPerInchW = artPxPerInchW;
          const dimFont = 'bold 16px Inter, sans-serif';
          ctx.font = dimFont;
          ctx.textAlign = 'center';

          // Artwork size labels (what user set)
          const topFromCollar = artworkAreaSettings.topOffset.toFixed(1);
          // Side margin = (body width - artwork width) / 2
          const sideMarginInches = ((sizeData.bodyWidth - artworkDimensions.width * artworkScale) / 2).toFixed(1);

          // Width line (red, above artwork)
          ctx.strokeStyle = '#ef4444';
          ctx.fillStyle = '#ef4444';
          ctx.lineWidth = 2;
          const wLineY = drawY2 - 20;
          ctx.beginPath();
          ctx.moveTo(drawX2, wLineY);
          ctx.lineTo(drawX2 + artW, wLineY);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(drawX2, wLineY - 6);
          ctx.lineTo(drawX2, wLineY + 6);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(drawX2 + artW, wLineY - 6);
          ctx.lineTo(drawX2 + artW, wLineY + 6);
          ctx.stroke();
          ctx.fillText(`${artWidthInches}"`, drawX2 + artW / 2, wLineY - 8);

          // Height line (red, right side)
          const hLineX = drawX2 + artW + 20;
          ctx.beginPath();
          ctx.moveTo(hLineX, drawY2);
          ctx.lineTo(hLineX, drawY2 + artH);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(hLineX - 6, drawY2);
          ctx.lineTo(hLineX + 6, drawY2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(hLineX - 6, drawY2 + artH);
          ctx.lineTo(hLineX + 6, drawY2 + artH);
          ctx.stroke();
          ctx.save();
          ctx.translate(hLineX + 18, drawY2 + artH / 2);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(`${artHeightInches}"`, 0, 0);
          ctx.restore();

          // Top offset (blue, dashed) — from top of body area to artwork
          ctx.strokeStyle = '#2563eb';
          ctx.fillStyle = '#2563eb';
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(drawX2 + artW / 2, canvasTshirtY);
          ctx.lineTo(drawX2 + artW / 2, drawY2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(drawX2 + artW / 2 - 6, canvasTshirtY);
          ctx.lineTo(drawX2 + artW / 2 + 6, canvasTshirtY);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(drawX2 + artW / 2 - 6, drawY2);
          ctx.lineTo(drawX2 + artW / 2 + 6, drawY2);
          ctx.stroke();
          ctx.font = 'bold 14px Inter, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(`${topFromCollar}" from top`, drawX2 + artW / 2 + 10, canvasTshirtY + (drawY2 - canvasTshirtY) / 2 + 5);

          // Side margin (green) — calculated from actual shirt edges
          // Shirt width = bodyWidth, artwork is positioned at drawX2
          // Left gap = distance from shirt left edge to artwork left edge (in inches)
          // Right gap = distance from artwork right edge to shirt right edge (in inches)
          const artLeftEdgePx = drawX2;
          const artRightEdgePx = drawX2 + artW;
          const shirtLeftEdgePx = canvasTshirtX;
          const shirtRightEdgePx = canvasTshirtX + canvasTshirtW;

          const leftGapInches = ((artLeftEdgePx - shirtLeftEdgePx) / pxPerInchW).toFixed(1);
          const rightGapInches = ((shirtRightEdgePx - artRightEdgePx) / pxPerInchW).toFixed(1);

          const sideLineY = drawY2 + artH + 25;

          // Left gap line (green)
          ctx.strokeStyle = '#16a34a';
          ctx.fillStyle = '#16a34a';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(shirtLeftEdgePx, sideLineY);
          ctx.lineTo(artLeftEdgePx, sideLineY);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(shirtLeftEdgePx, sideLineY - 6);
          ctx.lineTo(shirtLeftEdgePx, sideLineY + 6);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(artLeftEdgePx, sideLineY - 6);
          ctx.lineTo(artLeftEdgePx, sideLineY + 6);
          ctx.stroke();
          ctx.textAlign = 'center';
          ctx.font = 'bold 14px Inter, sans-serif';
          ctx.fillText(`${leftGapInches}" left`, (shirtLeftEdgePx + artLeftEdgePx) / 2, sideLineY - 8);

          // Right gap line (green)
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(artRightEdgePx, sideLineY);
          ctx.lineTo(shirtRightEdgePx, sideLineY);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(artRightEdgePx, sideLineY - 6);
          ctx.lineTo(artRightEdgePx, sideLineY + 6);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(shirtRightEdgePx, sideLineY - 6);
          ctx.lineTo(shirtRightEdgePx, sideLineY + 6);
          ctx.stroke();
          ctx.fillText(`${rightGapInches}" right`, (artRightEdgePx + shirtRightEdgePx) / 2, sideLineY - 8);

          // Shirt width reference line
          const shirtWidthLineY = sideLineY + 30;
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(canvasTshirtX, shirtWidthLineY);
          ctx.lineTo(canvasTshirtX + canvasTshirtW, shirtWidthLineY);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(canvasTshirtX, shirtWidthLineY - 5);
          ctx.lineTo(canvasTshirtX, shirtWidthLineY + 5);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(canvasTshirtX + canvasTshirtW, shirtWidthLineY - 5);
          ctx.lineTo(canvasTshirtX + canvasTshirtW, shirtWidthLineY + 5);
          ctx.stroke();
          ctx.font = 'bold 12px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`Shirt width: ${isCustomGarment && taggedGarment?.bodyMapping?.shirtWidthInches ? taggedGarment.bodyMapping.shirtWidthInches : sizeData.bodyWidth}"`, canvasTshirtX + canvasTshirtW / 2, shirtWidthLineY + 16);

          // Shirt height (body length) reference line — left side
          const shirtHeightLineX = canvasTshirtX - 30;
          const shirtTopY = canvasTshirtY;
          const shirtBottomY = canvasTshirtY + canvasTshirtH;
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(shirtHeightLineX, shirtTopY);
          ctx.lineTo(shirtHeightLineX, shirtBottomY);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(shirtHeightLineX - 5, shirtTopY);
          ctx.lineTo(shirtHeightLineX + 5, shirtTopY);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(shirtHeightLineX - 5, shirtBottomY);
          ctx.lineTo(shirtHeightLineX + 5, shirtBottomY);
          ctx.stroke();
          // Label (rotated)
          ctx.save();
          ctx.translate(shirtHeightLineX - 14, (shirtTopY + shirtBottomY) / 2);
          ctx.rotate(-Math.PI / 2);
          ctx.font = 'bold 12px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`Shirt length: ${sizeData.bodyLength}"`, 0, 0);
          ctx.restore();

          // Draw body edge reference lines (thin, to show where body starts)
          ctx.strokeStyle = 'rgba(255,255,255,0.3)';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 4]);
          // Left body edge
          ctx.beginPath();
          ctx.moveTo(canvasTshirtX, canvasTshirtY);
          ctx.lineTo(canvasTshirtX, canvasTshirtY + canvasTshirtH);
          ctx.stroke();
          // Right body edge
          ctx.beginPath();
          ctx.moveTo(canvasTshirtX + canvasTshirtW, canvasTshirtY);
          ctx.lineTo(canvasTshirtX + canvasTshirtW, canvasTshirtY + canvasTshirtH);
          ctx.stroke();
          ctx.setLineDash([]);

          // Info labels below t-shirt — bold and readable
          const infoY = H - 44;

          // Background bar for readability
          ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
          ctx.fillRect(0, infoY - 14, W, 50);

          // Single line: Shirt size + Artwork size
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 26px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`Shirt: ${size}   |   Artwork Size: W ${artWidthInches}" × H ${artHeightInches}"`, W / 2, infoY + 16);

          } // end showAnnotations

          // Always show shirt size + artwork size bar (even on clean download)
          if (!showAnnotations) {
            const infoY2 = H - 44;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(0, infoY2 - 14, W, 50);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 26px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`Shirt: ${size}   |   Artwork Size: W ${artWidthInches}" × H ${artHeightInches}"`, W / 2, infoY2 + 16);
          }

          resolve(canvas);
        };
        img.onerror = () => resolve(canvas);
        img.src = artwork;
      };

      // Load garment: use tagged garment from library if available, else default
      if (taggedGarment && taggedGarment.dataUrl) {
        tshirtImg.onload = () => drawWithShirt(tshirtImg, true);
        tshirtImg.onerror = () => drawWithShirt(null, false);
        tshirtImg.src = taggedGarment.dataUrl;
      } else {
        // Try to load color-specific image, then white, then fallback
        tshirtImg.onload = () => drawWithShirt(tshirtImg, false);
        tshirtImg.onerror = () => {
          const fallback = new Image();
          fallback.onload = () => drawWithShirt(fallback, false);
          fallback.onerror = () => drawWithShirt(null, false);
          fallback.src = `/tshirts/white-${side}1.png`;
        };
        tshirtImg.src = `/tshirts/${colorName}-${side}.png`;
      }
    });
  };

  // Crop detection for high-res canvas (white background)
  const cropHighResCanvas = (sourceCanvas, size) => {
    const W = sourceCanvas.width;
    const H = sourceCanvas.height;

    // Read pixels directly from the source canvas
    let ctx;
    try { ctx = sourceCanvas.getContext('2d'); } catch(e) { return { top: 0, left: 0, w: W, h: H }; }
    
    // Scan in horizontal strips for speed
    let top = H, bottom = 0, left = W, right = 0;
    
    // Scan top→down to find first non-white row
    for (let y = 0; y < H && top === H; y += 4) {
      const row = ctx.getImageData(0, y, W, 1).data;
      for (let x = 0; x < W * 4; x += 16) {
        if (row[x] < 248 || row[x+1] < 248 || row[x+2] < 248) { top = y; break; }
      }
    }
    // Scan bottom→up
    for (let y = H - 1; y >= 0 && bottom === 0; y -= 4) {
      const row = ctx.getImageData(0, y, W, 1).data;
      for (let x = 0; x < W * 4; x += 16) {
        if (row[x] < 248 || row[x+1] < 248 || row[x+2] < 248) { bottom = y; break; }
      }
    }
    // Scan left→right
    for (let x = 0; x < W && left === W; x += 4) {
      const col = ctx.getImageData(x, top, 1, bottom - top + 1).data;
      for (let i = 0; i < col.length; i += 16) {
        if (col[i] < 248 || col[i+1] < 248 || col[i+2] < 248) { left = x; break; }
      }
    }
    // Scan right→left
    for (let x = W - 1; x >= 0 && right === 0; x -= 4) {
      const col = ctx.getImageData(x, top, 1, bottom - top + 1).data;
      for (let i = 0; i < col.length; i += 16) {
        if (col[i] < 248 || col[i+1] < 248 || col[i+2] < 248) { right = x; break; }
      }
    }

    if (top >= bottom || left >= right) {
      return { top: 0, left: 0, w: W, h: H };
    }
    return { top, left, w: right - left + 1, h: bottom - top + 1 };
  };

  // Create tightly cropped download canvas with layout:
  // 20px top → shirt → 20px gap → text → 20px bottom
  const createCroppedDownload = (sourceCanvas, size) => {
    const bounds = cropHighResCanvas(sourceCanvas, size);
    
    const topMargin = 10;
    const gap = 15;
    const textHeight = 30;
    const bottomMargin = 10;
    const sideMargin = 10;
    
    const cropW = bounds.w;
    const cropH = bounds.h;
    
    // Measure text width to ensure canvas is wide enough
    const sizeData = TSHIRT_SIZES[size];
    const artWidthInches = (artworkDimensions.width * artworkScale).toFixed(1);
    const artHeightInches = (artworkDimensions.height * artworkScale).toFixed(1);
    const text = `Shirt Size: ${size} | Artwork Size: W ${artWidthInches}" x H ${artHeightInches}"`;
    
    // Create temp canvas to measure text
    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d');
    measureCtx.font = 'bold 18px Inter, sans-serif';
    const textWidth = measureCtx.measureText(text).width + 40; // 20px padding each side
    
    // Final width = max of (shirt crop + margins) and (text width)
    const finalW = Math.max(cropW + sideMargin * 2, textWidth);
    const finalH = topMargin + cropH + gap + textHeight + bottomMargin;
    
    const dlCanvas = document.createElement('canvas');
    dlCanvas.width = finalW;
    dlCanvas.height = finalH;
    const dlCtx = dlCanvas.getContext('2d');
    
    dlCtx.fillStyle = '#ffffff';
    dlCtx.fillRect(0, 0, finalW, finalH);
    
    // Draw cropped shirt (centered horizontally)
    const shirtX = (finalW - cropW) / 2;
    dlCtx.drawImage(sourceCanvas, bounds.left, bounds.top, cropW, cropH, shirtX, topMargin, cropW, cropH);
    
    // Draw text centered
    dlCtx.font = 'bold 18px Inter, sans-serif';
    dlCtx.fillStyle = '#000000';
    dlCtx.textAlign = 'center';
    dlCtx.fillText(text, finalW / 2, topMargin + cropH + gap + 20);
    
    return dlCanvas;
  };

  // Download a single mockup with dimensions
  const downloadSingle = async (size) => {
    const canvas = await renderHighRes(size, true);
    const croppedCanvas = createCroppedDownload(canvas, size);
    try {
      const blob = await new Promise((resolve) => croppedCanvas.toBlob(resolve, 'image/png'));
      if (blob && blob.size > 0) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `mockup-${selectedColor.name}-${size}-${viewSide}.png`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } else {
        const link = document.createElement('a');
        link.download = `mockup-${selectedColor.name}-${size}-${viewSide}.png`;
        link.href = croppedCanvas.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (e) {
      const link = document.createElement('a');
      link.download = `mockup-${selectedColor.name}-${size}-${viewSide}.png`;
      link.href = croppedCanvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Download a single clean mockup (no annotations)
  const downloadClean = async (size) => {
    const canvas = await renderHighRes(size, false);
    const croppedCanvas = createCroppedDownload(canvas, size);
    try {
      const blob = await new Promise((resolve) => croppedCanvas.toBlob(resolve, 'image/png'));
      if (blob && blob.size > 0) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `mockup-clean-${selectedColor.name}-${size}-${viewSide}.png`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } else {
        const link = document.createElement('a');
        link.download = `mockup-clean-${selectedColor.name}-${size}-${viewSide}.png`;
        link.href = croppedCanvas.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (e) {
      const link = document.createElement('a');
      link.download = `mockup-clean-${selectedColor.name}-${size}-${viewSide}.png`;
      link.href = croppedCanvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Download all mockups with dimensions — 2 column grid in single file (cropped)
  const downloadAll = async () => {
    if (activeSizes.length === 0) { alert('Please select at least one size in "Generate Mockups" section.'); return; }
    
    // Render and crop each mockup
    const croppedCanvases = [];
    let maxW = 0, maxH = 0;
    for (let i = 0; i < activeSizes.length; i++) {
      const canvas = await renderHighRes(activeSizes[i], true);
      const cropped = createCroppedDownload(canvas, activeSizes[i]);
      croppedCanvases.push(cropped);
      if (cropped.width > maxW) maxW = cropped.width;
      if (cropped.height > maxH) maxH = cropped.height;
    }
    
    const cols = 2;
    const rows = Math.ceil(activeSizes.length / cols);
    const gap = 40;
    const totalW = cols * maxW + (cols - 1) * gap;
    const totalH = rows * maxH + (rows - 1) * gap;

    const gridCanvas = document.createElement('canvas');
    gridCanvas.width = totalW;
    gridCanvas.height = totalH;
    const gCtx = gridCanvas.getContext('2d');
    gCtx.fillStyle = '#ffffff';
    gCtx.fillRect(0, 0, totalW, totalH);

    for (let i = 0; i < croppedCanvases.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * (maxW + gap) + (maxW - croppedCanvases[i].width) / 2;
      const y = row * (maxH + gap) + (maxH - croppedCanvases[i].height) / 2;
      gCtx.drawImage(croppedCanvases[i], x, y);
    }

    try {
      const blob = await new Promise((resolve) => gridCanvas.toBlob(resolve, 'image/png'));
      if (blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `mockups-all-${activeSizes.length}-sizes.png`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
    } catch (e) {
      for (let i = 0; i < activeSizes.length; i++) {
        await downloadSingle(activeSizes[i]);
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  };

  // Download all clean mockups (no annotations) — 2 column grid (cropped)
  const downloadAllClean = async () => {
    if (activeSizes.length === 0) { alert('Please select at least one size in "Generate Mockups" section.'); return; }
    
    const croppedCanvases = [];
    let maxW = 0, maxH = 0;
    for (let i = 0; i < activeSizes.length; i++) {
      const canvas = await renderHighRes(activeSizes[i], false);
      const cropped = createCroppedDownload(canvas, activeSizes[i]);
      croppedCanvases.push(cropped);
      if (cropped.width > maxW) maxW = cropped.width;
      if (cropped.height > maxH) maxH = cropped.height;
    }
    
    const cols = 2;
    const rows = Math.ceil(activeSizes.length / cols);
    const gap = 40;
    const totalW = cols * maxW + (cols - 1) * gap;
    const totalH = rows * maxH + (rows - 1) * gap;

    const gridCanvas = document.createElement('canvas');
    gridCanvas.width = totalW;
    gridCanvas.height = totalH;
    const gCtx = gridCanvas.getContext('2d');
    gCtx.fillStyle = '#ffffff';
    gCtx.fillRect(0, 0, totalW, totalH);

    for (let i = 0; i < croppedCanvases.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * (maxW + gap) + (maxW - croppedCanvases[i].width) / 2;
      const y = row * (maxH + gap) + (maxH - croppedCanvases[i].height) / 2;
      gCtx.drawImage(croppedCanvases[i], x, y);
    }

    try {
      const blob = await new Promise((resolve) => gridCanvas.toBlob(resolve, 'image/png'));
      if (blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `mockups-clean-${activeSizes.length}-sizes.png`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
    } catch (e) {
      for (let i = 0; i < activeSizes.length; i++) {
        await downloadClean(activeSizes[i]);
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  };

  return (
    <div className="mockup-preview-section">
      <div className="mockup-header">
        <h3>Mockup Preview ({activeSizes.length})</h3>
        <p className="mockup-subtitle">
          1 design × 1 color × {activeSizes.length} sizes
        </p>
      </div>
      <div className="mockup-grid">
        {activeSizes.map((size) => (
          <MockupCard
            key={size}
            size={size}
            artwork={artwork}
            color={selectedColor}
            artworkDimensions={artworkDimensions}
            artworkPosition={artworkPosition}
            artworkScale={artworkScale}
            artworkAreaSettings={artworkAreaSettings}
            viewSide={viewSide}
            canvasRef={(el) => { mockupRefs.current[size] = el; }}
            onDownload={() => downloadSingle(size)}
            garmentLibrary={garmentLibrary}
          />
        ))}
      </div>
      <div className="mockup-actions">
        <button className="btn-download" onClick={downloadAll}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7,10 12,15 17,10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          With Dimensions ({activeSizes.length})
        </button>
        <button className="btn-download btn-download-clean" onClick={downloadAllClean}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7,10 12,15 17,10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Clean Mockups ({activeSizes.length})
        </button>
        <button className="btn-send-primary">
          Send Now
        </button>
      </div>
    </div>
  );
}

function MockupCard({ size, artwork, color, artworkDimensions, artworkPosition, artworkScale, artworkAreaSettings, viewSide, canvasRef, onDownload, garmentLibrary }) {
  const localCanvasRef = useRef(null);
  const [tshirtImg, setTshirtImg] = useState(null);

  // Combine refs
  const setRef = (el) => {
    localCanvasRef.current = el;
    if (canvasRef) canvasRef(el);
  };

  // Load t-shirt image — use tagged garment if available
  const [isCustomGarment, setIsCustomGarment] = useState(false);
  useEffect(() => {
    const taggedGarment = garmentLibrary && garmentLibrary.find(g => g.size === size && (g.side || 'front') === viewSide);
    if (taggedGarment && taggedGarment.dataUrl) {
      const img = new Image();
      img.onload = () => { setTshirtImg(img); setIsCustomGarment(true); };
      img.src = taggedGarment.dataUrl;
    } else {
      setIsCustomGarment(false);
      const side = viewSide === 'front' ? 'front' : 'back';
      const colorName = color.name.toLowerCase().replace(/\s+/g, '-');
      const img = new Image();
      img.onload = () => setTshirtImg(img);
      img.onerror = () => {
        const fallback = new Image();
        fallback.onload = () => setTshirtImg(fallback);
        fallback.onerror = () => setTshirtImg(null);
        fallback.src = `/tshirts/white-${side}1.png`;
      };
      img.src = `/tshirts/${colorName}-${side}.png`;
    }
  }, [viewSide, color, size, garmentLibrary]);

  useEffect(() => {
    const canvas = localCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = 200;
    const H = 240;

    ctx.clearRect(0, 0, W, H);

    // Draw t-shirt
    const sizeData = TSHIRT_SIZES[size];
    let tshirtW, tshirtH, tshirtX, tshirtY;

    if (tshirtImg) {
      const imgW = tshirtImg.naturalWidth || tshirtImg.width;
      const imgH = tshirtImg.naturalHeight || tshirtImg.height;
      const imgAspect = imgW / imgH;
      const canvasAspect = W / H;

      let dw, dh, dx, dy;
      if (imgAspect > canvasAspect) {
        dw = W;
        dh = W / imgAspect;
        dx = 0;
        dy = (H - dh) / 2;
      } else {
        dh = H;
        dw = H * imgAspect;
        dx = (W - dw) / 2;
        dy = 0;
      }

      if (isCustomGarment) {
        // Custom garment — body = drawn image area
        tshirtW = dw;
        tshirtH = dh;
        tshirtX = dx;
        tshirtY = dy;
      } else {
        // Default — use standard body mapping
        tshirtW = W * 0.52;
        tshirtH = H * 0.68;
        tshirtX = (W - tshirtW) / 2;
        tshirtY = H * 0.20;
      }

      // Draw with color tint
      const offscreen = document.createElement('canvas');
      offscreen.width = W;
      offscreen.height = H;
      const offCtx = offscreen.getContext('2d');
      const hex2 = color.hex.replace('#', '');
      const cr2 = parseInt(hex2.substring(0, 2), 16);
      const cg2 = parseInt(hex2.substring(2, 4), 16);
      const cb2 = parseInt(hex2.substring(4, 6), 16);

      offCtx.drawImage(tshirtImg, dx, dy, dw, dh);

      if (!(cr2 > 240 && cg2 > 240 && cb2 > 240)) {
        offCtx.globalCompositeOperation = 'source-atop';
        offCtx.fillStyle = color.hex;
        offCtx.fillRect(0, 0, W, H);
        offCtx.globalCompositeOperation = 'luminosity';
        offCtx.drawImage(tshirtImg, dx, dy, dw, dh);
        const lum2 = (cr2 * 0.299 + cg2 * 0.587 + cb2 * 0.114) / 255;
        if (lum2 < 0.4) {
          offCtx.globalCompositeOperation = 'source-atop';
          offCtx.globalAlpha = 0.2;
          offCtx.fillStyle = '#000000';
          offCtx.fillRect(0, 0, W, H);
          offCtx.globalAlpha = 1;
        }
        offCtx.globalCompositeOperation = 'source-over';
      }
      ctx.drawImage(offscreen, 0, 0);
    } else {
      tshirtW = W * 0.52;
      tshirtH = H * 0.68;
      tshirtX = (W - tshirtW) / 2;
      tshirtY = H * 0.20;
      drawMiniTshirt(ctx, color.hex, viewSide, tshirtX, tshirtY, tshirtW, tshirtH);
    }

    // Draw artwork
    if (artwork) {
      const img = new Image();
      img.onload = () => {
        // Use garment's own body width for custom garments
        let pxPerInch;
        if (isCustomGarment) {
          const taggedGarment = garmentLibrary && garmentLibrary.find(g => g.size === size && (g.side || 'front') === viewSide);
          const garmentBodyWidth = taggedGarment?.bodyMapping?.shirtWidthInches || sizeData.bodyWidth;
          pxPerInch = tshirtW / garmentBodyWidth;
        } else {
          pxPerInch = tshirtW / sizeData.bodyWidth;
        }
        const pxPerInchW = pxPerInch;
        const pxPerInchH = pxPerInch;

        // Fixed print area from settings
        const printW = artworkAreaSettings.width * pxPerInchW;
        const printH = artworkAreaSettings.height * pxPerInchH;
        const printX = tshirtX + (tshirtW - printW) / 2;
        const printY = tshirtY + (artworkAreaSettings.topOffset * pxPerInchH);

        // Artwork with aspect ratio preserved within bounding box
        const boxW = artworkDimensions.width * pxPerInchW * artworkScale;
        const boxH = artworkDimensions.height * pxPerInchH * artworkScale;
        const imgAR = img.naturalWidth / img.naturalHeight;
        const boxAR = boxW / boxH;
        let artW, artH;
        if (imgAR > boxAR) { artW = boxW; artH = boxW / imgAR; }
        else { artH = boxH; artW = boxH * imgAR; }

        const scaleFactor = W / 700;
        const scaledPosX = artworkPosition.x * scaleFactor;
        const scaledPosY = artworkPosition.y * scaleFactor;

        const drawX = printX + (printW - artW) / 2 + scaledPosX;
        const drawY = printY + scaledPosY;

        ctx.save();
        ctx.beginPath();
        ctx.rect(printX - 1, printY - 1, printW + 2, printH + 2);
        ctx.clip();
        ctx.drawImage(img, drawX, drawY, artW, artH);
        ctx.restore();
      };
      img.src = artwork;
    }
  }, [artwork, size, color, artworkDimensions, artworkPosition, artworkScale, artworkAreaSettings, viewSide, tshirtImg, isCustomGarment]);

  return (
    <div className="mockup-card">
      <canvas ref={setRef} width={200} height={240} className="mockup-canvas" />
      <div className="mockup-card-footer">
        <div className="mockup-card-info">
          <input type="checkbox" defaultChecked className="mockup-check" />
          <span className="mockup-size-label">{size}</span>
          <span className="mockup-dimensions">
            {(artworkDimensions.width * artworkScale).toFixed(1)}" × {(artworkDimensions.height * artworkScale).toFixed(1)}"
          </span>
        </div>
        <button className="mockup-download-btn" onClick={onDownload} title={`Download ${size} mockup`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7,10 12,15 17,10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function drawMiniTshirt(ctx, color, side, tshirtX, tshirtY, tshirtW, tshirtH) {
  const cx = tshirtX + tshirtW / 2;
  const shoulderY = tshirtY;
  const bodyBottom = tshirtY + tshirtH;
  const bodyLeft = tshirtX;
  const bodyRight = tshirtX + tshirtW;
  const sleeveOuterLeft = tshirtX - tshirtW * 0.18;
  const sleeveOuterRight = tshirtX + tshirtW + tshirtW * 0.18;
  const sleeveBottomY = tshirtY + tshirtH * 0.3;
  const collarWidth = tshirtW * 0.12;
  const collarDepth = side === 'front' ? tshirtH * 0.07 : tshirtH * 0.025;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(bodyLeft, sleeveBottomY);
  ctx.lineTo(sleeveOuterLeft + tshirtW * 0.04, sleeveBottomY - tshirtH * 0.05);
  ctx.lineTo(sleeveOuterLeft, shoulderY + tshirtH * 0.08);
  ctx.lineTo(bodyLeft - tshirtW * 0.02, shoulderY);
  ctx.lineTo(cx - collarWidth, shoulderY);
  ctx.quadraticCurveTo(cx, shoulderY + collarDepth, cx + collarWidth, shoulderY);
  ctx.lineTo(bodyRight + tshirtW * 0.02, shoulderY);
  ctx.lineTo(sleeveOuterRight, shoulderY + tshirtH * 0.08);
  ctx.lineTo(sleeveOuterRight - tshirtW * 0.04, sleeveBottomY - tshirtH * 0.05);
  ctx.lineTo(bodyRight, sleeveBottomY);
  ctx.lineTo(bodyRight - tshirtW * 0.01, bodyBottom);
  ctx.quadraticCurveTo(cx, bodyBottom + tshirtH * 0.01, bodyLeft + tshirtW * 0.01, bodyBottom);
  ctx.lineTo(bodyLeft, sleeveBottomY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const leftShade = ctx.createLinearGradient(bodyLeft, 0, bodyRight, 0);
  leftShade.addColorStop(0, 'rgba(0,0,0,0.06)');
  leftShade.addColorStop(0.2, 'rgba(0,0,0,0)');
  leftShade.addColorStop(0.8, 'rgba(0,0,0,0)');
  leftShade.addColorStop(1, 'rgba(0,0,0,0.06)');
  ctx.save();
  ctx.fillStyle = leftShade;
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - collarWidth, shoulderY);
  ctx.quadraticCurveTo(cx, shoulderY + collarDepth, cx + collarWidth, shoulderY);
  ctx.stroke();
}

export default MockupPreview;
