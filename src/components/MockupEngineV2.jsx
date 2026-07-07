import React, { useState, useRef, useCallback, useEffect } from 'react';
import { TSHIRT_SIZES, SIZE_ORDER, TSHIRT_COLORS } from '../constants/tshirtSizes';
import { detectApiBase } from '../utils/apiConfig';
import './MockupEngineV2.css';

// ═══════════════════════════════════════════════════════════════════════════════
// MOCKUP ENGINE V2 — Experimental high-quality renderer
// Renders directly from original source images, never from preview canvases.
// ═══════════════════════════════════════════════════════════════════════════════

const RENDER_RESOLUTIONS = [
  { label: '2K (2000×2400)', w: 2000, h: 2400 },
  { label: '4K (4000×4800)', w: 4000, h: 4800 },
  { label: '6K (6000×7200)', w: 6000, h: 7200 },
];

const QUALITY_MODES = ['preview', 'high', 'ultra'];

function MockupEngineV2({ garmentLibrary }) {
  // ─── STATE ──────────────────────────────────────────────────────────────────
  // Source images (never modified)
  const [originalArtwork, setOriginalArtwork] = useState(null); // { dataUrl, width, height, bitmap }
  const [garmentImage, setGarmentImage] = useState(null); // { dataUrl, width, height, bitmap }

  // Settings
  const [selectedSize, setSelectedSize] = useState('L');
  const [selectedColor, setSelectedColor] = useState(TSHIRT_COLORS[0]);
  const [viewSide, setViewSide] = useState('front');
  const [renderRes, setRenderRes] = useState(1); // index into RENDER_RESOLUTIONS
  const [qualityMode, setQualityMode] = useState('high');

  // Normalized placement (% of garment body)
  const [placement, setPlacement] = useState({ x: 50, y: 15, w: 60, h: 70, rotation: 0, scale: 1 });

  // Render pipeline state
  const [pipeline, setPipeline] = useState([]);
  const [diagnostics, setDiagnostics] = useState(null);
  const [isRendering, setIsRendering] = useState(false);
  const [renderedUrl, setRenderedUrl] = useState(null);
  const [renderTime, setRenderTime] = useState(0);

  // View
  const [zoom, setZoom] = useState(100);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [handTool, setHandTool] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [showComparison, setShowComparison] = useState(false);

  // Pipeline stages
  const [enabledStages, setEnabledStages] = useState({
    loadArtwork: true, loadGarment: true, transform: true,
    garmentRender: true, artworkPlace: true, lighting: true,
    shadow: true, texture: true, export: true,
  });

  const fileInputRef = useRef(null);
  const garmentInputRef = useRef(null);
  const previewRef = useRef(null);

  // ─── IMAGE LOADING (preserve originals) ──────────────────────────────────────
  const loadArtwork = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Store original — never resize
        const entry = { dataUrl: e.target.result, width: img.naturalWidth, height: img.naturalHeight, name: file.name, size: file.size };
        // Create ImageBitmap for rendering
        createImageBitmap(img).then(bitmap => {
          setOriginalArtwork({ ...entry, bitmap, img });
          addPipelineLog('Artwork loaded', `${img.naturalWidth}×${img.naturalHeight} (${(file.size/1024).toFixed(0)}KB)`);
        });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }, []);

  const loadGarmentFromLibrary = useCallback((garment) => {
    if (!garment || !garment.dataUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      createImageBitmap(img).then(bitmap => {
        setGarmentImage({ dataUrl: garment.dataUrl, width: img.naturalWidth, height: img.naturalHeight, bitmap, img, meta: garment });
        addPipelineLog('Garment loaded', `${img.naturalWidth}×${img.naturalHeight}`);
      });
    };
    img.src = garment.dataUrl;
  }, []);

  // Load default garment on mount or when size/library changes
  useEffect(() => {
    if (!garmentLibrary || garmentLibrary.length === 0) return;
    const match = garmentLibrary.find(g => g.size === selectedSize && (g.side || 'front') === viewSide);
    if (match) loadGarmentFromLibrary(match);
  }, [selectedSize, viewSide, garmentLibrary, loadGarmentFromLibrary]);

  const addPipelineLog = (stage, detail) => {
    setPipeline(prev => [...prev.slice(-20), { stage, detail, time: Date.now() }]);
  };

  // ─── V2 RENDER ENGINE ────────────────────────────────────────────────────────
  const renderMockup = useCallback(async () => {
    if (!originalArtwork) { addPipelineLog('Error', 'No artwork loaded'); return; }
    setIsRendering(true);
    setPipeline([]);
    const t0 = performance.now();
    const res = RENDER_RESOLUTIONS[renderRes];
    const W = res.w, H = res.h;

    addPipelineLog('Render Start', `${W}×${H} ${qualityMode}`);

    // Step 1: Create export canvas (never reuse editor canvas)
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Step 2: White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    addPipelineLog('Canvas Created', `${W}×${H}`);

    // Step 3: Draw garment (from original source)
    const sizeData = TSHIRT_SIZES[selectedSize];
    let garmentDrawn = false;
    let tshirtX, tshirtY, tshirtW, tshirtH;

    if (garmentImage && enabledStages.garmentRender) {
      const src = garmentImage.bitmap || garmentImage.img;
      const imgAspect = garmentImage.width / garmentImage.height;
      // Fill 88% of canvas width, maintain aspect
      const maxW = W * 0.88, maxH = H * 0.80;
      let dw, dh;
      if (imgAspect > maxW / maxH) { dw = maxW; dh = maxW / imgAspect; }
      else { dh = maxH; dw = maxH * imgAspect; }
      const dx = (W - dw) / 2, dy = (H - dh) / 2;
      tshirtX = dx; tshirtY = dy; tshirtW = dw; tshirtH = dh;

      // Color tint
      const offscreen = document.createElement('canvas');
      offscreen.width = W; offscreen.height = H;
      const offCtx = offscreen.getContext('2d');
      offCtx.imageSmoothingEnabled = true;
      offCtx.imageSmoothingQuality = 'high';
      offCtx.drawImage(src, dx, dy, dw, dh);

      const hex = selectedColor.hex.replace('#', '');
      const cr = parseInt(hex.substring(0,2),16), cg = parseInt(hex.substring(2,4),16), cb = parseInt(hex.substring(4,6),16);
      if (!(cr > 240 && cg > 240 && cb > 240)) {
        offCtx.globalCompositeOperation = 'source-atop';
        offCtx.fillStyle = selectedColor.hex;
        offCtx.globalAlpha = 0.75;
        offCtx.fillRect(0, 0, W, H);
        offCtx.globalAlpha = 1;
        offCtx.globalCompositeOperation = 'multiply';
        offCtx.globalAlpha = 0.5;
        offCtx.drawImage(src, dx, dy, dw, dh);
        offCtx.globalAlpha = 1;
        offCtx.globalCompositeOperation = 'source-over';
      }
      ctx.drawImage(offscreen, 0, 0);
      garmentDrawn = true;
      addPipelineLog('Garment Rendered', `${garmentImage.width}×${garmentImage.height} → ${Math.round(dw)}×${Math.round(dh)}`);
    } else {
      // Fallback: use size data to calculate body area
      const bw = sizeData?.bodyWidth || 22, bl = sizeData?.bodyLength || 30;
      const ppi = (W * 0.88) / bw;
      tshirtW = bw * ppi; tshirtH = bl * ppi;
      tshirtX = (W - tshirtW) / 2; tshirtY = (H - tshirtH) / 2;
      addPipelineLog('Garment Skipped', 'Using calculated body area');
    }

    // Step 4: Draw artwork DIRECTLY from original source (NEVER from preview)
    if (enabledStages.artworkPlace) {
      const src = originalArtwork.bitmap || originalArtwork.img;
      const srcW = originalArtwork.width, srcH = originalArtwork.height;

      // Convert normalized placement to pixels
      const artX = tshirtX + (placement.x / 100) * tshirtW - (placement.w / 100 * tshirtW) / 2;
      const artY = tshirtY + (placement.y / 100) * tshirtH;
      const artW = (placement.w / 100) * tshirtW * placement.scale;
      const artH = artW * (srcH / srcW); // maintain aspect ratio

      // CRITICAL: Draw from ORIGINAL source to export canvas in ONE operation
      // No intermediate canvases, no cached previews, no downscaled versions
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      if (placement.rotation !== 0) {
        ctx.save();
        ctx.translate(artX + artW / 2, artY + artH / 2);
        ctx.rotate((placement.rotation * Math.PI) / 180);
        ctx.drawImage(src, 0, 0, srcW, srcH, -artW / 2, -artH / 2, artW, artH);
        ctx.restore();
      } else {
        ctx.drawImage(src, 0, 0, srcW, srcH, artX, artY, artW, artH);
      }

      addPipelineLog('Artwork Placed', `${srcW}×${srcH} → ${Math.round(artW)}×${Math.round(artH)} (ratio: ${(artW/srcW).toFixed(2)}×)`);

      // Quality diagnostic
      const scalingRatio = artW / srcW;
      if (scalingRatio > 1) addPipelineLog('⚠ Upscaling', `${(scalingRatio*100).toFixed(0)}% — source smaller than render target`);
    }

    // Step 5: Lighting effect (subtle gradient overlay)
    if (enabledStages.lighting) {
      const grad = ctx.createRadialGradient(W*0.4, H*0.3, W*0.1, W*0.5, H*0.5, W*0.7);
      grad.addColorStop(0, 'rgba(255,255,255,0.03)');
      grad.addColorStop(1, 'rgba(0,0,0,0.02)');
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = grad;
      ctx.fillRect(tshirtX, tshirtY, tshirtW, tshirtH);
      ctx.globalCompositeOperation = 'source-over';
      addPipelineLog('Lighting Applied', 'Subtle radial gradient');
    }

    // Step 6: Export
    const t1 = performance.now();
    const elapsed = Math.round(t1 - t0);
    setRenderTime(elapsed);
    addPipelineLog('Render Complete', `${elapsed}ms`);

    // Diagnostics
    setDiagnostics({
      artworkSource: originalArtwork ? `${originalArtwork.width}×${originalArtwork.height}` : '—',
      garmentSource: garmentImage ? `${garmentImage.width}×${garmentImage.height}` : '—',
      renderResolution: `${W}×${H}`,
      scalingRatio: originalArtwork ? ((placement.w/100*tshirtW) / originalArtwork.width).toFixed(3) : '—',
      drawImageCalls: enabledStages.garmentRender && enabledStages.artworkPlace ? 2 : 1,
      renderTime: `${elapsed}ms`,
      imageBitmapUsed: !!(originalArtwork?.bitmap || garmentImage?.bitmap),
    });

    // Generate output URL
    const url = canvas.toDataURL('image/png');
    setRenderedUrl(url);
    setIsRendering(false);
  }, [originalArtwork, garmentImage, selectedSize, selectedColor, renderRes, qualityMode, placement, enabledStages]);

  // ─── NAVIGATION ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const kd = (e) => { if (e.code === 'Space' && !e.repeat && e.target.tagName !== 'INPUT') { e.preventDefault(); setSpaceHeld(true); } };
    const ku = (e) => { if (e.code === 'Space') setSpaceHeld(false); };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, []);

  const canPan = zoom > 100 || handTool || spaceHeld;
  const handlePanStart = (e) => { if (!canPan) return; e.preventDefault(); setIsPanning(true); setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y }); };
  const handlePanMove = (e) => { if (!isPanning) return; setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y }); };
  const handlePanEnd = () => setIsPanning(false);
  const handleWheel = (e) => { e.preventDefault(); setZoom(z => Math.max(25, Math.min(1600, z + (e.deltaY < 0 ? 50 : -50)))); };

  const handleExport = () => {
    if (!renderedUrl) return;
    const link = document.createElement('a');
    link.download = `mockup-v2-${selectedSize}-${RENDER_RESOLUTIONS[renderRes].label}.png`;
    link.href = renderedUrl;
    link.click();
  };

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="mv2-page">
      <header className="mv2-header">
        <div className="mv2-header-left">
          <h1 className="mv2-title">Mockup Engine V2 <span className="mv2-beta">Beta</span></h1>
          <span className="mv2-subtitle">Experimental High-Quality Renderer</span>
        </div>
        <div className="mv2-header-right">
          <button className="mv2-btn mv2-btn-primary" onClick={renderMockup} disabled={!originalArtwork || isRendering}>
            {isRendering ? '⏳ Rendering...' : '▶ Render Mockup'}
          </button>
          <button className="mv2-btn mv2-btn-outline" onClick={handleExport} disabled={!renderedUrl}>Export PNG</button>
        </div>
      </header>

      <div className="mv2-layout">
        {/* ═══ LEFT PANEL ═══ */}
        <aside className="mv2-left">
          <div className="mv2-card">
            <h3 className="mv2-card-title">Artwork Source</h3>
            {originalArtwork ? (
              <div className="mv2-source-info">
                <div className="mv2-info-row"><span>File</span><span>{originalArtwork.name}</span></div>
                <div className="mv2-info-row"><span>Resolution</span><span>{originalArtwork.width}×{originalArtwork.height}</span></div>
                <div className="mv2-info-row"><span>DPI (10.75")</span><span>~{Math.round(originalArtwork.width/10.75)}</span></div>
                <div className="mv2-info-row"><span>Size</span><span>{(originalArtwork.size/1024).toFixed(0)} KB</span></div>
                <div className="mv2-info-row"><span>ImageBitmap</span><span>{originalArtwork.bitmap ? '✓' : '✕'}</span></div>
                <button className="mv2-btn mv2-btn-sm" onClick={() => fileInputRef.current?.click()}>Replace</button>
              </div>
            ) : (
              <button className="mv2-btn mv2-btn-primary mv2-btn-full" onClick={() => fileInputRef.current?.click()}>Upload Artwork</button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" style={{display:'none'}} onChange={(e) => loadArtwork(e.target.files[0])} />
          </div>

          <div className="mv2-card">
            <h3 className="mv2-card-title">Garment</h3>
            <div className="mv2-setting">
              <label>Size</label>
              <select value={selectedSize} onChange={(e) => setSelectedSize(e.target.value)}>
                {SIZE_ORDER.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="mv2-setting">
              <label>Color</label>
              <select value={selectedColor.name} onChange={(e) => setSelectedColor(TSHIRT_COLORS.find(c => c.name === e.target.value) || TSHIRT_COLORS[0])}>
                {TSHIRT_COLORS.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div className="mv2-setting">
              <label>View</label>
              <div className="mv2-toggle-row">
                <button className={`mv2-toggle ${viewSide==='front'?'active':''}`} onClick={() => setViewSide('front')}>Front</button>
                <button className={`mv2-toggle ${viewSide==='back'?'active':''}`} onClick={() => setViewSide('back')}>Back</button>
              </div>
            </div>
            {garmentImage && <div className="mv2-info-row"><span>Garment Res</span><span>{garmentImage.width}×{garmentImage.height}</span></div>}
          </div>

          <div className="mv2-card">
            <h3 className="mv2-card-title">Placement (Normalized %)</h3>
            <div className="mv2-setting"><label>X Position ({placement.x}%)</label><input type="range" min="10" max="90" value={placement.x} onChange={e => setPlacement(p => ({...p, x: +e.target.value}))} /></div>
            <div className="mv2-setting"><label>Y Position ({placement.y}%)</label><input type="range" min="5" max="60" value={placement.y} onChange={e => setPlacement(p => ({...p, y: +e.target.value}))} /></div>
            <div className="mv2-setting"><label>Width ({placement.w}%)</label><input type="range" min="20" max="90" value={placement.w} onChange={e => setPlacement(p => ({...p, w: +e.target.value}))} /></div>
            <div className="mv2-setting"><label>Scale ({placement.scale}×)</label><input type="range" min="0.5" max="2" step="0.05" value={placement.scale} onChange={e => setPlacement(p => ({...p, scale: +e.target.value}))} /></div>
            <div className="mv2-setting"><label>Rotation ({placement.rotation}°)</label><input type="range" min="-45" max="45" value={placement.rotation} onChange={e => setPlacement(p => ({...p, rotation: +e.target.value}))} /></div>
          </div>

          <div className="mv2-card">
            <h3 className="mv2-card-title">Render Settings</h3>
            <div className="mv2-setting">
              <label>Resolution</label>
              <select value={renderRes} onChange={e => setRenderRes(+e.target.value)}>
                {RENDER_RESOLUTIONS.map((r, i) => <option key={i} value={i}>{r.label}</option>)}
              </select>
            </div>
            <div className="mv2-setting">
              <label>Quality</label>
              <select value={qualityMode} onChange={e => setQualityMode(e.target.value)}>
                {QUALITY_MODES.map(q => <option key={q} value={q}>{q}</option>)}
              </select>
            </div>
          </div>
        </aside>

        {/* ═══ CENTER PANEL ═══ */}
        <section className="mv2-center">
          <div className="mv2-toolbar">
            <div className="mv2-zoom-bar">
              <button className="mv2-zoom-btn" onClick={() => setZoom(z => Math.max(25, z-50))}>−</button>
              <span>{zoom}%</span>
              <button className="mv2-zoom-btn" onClick={() => setZoom(z => Math.min(1600, z+50))}>+</button>
              <button className="mv2-zoom-btn" onClick={() => { setZoom(100); setPanOffset({x:0,y:0}); }}>Fit</button>
              <button className={`mv2-zoom-btn ${handTool?'active':''}`} onClick={() => setHandTool(h=>!h)}>✋</button>
            </div>
            {renderTime > 0 && <span className="mv2-render-time">Rendered in {renderTime}ms</span>}
          </div>

          <div className="mv2-canvas-area" ref={previewRef} onWheel={handleWheel}>
            {isRendering && <div className="mv2-processing"><div className="mv2-spinner" /><p>Rendering...</p></div>}
            {renderedUrl ? (
              <div className="mv2-viewport" style={{ transform: `scale(${zoom/100}) translate(${panOffset.x/(zoom/100)}px, ${panOffset.y/(zoom/100)}px)`, cursor: canPan ? (isPanning ? 'grabbing' : 'grab') : 'default' }}
                onMouseDown={handlePanStart} onMouseMove={handlePanMove} onMouseUp={handlePanEnd} onMouseLeave={handlePanEnd}>
                <img src={renderedUrl} alt="Mockup V2" className="mv2-render-img" />
              </div>
            ) : (
              <div className="mv2-empty">
                <p>Upload artwork and click "Render Mockup" to begin</p>
                <span>V2 engine renders directly from original source — no quality loss</span>
              </div>
            )}
          </div>
        </section>

        {/* ═══ RIGHT PANEL ═══ */}
        <aside className="mv2-right">
          <div className="mv2-card">
            <h3 className="mv2-card-title">Pipeline Stages</h3>
            <div className="mv2-stages">
              {Object.entries(enabledStages).map(([key, enabled]) => (
                <label key={key} className="mv2-stage-row">
                  <input type="checkbox" checked={enabled} onChange={() => setEnabledStages(p => ({...p, [key]: !p[key]}))} />
                  <span>{key}</span>
                </label>
              ))}
            </div>
          </div>

          {diagnostics && (
            <div className="mv2-card">
              <h3 className="mv2-card-title">Diagnostics</h3>
              <div className="mv2-diag">
                <div className="mv2-info-row"><span>Artwork Source</span><span>{diagnostics.artworkSource}</span></div>
                <div className="mv2-info-row"><span>Garment Source</span><span>{diagnostics.garmentSource}</span></div>
                <div className="mv2-info-row"><span>Render Res</span><span>{diagnostics.renderResolution}</span></div>
                <div className="mv2-info-row"><span>Scaling Ratio</span><span>{diagnostics.scalingRatio}×</span></div>
                <div className="mv2-info-row"><span>drawImage Calls</span><span>{diagnostics.drawImageCalls}</span></div>
                <div className="mv2-info-row"><span>Render Time</span><span>{diagnostics.renderTime}</span></div>
                <div className="mv2-info-row"><span>ImageBitmap</span><span>{diagnostics.imageBitmapUsed ? '✓ Yes' : '✕ No'}</span></div>
              </div>
            </div>
          )}

          <div className="mv2-card">
            <h3 className="mv2-card-title">Render Log</h3>
            <div className="mv2-log">
              {pipeline.length === 0 ? <p className="mv2-muted">No render yet</p> :
                pipeline.map((entry, i) => <div key={i} className="mv2-log-entry"><strong>{entry.stage}</strong> {entry.detail}</div>)}
            </div>
          </div>

          <div className="mv2-card">
            <h3 className="mv2-card-title">Export</h3>
            <div className="mv2-export-btns">
              <button className="mv2-btn mv2-btn-primary" onClick={handleExport} disabled={!renderedUrl}>Download PNG</button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default MockupEngineV2;
