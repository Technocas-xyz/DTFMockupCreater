import React, { useRef, useEffect, useState } from 'react';
import { TSHIRT_SIZES, SIZE_ORDER } from '../constants/tshirtSizes';
import { drawRecoloredGarment } from '../utils/garmentTintEngine';
import './MultiSizePreview.css';

function MultiSizePreview({
  artwork,
  selectedColor,
  artworkDimensions,
  artworkPosition,
  artworkScale,
  artworkAreaSettings,
  selectedSizes,
  viewSide,
  garmentLibrary,
  scalingMode,
  baseSize,
  customGarment,
}) {
  const cardRefs = useRef({});

  if (!selectedSizes || selectedSizes.length === 0) return null;

  // Sort selected sizes by SIZE_ORDER
  const sortedSizes = [...selectedSizes].sort(
    (a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b)
  );

  // Calculate proportional scaling
  const baseSizeData = TSHIRT_SIZES[baseSize];
  const baseBodyWidth = baseSizeData ? baseSizeData.bodyWidth : 22;
  const basePercentage = (artworkDimensions.width / baseBodyWidth) * 100;

  // Magenta background crop detection — works for all shirt colors including white
  const detectShirtBounds = (sourceCanvas) => {
    const W = 700, H = 850;
    // Draw the shirt on a magenta background to detect bounds
    const detectCanvas = document.createElement('canvas');
    detectCanvas.width = W;
    detectCanvas.height = H;
    const dCtx = detectCanvas.getContext('2d');
    // Fill with magenta
    dCtx.fillStyle = '#FF00FF';
    dCtx.fillRect(0, 0, W, H);
    // Draw the source canvas on top
    dCtx.drawImage(sourceCanvas, 0, 0);
    // Scan for non-magenta pixels
    const imgData = dCtx.getImageData(0, 0, W, H);
    const { data } = imgData;
    let top = H, bottom = 0, left = W, right = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
        // Check if pixel is NOT magenta (R=255, G=0, B=255)
        // Allow small tolerance for anti-aliased edges
        if (a > 10 && !(r > 240 && g < 15 && b > 240)) {
          if (y < top) top = y;
          if (y > bottom) bottom = y;
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }
    // If nothing found, return full canvas
    if (top >= bottom || left >= right) {
      return { top: 0, left: 0, w: W, h: H };
    }
    return { top, left, w: right - left + 1, h: bottom - top + 1 };
  };

  // Download All handler — uses high-res canvas directly
  const handleDownloadAll = () => {
    const numSizes = sortedSizes.length;
    
    // First pass: find max crop dimensions across all cards using magenta detection
    let maxCropW = 0, maxCropH = 0;
    const cropData = [];
    
    sortedSizes.forEach((size) => {
      const ref = cardRefs.current[size];
      if (ref && ref.canvas) {
        const bounds = detectShirtBounds(ref.canvas);
        const pad = 10;
        const top = Math.max(0, bounds.top - pad);
        const left = Math.max(0, bounds.left - pad);
        const bottom = Math.min(849, bounds.top + bounds.h - 1 + pad);
        const right = Math.min(699, bounds.left + bounds.w - 1 + pad);
        const w = right - left + 1;
        const h = bottom - top + 1;
        if (w > maxCropW) maxCropW = w;
        if (h > maxCropH) maxCropH = h;
        cropData.push({ top, left, w, h });
      } else {
        cropData.push(null);
      }
    });

    // Use uniform card size (max of all crops)
    const cardW = maxCropW;
    const cardH = maxCropH;
    const topMargin = 20;
    const gap = 20;
    const textH = 35;
    const bottomMargin = 20;
    const cardGap = 20;
    const totalW = numSizes * (cardW + cardGap) - cardGap;
    const totalH = topMargin + cardH + gap + textH + bottomMargin;

    const combinedCanvas = document.createElement('canvas');
    combinedCanvas.width = totalW;
    combinedCanvas.height = totalH;
    const combCtx = combinedCanvas.getContext('2d');
    combCtx.fillStyle = '#ffffff';
    combCtx.fillRect(0, 0, totalW, totalH);

    sortedSizes.forEach((size, idx) => {
      const ref = cardRefs.current[size];
      const crop = cropData[idx];
      if (ref && ref.canvas && crop) {
        const x = idx * (cardW + cardGap);
        // Center this card's crop within the uniform card size
        const offsetX = (cardW - crop.w) / 2;
        const offsetY = (cardH - crop.h) / 2;
        combCtx.drawImage(ref.canvas, crop.left, crop.top, crop.w, crop.h, x + offsetX, topMargin + offsetY, crop.w, crop.h);

        // Text below shirt with 20px gap
        const artW = ref.artWidth || 0;
        const artH = ref.artHeight || 0;
        const realSize = size.includes('_') ? size.split('_')[0] : size;
        const text = `Shirt Size: ${realSize} | Artwork Size: W ${artW.toFixed(1)}" x H ${artH.toFixed(1)}"`;
        combCtx.font = 'bold 15px sans-serif';
        combCtx.fillStyle = '#000000';
        combCtx.textAlign = 'center';
        combCtx.fillText(text, x + cardW / 2, topMargin + cardH + gap + 15);
      }
    });

    try {
      combinedCanvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = 'mockup-comparison-all-sizes.png';
          link.href = url;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        }
      }, 'image/png');
    } catch (e) {
      const link = document.createElement('a');
      link.download = 'mockup-comparison-all-sizes.png';
      link.href = combinedCanvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="multi-size-preview">
      <div className="msp-header">
        <h3>Size Comparison</h3>
        <div className="msp-header-actions">
          <button className="msp-download-all-btn" onClick={handleDownloadAll} title="Download All Sizes">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download All
          </button>
          <span className="msp-mode-badge">
            {scalingMode === 'proportional' ? 'Proportional' : 'Same Size'}
          </span>
        </div>
      </div>
      <div className="msp-scroll-container">
        {sortedSizes.map((size) => (
          <MSPCard
            key={size}
            size={size}
            artwork={artwork}
            selectedColor={selectedColor}
            artworkDimensions={artworkDimensions}
            artworkPosition={artworkPosition}
            artworkScale={artworkScale}
            artworkAreaSettings={artworkAreaSettings}
            viewSide={viewSide}
            garmentLibrary={garmentLibrary}
            scalingMode={scalingMode}
            baseSize={baseSize}
            baseBodyWidth={baseBodyWidth}
            basePercentage={basePercentage}
            customGarment={customGarment}
            ref={(el) => { cardRefs.current[size] = el; }}
          />
        ))}
      </div>
    </div>
  );
}

const MSPCard = React.forwardRef(function MSPCard({
  size,
  artwork,
  selectedColor,
  artworkDimensions,
  artworkPosition,
  artworkScale,
  artworkAreaSettings,
  viewSide,
  garmentLibrary,
  scalingMode,
  baseSize,
  baseBodyWidth,
  basePercentage,
  customGarment,
}, ref) {
  const canvasRef = useRef(null);
  const [tshirtImg, setTshirtImg] = useState(null);
  const [isCustomGarment, setIsCustomGarment] = useState(false);
  const [percentOverride, setPercentOverride] = useState(null); // null = use calculated

  // Handle "sameShirt" mode: size key may be "XL_1234567890" — extract real size
  const realSize = size.includes('_') ? size.split('_')[0] : size;
  const sizeData = TSHIRT_SIZES[realSize];
  if (!sizeData) return null;

  // Calculate artwork dimensions for this size
  const defaultPercent = scalingMode === 'proportional' ? basePercentage : ((artworkDimensions.width / sizeData.bodyWidth) * 100);
  const activePercent = percentOverride !== null ? percentOverride : defaultPercent;

  const sizeArtW = (sizeData.bodyWidth * activePercent) / 100;
  const aspectRatio = artworkDimensions.height / artworkDimensions.width;
  const sizeArtH = sizeArtW * aspectRatio;

  const widthPercent = activePercent.toFixed(1);

  // Expose canvas and art dimensions via ref for Download All
  React.useImperativeHandle(ref, () => ({
    canvas: canvasRef.current,
    artWidth: sizeArtW,
    artHeight: sizeArtH,
    size,
  }));

  // Load garment image — use customGarment (from type selection) if available
  useEffect(() => {
    // Priority 1: Use the customGarment passed from parent (matches selected type like Hoodie)
    if (customGarment && customGarment.dataUrl) {
      const img = new Image();
      img.onload = () => { setTshirtImg(img); setIsCustomGarment(true); };
      img.src = customGarment.dataUrl;
      return;
    }
    // Priority 2: Find a tagged garment for this exact size + side in library
    const taggedGarment = garmentLibrary && garmentLibrary.find(
      (g) => g.size === realSize && (g.side || 'front') === viewSide
    );
    if (taggedGarment && taggedGarment.dataUrl) {
      const img = new Image();
      img.onload = () => { setTshirtImg(img); setIsCustomGarment(true); };
      img.src = taggedGarment.dataUrl;
    } else {
      setIsCustomGarment(false);
      const side = viewSide === 'front' ? 'front' : 'back';
      const img = new Image();
      img.onload = () => setTshirtImg(img);
      img.onerror = () => {
        const fallback = new Image();
        fallback.onload = () => setTshirtImg(fallback);
        fallback.onerror = () => setTshirtImg(null);
        fallback.src = `/tshirts/white-${side}1.png`;
      };
      img.src = `/tshirts/white-${side}1.png`;
    }
  }, [viewSide, selectedColor, size, garmentLibrary, customGarment]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    // EXACT SAME dimensions as DesignCanvas
    const W = 700;
    const H = 850;

    ctx.clearRect(0, 0, W, H);

    let tshirtW, tshirtH, tshirtX, tshirtY;
    let pxPerInch;

    // EXACT SAME calculation as DesignCanvas getPrintArea()
    if (tshirtImg) {

      if (isCustomGarment) {
        const taggedG = garmentLibrary && garmentLibrary.find(g => g.size === realSize && (g.side || 'front') === viewSide);
        const garmentBodyWidth = taggedG?.bodyMapping?.shirtWidthInches || sizeData.bodyWidth;
        const garmentBodyHeight = taggedG?.bodyMapping?.shirtHeightInches || sizeData.bodyLength;

        const maxBodyWidth = 32;
        const maxBodyHeight = 35;
        const maxTshirtW = W * 0.52;
        const maxTshirtH = H * 0.68;
        const refPxPerInchW = maxTshirtW / maxBodyWidth;
        const refPxPerInchH = maxTshirtH / maxBodyHeight;
        pxPerInch = Math.min(refPxPerInchW, refPxPerInchH);

        tshirtW = garmentBodyWidth * pxPerInch;
        tshirtH = garmentBodyHeight * pxPerInch;
        tshirtX = (W - tshirtW) / 2;
        tshirtY = (H - tshirtH) / 2;
      } else {
        // Default t-shirt: EXACT DesignCanvas formula
        const maxBodyWidth = 32;
        const maxBodyLength = 35;
        const maxTshirtW = W * 0.52;
        const maxTshirtH = H * 0.68;
        const pxPerInchW = maxTshirtW / maxBodyWidth;
        const pxPerInchH = maxTshirtH / maxBodyLength;
        pxPerInch = Math.min(pxPerInchW, pxPerInchH);

        tshirtW = sizeData.bodyWidth * pxPerInchW;
        tshirtH = sizeData.bodyLength * pxPerInchH;
        tshirtX = (W - tshirtW) / 2;
        tshirtY = H * 0.20 + (maxTshirtH - tshirtH) / 2;
      }

      // Draw garment image — match main DesignCanvas approach
      const garImgAspect = (tshirtImg.naturalWidth || tshirtImg.width) / (tshirtImg.naturalHeight || tshirtImg.height);
      let dw, dh, dx, dy;
      if (isCustomGarment) {
        dw = tshirtW;
        dh = tshirtH;
        dx = tshirtX;
        dy = tshirtY;
      } else {
        const shirtPadding = 1.3;
        dw = tshirtW * shirtPadding;
        dh = dw / garImgAspect;
        dx = (W - dw) / 2;
        dy = tshirtY - (dh - tshirtH) * 0.15;
      }

      // Draw with color tint using V2 engine
      const offscreen = document.createElement('canvas');
      offscreen.width = W;
      offscreen.height = H;
      const offCtx = offscreen.getContext('2d');
      drawRecoloredGarment(offCtx, tshirtImg, dx, dy, dw, dh, selectedColor.hex, W, H);
      ctx.drawImage(offscreen, 0, 0);
    } else {
      // No garment image — use vector fallback
      const maxBodyWidth = 32;
      const maxTshirtW = W * 0.52;
      const maxTshirtH = H * 0.68;
      pxPerInch = Math.min(maxTshirtW / maxBodyWidth, maxTshirtH / 35);
      tshirtW = sizeData.bodyWidth * pxPerInch;
      tshirtH = sizeData.bodyLength * pxPerInch;
      tshirtX = (W - tshirtW) / 2;
      tshirtY = H * 0.20 + (maxTshirtH - tshirtH) / 2;
      drawMiniTshirt(ctx, selectedColor.hex, viewSide, tshirtX, tshirtY, tshirtW, tshirtH);
    }

    // Draw artwork — SAME logic as DesignCanvas
    if (artwork) {
      const img = new Image();
      img.onload = () => {
        // Same pxPerInch as the shirt
        const artPxPerInch = pxPerInch;

        // Print area — exact same as DesignCanvas
        const printAreaPxW = artworkAreaSettings.width * artPxPerInch;
        const printAreaPxH = artworkAreaSettings.height * artPxPerInch;
        const printX = tshirtX + (tshirtW - printAreaPxW) / 2;
        const printY = tshirtY + (artworkAreaSettings.topOffset * artPxPerInch);

        // Artwork dimensions
        const artworkPxW = sizeArtW * artPxPerInch;
        const artworkPxH = sizeArtH * artPxPerInch;

        // Maintain aspect ratio — exact same as DesignCanvas
        const imgNatW = img.naturalWidth;
        const imgNatH = img.naturalHeight;
        const imgAR = imgNatW / imgNatH;
        const boxAR = artworkPxW / artworkPxH;
        let artW, artH;
        if (imgAR > boxAR) { artW = artworkPxW; artH = artworkPxW / imgAR; }
        else { artH = artworkPxH; artW = artworkPxH * imgAR; }

        // Center horizontally, align to TOP of print area vertically
        const drawX = printX + (printAreaPxW - artW) / 2 + artworkPosition.x;
        const drawY = printY + artworkPosition.y;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        // Clip artwork to shirt area so it doesn't overflow
        ctx.save();
        ctx.beginPath();
        ctx.rect(tshirtX, tshirtY, tshirtW, tshirtH);
        ctx.clip();
        ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, drawX, drawY, artW, artH);
        ctx.restore();
      };
      img.src = artwork;
    }
  }, [artwork, size, selectedColor, artworkDimensions, artworkPosition, artworkScale, artworkAreaSettings, viewSide, tshirtImg, isCustomGarment, sizeArtW, sizeArtH]);

  // Download single card — magenta background crop detection (works for white shirts)
  const handleDownloadSingle = () => {
    const sourceCanvas = canvasRef.current;
    if (!sourceCanvas) return;

    const W = sourceCanvas.width, H = sourceCanvas.height;
    const ctx = sourceCanvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, W, H);
    const d = imgData.data;

    // Find tight bounds — use strict threshold (< 240) to avoid catching anti-alias fuzz
    let top = H, bottom = 0, left = W, right = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * 4;
        if (d[idx] < 240 || d[idx+1] < 240 || d[idx+2] < 240) {
          if (y < top) top = y;
          if (y > bottom) bottom = y;
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }

    if (top >= bottom || left >= right) { top = 0; bottom = H-1; left = 0; right = W-1; }

    // Zero extra padding — just the content
    const cropW = right - left + 1;
    const cropH = bottom - top + 1;
    const text = `Shirt Size: ${realSize} | Artwork Size: W ${sizeArtW.toFixed(1)}" x H ${sizeArtH.toFixed(1)}"`;

    // Final canvas: shirt + text immediately below (no margins)
    const mCtx = document.createElement('canvas').getContext('2d');
    mCtx.font = 'bold 16px sans-serif';
    const textW = mCtx.measureText(text).width + 10;
    const finalW = Math.max(cropW, Math.ceil(textW));
    const finalH = cropH + 25; // just 10px gap + 15px text height

    const dlCanvas = document.createElement('canvas');
    dlCanvas.width = finalW;
    dlCanvas.height = finalH;
    const dlCtx = dlCanvas.getContext('2d');
    dlCtx.fillStyle = '#ffffff';
    dlCtx.fillRect(0, 0, finalW, finalH);

    // Shirt flush to top, centered horizontally
    const shirtX = Math.floor((finalW - cropW) / 2);
    dlCtx.drawImage(sourceCanvas, left, top, cropW, cropH, shirtX, 0, cropW, cropH);

    // Text right below shirt
    dlCtx.font = 'bold 16px sans-serif';
    dlCtx.fillStyle = '#000000';
    dlCtx.textAlign = 'center';
    dlCtx.fillText(text, finalW / 2, cropH + 18);

    const link = document.createElement('a');
    link.download = `mockup-${realSize}.png`;
    link.href = dlCanvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={`msp-card ${size === baseSize ? 'msp-card-base' : ''}`}>
      <div className="msp-canvas-wrapper">
        <canvas ref={canvasRef} width={700} height={850} className="msp-canvas" />
        <button className="msp-download-single-btn" onClick={handleDownloadSingle} title={`Download ${size} mockup`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
      </div>
      <div className="msp-info">
        <div className="msp-size-label">
          {realSize}
          {size === baseSize && <span className="msp-base-tag">Base</span>}
        </div>
        <div className="msp-slider-row">
          <input
            type="range"
            min="20"
            max="95"
            step="1"
            value={Math.round(activePercent)}
            onChange={(e) => setPercentOverride(parseFloat(e.target.value))}
            className="msp-percent-slider"
          />
          <span className="msp-percent-value">{Math.round(activePercent)}%</span>
        </div>
        <div className="msp-art-dimensions">
          W {sizeArtW.toFixed(1)}" × H {sizeArtH.toFixed(1)}"
        </div>
        <div className="msp-body-info">
          Body: {sizeData.bodyWidth}" × {sizeData.bodyLength}"
        </div>
      </div>
    </div>
  );
});

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
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;

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

export default MultiSizePreview;
