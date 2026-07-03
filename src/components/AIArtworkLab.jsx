import React, { useState, useRef, useCallback, useEffect } from 'react';
import { removeBackgroundBalanced, cleanEdges } from '../utils/bgRemovalUtils';
import './AIArtworkLab.css';

// ─── PIPELINE MODULES (modular, replaceable) ─────────────────────────────────
const PIPELINE_STAGES = [
  { id: 'analyze', label: 'Image Analysis', icon: '🔍' },
  { id: 'classify', label: 'Artwork Classification', icon: '🏷️' },
  { id: 'bgDetect', label: 'Background Detection', icon: '🎯' },
  { id: 'segment', label: 'Subject Segmentation', icon: '✂️' },
  { id: 'components', label: 'Connected Components', icon: '🧩' },
  { id: 'bgRemove', label: 'Background Removal', icon: '🗑️' },
  { id: 'alphaRefine', label: 'Alpha Refinement', icon: '🌊' },
  { id: 'edgeRepair', label: 'Edge Repair', icon: '🔧' },
  { id: 'haloRemove', label: 'Halo Removal', icon: '💫' },
  { id: 'qa', label: 'Quality Analysis', icon: '✅' },
];

// ─── IMAGE ANALYSIS UTILITIES ─────────────────────────────────────────────────
function analyzeImage(imageData) {
  const { data, width, height } = imageData;
  const totalPixels = width * height;
  let transparentCount = 0, opaqueCount = 0;
  let rSum = 0, gSum = 0, bSum = 0;
  const colorBuckets = {};
  let edgeDensity = 0;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 10) { transparentCount++; continue; }
    opaqueCount++;
    rSum += data[i]; gSum += data[i+1]; bSum += data[i+2];
    const qr = Math.round(data[i]/32)*32, qg = Math.round(data[i+1]/32)*32, qb = Math.round(data[i+2]/32)*32;
    const key = `${qr},${qg},${qb}`;
    colorBuckets[key] = (colorBuckets[key] || 0) + 1;
  }

  // Edge density (simple Sobel magnitude sampling)
  for (let y = 1; y < height - 1; y += 3) {
    for (let x = 1; x < width - 1; x += 3) {
      const idx = (y * width + x) * 4;
      const gx = Math.abs(data[idx] - data[idx + 4]) + Math.abs(data[idx+1] - data[idx+5]);
      const gy = Math.abs(data[idx] - data[idx + width*4]) + Math.abs(data[idx+1] - data[(idx + width*4)+1]);
      if (gx + gy > 60) edgeDensity++;
    }
  }

  const uniqueColors = Object.keys(colorBuckets).length;
  const dominantColors = Object.entries(colorBuckets).sort((a,b) => b[1] - a[1]).slice(0, 5).map(([k,v]) => ({
    color: `rgb(${k})`, count: v, percent: ((v/opaqueCount)*100).toFixed(1)
  }));
  const hasTransparency = transparentCount > totalPixels * 0.01;
  const avgColor = opaqueCount > 0 ? { r: Math.round(rSum/opaqueCount), g: Math.round(gSum/opaqueCount), b: Math.round(bSum/opaqueCount) } : { r: 128, g: 128, b: 128 };
  const edgePct = (edgeDensity / (width * height / 9) * 100).toFixed(1);
  const entropy = Math.min(100, uniqueColors * 0.5);

  // Classify artwork type
  let artworkType = 'illustration', confidence = 85;
  if (hasTransparency && uniqueColors < 50) { artworkType = 'transparent-png'; confidence = 95; }
  else if (uniqueColors < 30) { artworkType = 'logo'; confidence = 90; }
  else if (uniqueColors > 500 && parseFloat(edgePct) > 15) { artworkType = 'photograph'; confidence = 88; }
  else if (uniqueColors > 300) { artworkType = 'watercolor'; confidence = 72; }
  else if (uniqueColors >= 80 && uniqueColors <= 300) { artworkType = 'vintage-design'; confidence = 80; }

  // Background type detection
  let bgType = 'transparent';
  if (!hasTransparency) {
    const topRow = [], bottomRow = [];
    for (let x = 0; x < width; x++) {
      topRow.push(data[x*4], data[x*4+1], data[x*4+2]);
      const bi = ((height-1)*width+x)*4;
      bottomRow.push(data[bi], data[bi+1], data[bi+2]);
    }
    const avgTop = topRow.reduce((s,v)=>s+v,0)/topRow.length;
    if (avgTop > 240) bgType = 'solid-white';
    else if (avgTop < 20) bgType = 'solid-black';
    else bgType = 'solid-color';
  }

  // DPI estimation
  const estDpi = Math.round(width / 10.75);
  const printW = (width / 300).toFixed(1);
  const printH = (height / 300).toFixed(1);

  return {
    width, height, totalPixels, opaqueCount, transparentCount,
    hasTransparency, uniqueColors, dominantColors, avgColor,
    edgeDensity: parseFloat(edgePct), entropy,
    artworkType, confidence, bgType,
    dpi: estDpi, printSize: `${printW}" × ${printH}"`,
    complexity: uniqueColors > 200 ? 'High' : uniqueColors > 50 ? 'Medium' : 'Low',
  };
}

// ─── COMPONENT ──────────────────────────────────────────────────────────────
function AIArtworkLab({ sharedArtwork, onSendToQA, onSendToMockup }) {
  // Image state
  const [originalImage, setOriginalImage] = useState(null);
  const [processedImage, setProcessedImage] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imageDimensions, setImageDimensions] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Analysis
  const [analysis, setAnalysis] = useState(null);
  const [processingLog, setProcessingLog] = useState([]);
  const [pipelineStatus, setPipelineStatus] = useState({});
  const [enabledStages, setEnabledStages] = useState(
    PIPELINE_STAGES.reduce((acc, s) => ({ ...acc, [s.id]: true }), {})
  );

  // Quality report
  const [qualityReport, setQualityReport] = useState(null);

  // View state
  const [zoom, setZoom] = useState(100);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [viewMode, setViewMode] = useState('normal'); // normal | alpha | edge | transparency
  const [showBeforeAfter, setShowBeforeAfter] = useState(false);
  const [splitPos, setSplitPos] = useState(50);
  const [handTool, setHandTool] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);

  // Comparison engine slots
  const [engineResults, setEngineResults] = useState([]);

  const fileInputRef = useRef(null);
  const previewRef = useRef(null);

  // Load shared artwork
  useEffect(() => {
    if (sharedArtwork?.dataUrl) loadImage(sharedArtwork.dataUrl, sharedArtwork.filename || 'shared.png');
  }, [sharedArtwork]);

  // ─── IMAGE LOADING ─────────────────────────────────────────────────────────
  const loadImage = (dataUrl, filename) => {
    const img = new Image();
    img.onload = () => {
      setOriginalImage(dataUrl);
      setProcessedImage(null);
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      setImageFile({ name: filename });
      setProcessingLog([]);
      setPipelineStatus({});
      setQualityReport(null);
      setEngineResults([]);
      // Auto-analyze
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = analyzeImage(imgData);
      setAnalysis(result);
      addLog('Image loaded and analyzed');
    };
    img.src = dataUrl;
  };

  const handleFileUpload = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => loadImage(e.target.result, file.name);
    reader.readAsDataURL(file);
  }, []);

  // Paste from clipboard
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) { handleFileUpload(item.getAsFile()); break; }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleFileUpload]);

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e) => { e.preventDefault(); setIsDragging(false); handleFileUpload(e.dataTransfer.files[0]); };

  const addLog = (msg) => setProcessingLog(prev => [...prev, { time: new Date().toLocaleTimeString(), msg }]);

  // ─── PIPELINE EXECUTION ─────────────────────────────────────────────────────
  const runPipeline = async () => {
    if (!originalImage) return;
    setIsProcessing(true);
    setProcessingLog([]);
    setPipelineStatus({});
    setProcessedImage(null);

    const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = originalImage; });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    let imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const runStage = (id, label, fn) => {
      return new Promise(resolve => setTimeout(() => {
        if (!enabledStages[id]) { setPipelineStatus(p => ({...p, [id]: 'skipped'})); addLog(`⏭ ${label} (skipped)`); resolve(imgData); return; }
        addLog(`⏳ ${label}...`);
        setPipelineStatus(p => ({...p, [id]: 'running'}));
        try {
          imgData = fn(imgData);
          setPipelineStatus(p => ({...p, [id]: 'done'}));
          addLog(`✓ ${label} complete`);
        } catch(e) {
          setPipelineStatus(p => ({...p, [id]: 'error'}));
          addLog(`✕ ${label} failed: ${e.message}`);
        }
        resolve(imgData);
      }, 80));
    };

    // Stage 1: Analysis
    await runStage('analyze', 'Image Analysis', (d) => { setAnalysis(analyzeImage(d)); return d; });

    // Stage 2: Classification
    await runStage('classify', 'Artwork Classification', (d) => d);

    // Stage 3: Background Detection
    await runStage('bgDetect', 'Background Detection', (d) => d);

    // Stage 4: Subject Segmentation (placeholder for SAM2/BiRefNet)
    await runStage('segment', 'Subject Segmentation', (d) => d);

    // Stage 5: Connected Components
    await runStage('components', 'Connected Components', (d) => d);

    // Stage 6: Background Removal (using balanced algo from utils)
    await runStage('bgRemove', 'Background Removal', (d) => {
      return removeBackgroundBalanced(d);
    });

    // Stage 7: Alpha Refinement
    await runStage('alphaRefine', 'Alpha Refinement', (d) => {
      const { data, width, height } = d;
      const result = new Uint8ClampedArray(data);
      // Smooth alpha at edges
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = (y * width + x) * 4;
          const a = data[idx + 3];
          if (a === 0 || a === 255) continue;
          let sum = a * 4, w = 4;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            sum += data[((y+dy)*width+(x+dx))*4+3] * (dx===0||dy===0 ? 2 : 1);
            w += (dx===0||dy===0 ? 2 : 1);
          }
          result[idx+3] = Math.round(sum / w);
        }
      }
      return new ImageData(result, width, height);
    });

    // Stage 8: Edge Repair
    await runStage('edgeRepair', 'Edge Repair', (d) => {
      return cleanEdges(d, d.width, d.height);
    });

    // Stage 9: Halo Removal
    await runStage('haloRemove', 'Halo Removal', (d) => {
      const { data, width, height } = d;
      const result = new Uint8ClampedArray(data);
      for (let i = 0; i < result.length; i += 4) {
        const a = result[i + 3];
        if (a > 0 && a < 200) {
          const r = result[i], g = result[i+1], b = result[i+2];
          if ((r > 220 && g > 220 && b > 220) || (r < 35 && g < 35 && b < 35)) {
            result[i+3] = Math.round(a * 0.2);
          }
        }
      }
      return new ImageData(result, width, height);
    });

    // Stage 10: Quality Analysis
    await runStage('qa', 'Quality Analysis', (d) => {
      setQualityReport(buildQAReport(d));
      return d;
    });

    // Output
    const outCanvas = document.createElement('canvas');
    outCanvas.width = imgData.width; outCanvas.height = imgData.height;
    outCanvas.getContext('2d').putImageData(imgData, 0, 0);
    setProcessedImage(outCanvas.toDataURL('image/png'));
    setImageDimensions({ width: imgData.width, height: imgData.height });
    addLog('🎉 Pipeline complete');
    setIsProcessing(false);
  };

  function buildQAReport(imgData) {
    const { data, width, height } = imgData;
    let opaque = 0, semiTrans = 0, transparent = 0, haloPixels = 0, jaggedPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i+3];
      if (a === 0) transparent++;
      else if (a === 255) opaque++;
      else { semiTrans++; if (data[i]>220&&data[i+1]>220&&data[i+2]>220) haloPixels++; }
    }
    const total = width * height;
    const bgRemoved = ((transparent / total) * 100).toFixed(1);
    const edgeScore = semiTrans < total * 0.02 ? 5 : semiTrans < total * 0.05 ? 4 : 3;
    return {
      bgRemoved, edgeScore, haloPixels,
      transparency: transparent > 0 ? 'Excellent' : 'None',
      printReady: haloPixels < 100 && edgeScore >= 4,
      resolution: `${width} × ${height}`,
      dpi: Math.round(width / 10.75),
    };
  }

  // ─── NAVIGATION ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const kd = (e) => {
      if (e.code === 'Space' && !e.repeat && e.target.tagName !== 'INPUT') { e.preventDefault(); setSpaceHeld(true); }
      if (e.key === 'h' && e.target.tagName !== 'INPUT') setHandTool(p => !p);
    };
    const ku = (e) => { if (e.code === 'Space') setSpaceHeld(false); };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, []);

  const canPan = zoom > 100 || handTool || spaceHeld;
  const handlePanStart = (e) => { if (!canPan) return; e.preventDefault(); setIsPanning(true); setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y }); };
  const handlePanMove = (e) => { if (!isPanning) return; setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y }); };
  const handlePanEnd = () => setIsPanning(false);
  const handleWheel = (e) => { e.preventDefault(); setZoom(z => Math.max(25, Math.min(1600, z + (e.deltaY < 0 ? 25 : -25)))); };
  const getCursor = () => { if (handTool || spaceHeld) return isPanning ? 'grabbing' : 'grab'; if (zoom > 100) return isPanning ? 'grabbing' : 'grab'; return 'default'; };

  // Export handlers
  const handleDownload = () => {
    const url = processedImage || originalImage;
    if (!url) return;
    const link = document.createElement('a');
    link.download = `ai-lab-${imageFile?.name || 'output'}.png`;
    link.href = url;
    link.click();
  };

  const handleSendToMockup = () => { if ((processedImage || originalImage) && onSendToMockup) onSendToMockup(processedImage || originalImage); };
  const handleSendToQA = () => { if ((processedImage || originalImage) && onSendToQA) onSendToQA(processedImage || originalImage); };

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  const displayUrl = processedImage || originalImage;
  const stageIcon = (id) => { const s = pipelineStatus[id]; if (s === 'done') return '✓'; if (s === 'running') return '⏳'; if (s === 'error') return '✕'; if (s === 'skipped') return '⏭'; return '○'; };

  return (
    <div className="ailab-page">
      <header className="ailab-header">
        <div className="ailab-header-left">
          <h1 className="ailab-title">AI Artwork Lab <span className="ailab-beta">Beta</span></h1>
          <span className="ailab-subtitle">Experimental Processing Pipeline</span>
        </div>
        <div className="ailab-header-right">
          <button className="ailab-btn ailab-btn-primary" onClick={runPipeline} disabled={!originalImage || isProcessing}>
            {isProcessing ? '⏳ Processing...' : '▶ Run Pipeline'}
          </button>
          <button className="ailab-btn ailab-btn-outline" onClick={handleSendToQA} disabled={!displayUrl}>→ QA</button>
          <button className="ailab-btn ailab-btn-outline" onClick={handleSendToMockup} disabled={!displayUrl}>→ Mockup</button>
        </div>
      </header>

      <div className="ailab-layout">
        {/* ═══ LEFT PANEL ═══ */}
        <aside className="ailab-left">
          {/* Upload */}
          <div className="ailab-card">
            <h3 className="ailab-card-title">Upload</h3>
            {!originalImage ? (
              <div className={`ailab-upload-zone ${isDragging ? 'dragging' : ''}`}
                onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}>
                <p>Drag & drop, paste, or click</p>
              </div>
            ) : (
              <div className="ailab-file-info">
                <div className="ailab-info-row"><span>File</span><span>{imageFile?.name}</span></div>
                {imageDimensions && (<>
                  <div className="ailab-info-row"><span>Size</span><span>{imageDimensions.width}×{imageDimensions.height}</span></div>
                  <div className="ailab-info-row"><span>DPI</span><span>~{Math.round(imageDimensions.width/10.75)}</span></div>
                  <div className="ailab-info-row"><span>Transparency</span><span>{analysis?.hasTransparency ? '✓' : '✕'}</span></div>
                </>)}
                <button className="ailab-btn ailab-btn-sm" onClick={() => fileInputRef.current?.click()}>Replace</button>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" style={{display:'none'}} onChange={(e) => handleFileUpload(e.target.files[0])} />
          </div>

          {/* AI Analysis */}
          {analysis && (
            <div className="ailab-card">
              <h3 className="ailab-card-title">Image Intelligence</h3>
              <div className="ailab-analysis">
                <div className="ailab-info-row"><span>Type</span><span className="ailab-badge">{analysis.artworkType}</span></div>
                <div className="ailab-info-row"><span>Confidence</span><span>{analysis.confidence}%</span></div>
                <div className="ailab-info-row"><span>Background</span><span>{analysis.bgType}</span></div>
                <div className="ailab-info-row"><span>Complexity</span><span>{analysis.complexity}</span></div>
                <div className="ailab-info-row"><span>Colors</span><span>{analysis.uniqueColors}</span></div>
                <div className="ailab-info-row"><span>Edge Density</span><span>{analysis.edgeDensity}%</span></div>
                <div className="ailab-info-row"><span>Print Size</span><span>{analysis.printSize}</span></div>
              </div>
            </div>
          )}

          {/* Pipeline Stages */}
          <div className="ailab-card">
            <h3 className="ailab-card-title">Pipeline Stages</h3>
            <div className="ailab-pipeline">
              {PIPELINE_STAGES.map(stage => (
                <div key={stage.id} className={`ailab-stage ${pipelineStatus[stage.id] || ''}`}>
                  <label className="ailab-stage-toggle">
                    <input type="checkbox" checked={enabledStages[stage.id]}
                      onChange={() => setEnabledStages(p => ({...p, [stage.id]: !p[stage.id]}))} />
                    <span className="ailab-stage-icon">{stageIcon(stage.id)}</span>
                    <span className="ailab-stage-label">{stage.label}</span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* ═══ CENTER PANEL ═══ */}
        <section className="ailab-center">
          <div className="ailab-toolbar">
            <div className="ailab-view-tabs">
              <button className={`ailab-tab ${viewMode==='normal'?'active':''}`} onClick={() => setViewMode('normal')}>Normal</button>
              <button className={`ailab-tab ${viewMode==='alpha'?'active':''}`} onClick={() => setViewMode('alpha')}>Alpha</button>
              <button className={`ailab-tab ${viewMode==='edge'?'active':''}`} onClick={() => setViewMode('edge')}>Edges</button>
              <button className={`ailab-tab ${showBeforeAfter?'active':''}`} onClick={() => setShowBeforeAfter(b => !b)} disabled={!processedImage}>B/A</button>
            </div>
            <div className="ailab-zoom-bar">
              <button className="ailab-zoom-btn" onClick={() => setZoom(z => Math.max(25, z-25))}>−</button>
              <span>{zoom}%</span>
              <button className="ailab-zoom-btn" onClick={() => setZoom(z => Math.min(1600, z+25))}>+</button>
              <button className="ailab-zoom-btn" onClick={() => { setZoom(100); setPanOffset({x:0,y:0}); }}>Fit</button>
              <button className={`ailab-zoom-btn ${handTool?'active':''}`} onClick={() => setHandTool(h=>!h)} title="Hand Tool (H)">✋</button>
            </div>
          </div>

          <div className="ailab-canvas-area" ref={previewRef} onWheel={handleWheel}>
            {isProcessing && <div className="ailab-processing"><div className="ailab-spinner" /><p>Running pipeline...</p></div>}
            {!originalImage ? (
              <div className={`ailab-empty ${isDragging?'dragging':''}`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}>
                <p>Upload an image to begin experimentation</p>
                <span>Supports PNG, JPEG, WEBP, TIFF up to 10000×10000</span>
              </div>
            ) : (
              <div className="ailab-image-viewport" style={{ transform: `scale(${zoom/100}) translate(${panOffset.x/(zoom/100)}px, ${panOffset.y/(zoom/100)}px)`, cursor: getCursor() }}
                onMouseDown={handlePanStart} onMouseMove={handlePanMove} onMouseUp={handlePanEnd} onMouseLeave={handlePanEnd}>
                <img src={displayUrl} alt="Preview" className="ailab-preview-img" />
              </div>
            )}
          </div>
        </section>

        {/* ═══ RIGHT PANEL ═══ */}
        <aside className="ailab-right">
          {/* Processing Log */}
          <div className="ailab-card">
            <h3 className="ailab-card-title">Processing Log</h3>
            <div className="ailab-log">
              {processingLog.length === 0 ? <p className="ailab-muted">Run pipeline to see results</p> :
                processingLog.map((entry, i) => <div key={i} className="ailab-log-entry"><span className="ailab-log-time">{entry.time}</span> {entry.msg}</div>)
              }
            </div>
          </div>

          {/* Quality Report */}
          {qualityReport && (
            <div className="ailab-card">
              <h3 className="ailab-card-title">Quality Report</h3>
              <div className="ailab-qa">
                <div className="ailab-info-row"><span>BG Removed</span><span>{qualityReport.bgRemoved}%</span></div>
                <div className="ailab-info-row"><span>Edge Score</span><span>{'★'.repeat(qualityReport.edgeScore)}{'☆'.repeat(5-qualityReport.edgeScore)}</span></div>
                <div className="ailab-info-row"><span>Halo Pixels</span><span>{qualityReport.haloPixels}</span></div>
                <div className="ailab-info-row"><span>Transparency</span><span>{qualityReport.transparency}</span></div>
                <div className="ailab-info-row"><span>Print Ready</span><span>{qualityReport.printReady ? '✓ YES' : '✕ NO'}</span></div>
                <div className="ailab-info-row"><span>Resolution</span><span>{qualityReport.resolution}</span></div>
                <div className="ailab-info-row"><span>DPI</span><span>~{qualityReport.dpi}</span></div>
              </div>
            </div>
          )}

          {/* Export */}
          <div className="ailab-card">
            <h3 className="ailab-card-title">Export</h3>
            <div className="ailab-export-btns">
              <button className="ailab-btn ailab-btn-primary" onClick={handleDownload} disabled={!displayUrl}>Download PNG</button>
              <button className="ailab-btn ailab-btn-outline" onClick={handleSendToMockup} disabled={!displayUrl}>Send to Mockup</button>
              <button className="ailab-btn ailab-btn-outline" onClick={handleSendToQA} disabled={!displayUrl}>Send to QA</button>
            </div>
          </div>

          {/* AI Model Comparison (future) */}
          <div className="ailab-card">
            <h3 className="ailab-card-title">Engine Comparison</h3>
            <p className="ailab-muted">Future: Compare SAM2, BiRefNet, U²-Net, IS-Net, MODNet results side-by-side.</p>
            <div className="ailab-engines">
              {['Current Engine', 'SAM2', 'BiRefNet', 'U²-Net'].map(name => (
                <div key={name} className="ailab-engine-slot">
                  <span>{name}</span>
                  <span className="ailab-muted">{name === 'Current Engine' ? (processedImage ? '✓ Ready' : '—') : 'Placeholder'}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default AIArtworkLab;
