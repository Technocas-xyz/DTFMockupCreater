import React, { useRef, useEffect, useState } from 'react';
import { TSHIRT_SIZES, SIZE_ORDER } from '../constants/tshirtSizes';
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

  // Download All handler — uses high-res canvas directly
  const handleDownloadAll = () => {
    const numSizes = sortedSizes.length;
    const cardW = 700;
    const cardH = 850;
    const gap = 40;
    const totalW = numSizes * (cardW + gap) - gap;
    const totalH = 950;

    const combinedCanvas = document.createElement('canvas');
    combinedCanvas.width = totalW;
    combinedCanvas.height = totalH;
    const combCtx = combinedCanvas.getContext('2d');

    // White background
    combCtx.fillStyle = '#ffffff';
    combCtx.fillRect(0, 0, totalW, totalH);

    sortedSizes.forEach((size, idx) => {
      const ref = cardRefs.current[size];
      if (ref && ref.canvas) {
        const x = idx * (cardW + gap);
        combCtx.drawImage(ref.canvas, x, 0, cardW, cardH);

        // Draw text below
        const artW = ref.artWidth || 0;
        const artH = ref.artHeight || 0;
        const realSize = size.includes('_') ? size.split('_')[0] : size;
        const text = `Size: ${realSize} | Artwork Size: W ${artW.toFixed(2)}" × H ${artH.toFixed(2)}"`;
        combCtx.font = `bold 36px sans-serif`;
        combCtx.fillStyle = '#000000';
        combCtx.textAlign = 'center';
        combCtx.fillText(text, x + cardW / 2, 1460);
      }
    });

    // Download
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

  // Load garment image
  useEffect(() => {
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
        fallback.src = `/tshirts/white-${side}.png`;
      };
      img.src = `/tshirts/white-${side}.png`;
    }
  }, [viewSide, selectedColor, size, garmentLibrary]);

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

      // Draw with color tint
      const offscreen = document.createElement('canvas');
      offscreen.width = W;
      offscreen.height = H;
      const offCtx = offscreen.getContext('2d');
      const hex2 = selectedColor.hex.replace('#', '');
      const cr2 = parseInt(hex2.substring(0, 2), 16);
      const cg2 = parseInt(hex2.substring(2, 4), 16);
      const cb2 = parseInt(hex2.substring(4, 6), 16);

      offCtx.drawImage(tshirtImg, dx, dy, dw, dh);

      if (!(cr2 > 240 && cg2 > 240 && cb2 > 240)) {
        offCtx.globalCompositeOperation = 'source-atop';
        offCtx.fillStyle = selectedColor.hex;
        offCtx.globalAlpha = 0.75;
        offCtx.fillRect(0, 0, W, H);
        offCtx.globalAlpha = 1;
        offCtx.globalCompositeOperation = 'multiply';
        offCtx.globalAlpha = 0.5;
        offCtx.drawImage(tshirtImg, dx, dy, dw, dh);
        offCtx.globalAlpha = 1;
        offCtx.globalCompositeOperation = 'source-over';
      }
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

        // Center within print area + position offset
        const drawX = printX + (printAreaPxW - artW) / 2 + artworkPosition.x;
        const drawY = printY + (printAreaPxH - artH) / 2 + artworkPosition.y;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        // Clip artwork to shirt area so it doesn't overflow
        ctx.save();
        ctx.beginPath();
        ctx.rect(tshirtX, tshirtY, tshirtW, tshirtH);
        ctx.clip();
        ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, drawX, drawY, artW, artH);
        ctx.restore();

        // Draw rulers for debugging/verification
        const rulerPpi = artPxPerInch;
        ctx.strokeStyle = 'rgba(100,100,100,0.4)';
        ctx.fillStyle = 'rgba(50,50,50,0.6)';
        ctx.lineWidth = 1;
        ctx.font = '18px sans-serif';
        // Top ruler
        ctx.textAlign = 'center';
        const maxW = Math.ceil(sizeData.bodyWidth);
        for (let i = 0; i <= maxW; i++) {
          const x = tshirtX + i * rulerPpi;
          const tick = i % 5 === 0 ? 12 : 6;
          ctx.beginPath();
          ctx.moveTo(x, tshirtY - 20);
          ctx.lineTo(x, tshirtY - 20 + tick);
          ctx.stroke();
          if (i % 5 === 0) ctx.fillText(`${i}"`, x, tshirtY - 25);
        }
        // Left ruler
        ctx.textAlign = 'right';
        const maxH = Math.ceil(sizeData.bodyLength);
        for (let i = 0; i <= maxH; i++) {
          const y = tshirtY + i * rulerPpi;
          const tick = i % 5 === 0 ? 12 : 6;
          ctx.beginPath();
          ctx.moveTo(tshirtX - 20, y);
          ctx.lineTo(tshirtX - 20 + tick, y);
          ctx.stroke();
          if (i % 5 === 0) ctx.fillText(`${i}"`, tshirtX - 24, y + 5);
        }
      };
      img.src = artwork;
    }
  }, [artwork, size, selectedColor, artworkDimensions, artworkPosition, artworkScale, artworkAreaSettings, viewSide, tshirtImg, isCustomGarment, sizeArtW, sizeArtH]);

  // Download single card
  const handleDownloadSingle = () => {
    const sourceCanvas = canvasRef.current;
    if (!sourceCanvas) return;

    const dlCanvas = document.createElement('canvas');
    dlCanvas.width = 700;
    dlCanvas.height = 950;
    const dlCtx = dlCanvas.getContext('2d');

    dlCtx.fillStyle = '#ffffff';
    dlCtx.fillRect(0, 0, 700, 950);

    // Draw shirt canvas
    dlCtx.drawImage(sourceCanvas, 0, 0, 700, 850);

    // Draw text below
    const text = `Size: ${realSize} | Artwork Size: W ${sizeArtW.toFixed(2)}" × H ${sizeArtH.toFixed(2)}"`;
    dlCtx.font = `bold 22px sans-serif`;
    dlCtx.fillStyle = '#000000';
    dlCtx.textAlign = 'center';
    dlCtx.fillText(text, 350, 910);

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
