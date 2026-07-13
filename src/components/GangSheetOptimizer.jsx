import React, { useState, useMemo, useCallback } from 'react';
import './GangSheetOptimizer.css';

const SHEET_WIDTH = 22;
const MAX_SHEET_HEIGHT = 108;
const COST_PER_FOOT = 5;

// ─── PACKING ENGINE (same MaxRects-BSSF as production) ────────────────────────
function packAndMeasure(items, sheetWidth, hGap, vGap, allowRotation = false) {
  if (items.length === 0) return { height: 0, efficiency: 0 };
  const sorted = [...items].sort((a, b) => (b.w * b.h) - (a.w * a.h));
  let freeRects = [{ x: 0, y: 0, w: sheetWidth, h: 99999 }];
  let usedMaxY = 0;
  let placedCount = 0;

  for (const item of sorted) {
    let bestScore1 = Infinity, bestScore2 = Infinity, bestRect = null, bestRotated = false;
    for (const rect of freeRects) {
      if (item.w <= rect.w + 0.01 && item.h <= rect.h + 0.01) {
        const s1 = Math.min(Math.abs(rect.w - item.w), Math.abs(rect.h - item.h));
        const s2 = Math.max(Math.abs(rect.w - item.w), Math.abs(rect.h - item.h));
        const yScore = rect.y * 10000 + s1;
        if (yScore < bestScore1 || (yScore === bestScore1 && s2 < bestScore2)) {
          bestScore1 = yScore; bestScore2 = s2; bestRect = rect; bestRotated = false;
        }
      }
      if (allowRotation && item.h < item.w && item.h <= rect.w + 0.01 && item.w <= rect.h + 0.01) {
        const s1 = Math.min(Math.abs(rect.w - item.h), Math.abs(rect.h - item.w));
        const s2 = Math.max(Math.abs(rect.w - item.h), Math.abs(rect.h - item.w));
        const yScore = rect.y * 10000 + s1;
        if (yScore < bestScore1 || (yScore === bestScore1 && s2 < bestScore2)) {
          bestScore1 = yScore; bestScore2 = s2; bestRect = rect; bestRotated = true;
        }
      }
    }
    if (!bestRect) break;
    const pw = bestRotated ? item.h : item.w;
    const ph = bestRotated ? item.w : item.h;
    usedMaxY = Math.max(usedMaxY, bestRect.y + ph);
    placedCount++;
    const occX = bestRect.x, occY = bestRect.y, occW = pw + hGap, occH = ph + vGap;
    const newFree = [];
    for (const fr of freeRects) {
      if (occX >= fr.x + fr.w || occX + occW <= fr.x || occY >= fr.y + fr.h || occY + occH <= fr.y) { newFree.push(fr); continue; }
      if (occX > fr.x) newFree.push({ x: fr.x, y: fr.y, w: occX - fr.x, h: fr.h });
      if (occX + occW < fr.x + fr.w) newFree.push({ x: occX + occW, y: fr.y, w: (fr.x + fr.w) - (occX + occW), h: fr.h });
      if (occY > fr.y) newFree.push({ x: fr.x, y: fr.y, w: fr.w, h: occY - fr.y });
      if (occY + occH < fr.y + fr.h) newFree.push({ x: fr.x, y: occY + occH, w: fr.w, h: (fr.y + fr.h) - (occY + occH) });
    }
    freeRects = [];
    for (let i = 0; i < newFree.length; i++) {
      const a = newFree[i];
      if (a.w < 0.25 || a.h < 0.25) continue;
      let contained = false;
      for (let j = 0; j < newFree.length; j++) {
        if (i === j) continue;
        const b = newFree[j];
        if (a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h) { contained = true; break; }
      }
      if (!contained) freeRects.push(a);
    }
  }

  const totalArea = sheetWidth * usedMaxY;
  const artworkArea = items.reduce((s, i) => s + i.w * i.h, 0);
  return { height: usedMaxY, efficiency: totalArea > 0 ? (artworkArea / totalArea * 100) : 0, placed: placedCount };
}

// ─── OPTIMIZATION ENGINE ──────────────────────────────────────────────────────
function runOptimizer(artworks, currentHGap, currentVGap, settings) {
  const {
    maxSizeReduction = 5, maxSizeIncrease = 3,
    minHGap = 0.20, maxHGap = 0.50, minVGap = 0.20, maxVGap = 0.50,
    allowRotation = true, maintainAspect = true, maxSuggestions = 5,
  } = settings;

  // Expand artworks into items
  const baseItems = [];
  for (const art of artworks) {
    if (art.width <= 0 || art.height <= 0 || art.qty <= 0) continue;
    for (let i = 0; i < art.qty; i++) baseItems.push({ w: art.width, h: art.height });
  }
  if (baseItems.length === 0) return [];

  // Current baseline
  const baseline = packAndMeasure(baseItems, SHEET_WIDTH, currentHGap, currentVGap, false);
  const baselineCost = (baseline.height / 12) * COST_PER_FOOT;

  // Generate combinations to test
  const gapSteps = [0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50];
  const sizeSteps = [0, -1, -2, -3, -4, -5, 1, 2, 3]; // percent
  const filteredGapH = gapSteps.filter(g => g >= minHGap && g <= maxHGap);
  const filteredGapV = gapSteps.filter(g => g >= minVGap && g <= maxVGap);
  const filteredSize = sizeSteps.filter(s => s >= -maxSizeReduction && s <= maxSizeIncrease);

  const results = [];

  // Test combinations
  for (const hg of filteredGapH) {
    for (const vg of filteredGapV) {
      for (const sizePct of filteredSize) {
        for (const rotate of (allowRotation ? [false, true] : [false])) {
          const scale = 1 + sizePct / 100;
          const items = baseItems.map(it => ({
            w: parseFloat((it.w * scale).toFixed(3)),
            h: maintainAspect ? parseFloat((it.h * scale).toFixed(3)) : it.h,
          }));

          // Skip if any item exceeds sheet width
          if (items.some(it => it.w > SHEET_WIDTH - 0.1)) continue;

          const result = packAndMeasure(items, SHEET_WIDTH, hg, vg, rotate);
          if (result.height <= 0) continue;

          const cost = (result.height / 12) * COST_PER_FOOT;
          const saving = baselineCost - cost;
          const lengthSaved = baseline.height - result.height;

          // Score using weighted formula
          const effGain = result.efficiency - baseline.efficiency;
          const score = (
            effGain * 0.35 +
            (saving / Math.max(baselineCost, 1)) * 100 * 0.30 +
            (100 - Math.abs(sizePct) * 10) * 0.20 +
            (hg >= 0.25 ? 10 : 5) * 0.10 +
            (!rotate ? 5 : 3) * 0.05
          );

          results.push({
            hGap: hg, vGap: vg, sizePct, rotate,
            width: items[0].w, height: items[0].h,
            packedHeight: parseFloat(result.height.toFixed(2)),
            linearFeet: parseFloat((result.height / 12).toFixed(2)),
            efficiency: parseFloat(result.efficiency.toFixed(1)),
            cost: parseFloat(cost.toFixed(2)),
            saving: parseFloat(saving.toFixed(2)),
            lengthSaved: parseFloat(lengthSaved.toFixed(2)),
            score: parseFloat(score.toFixed(2)),
            risk: Math.abs(sizePct) > 3 ? 'moderate' : Math.abs(sizePct) > 0 ? 'low' : 'minimal',
          });
        }
      }
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // Deduplicate: remove results within 0.5" height of each other
  const unique = [];
  for (const r of results) {
    if (unique.length >= maxSuggestions * 3) break;
    const isDupe = unique.some(u => Math.abs(u.packedHeight - r.packedHeight) < 0.5 && u.sizePct === r.sizePct);
    if (!isDupe) unique.push(r);
  }

  // Categorize and pick diverse results
  const categories = [
    { type: 'safest', title: 'Safest Option', filter: r => r.sizePct === 0 && !r.rotate },
    { type: 'balanced', title: 'Best Balanced', filter: r => Math.abs(r.sizePct) <= 2 },
    { type: 'max_efficiency', title: 'Maximum Efficiency', filter: r => true },
    { type: 'best_cost', title: 'Best Cost Saving', filter: r => r.saving > 0 },
    { type: 'size_preserve', title: 'Best Size Preservation', filter: r => Math.abs(r.sizePct) <= 1 },
  ];

  const final = [];
  for (const cat of categories) {
    const match = unique.find(r => cat.filter(r) && !final.includes(r));
    if (match) final.push({ ...match, type: cat.type, title: cat.title });
    if (final.length >= maxSuggestions) break;
  }
  // Fill remaining with top unique results
  for (const r of unique) {
    if (final.length >= maxSuggestions) break;
    if (!final.some(f => f === r)) final.push({ ...r, type: 'alternative', title: `Alternative ${final.length}` });
  }

  return { baseline: { height: baseline.height, efficiency: baseline.efficiency, cost: baselineCost, linearFeet: baseline.height / 12 }, suggestions: final };
}

// ─── EXPLANATION GENERATOR ─────────────────────────────────────────────────────
function generateExplanation(suggestion, currentArt, currentHGap, currentVGap) {
  const parts = [];
  if (suggestion.hGap !== currentHGap || suggestion.vGap !== currentVGap) {
    parts.push(`Adjusts gaps from ${currentHGap}"/${currentVGap}" to ${suggestion.hGap}"/${suggestion.vGap}".`);
  }
  if (suggestion.sizePct !== 0) {
    const dir = suggestion.sizePct < 0 ? 'reduces' : 'increases';
    parts.push(`${dir.charAt(0).toUpperCase() + dir.slice(1)} artwork proportionally by ${Math.abs(suggestion.sizePct)}%.`);
  }
  if (suggestion.rotate) parts.push('Uses rotation for better fitting.');
  if (suggestion.saving > 0) parts.push(`Saves $${suggestion.saving.toFixed(2)} (${suggestion.lengthSaved.toFixed(1)}" shorter).`);
  parts.push(`Efficiency: ${suggestion.efficiency}%.`);
  if (suggestion.risk === 'minimal') parts.push('No production risk.');
  else if (suggestion.risk === 'low') parts.push('Low production risk.');
  else parts.push('Moderate production risk — verify artwork quality.');
  return parts.join(' ');
}

// ─── COMPONENT ──────────────────────────────────────────────────────────────
function GangSheetOptimizer() {
  const [artworks, setArtworks] = useState([{ id: 1, width: 10.75, height: 10.75, qty: 10 }]);
  const [hGap, setHGap] = useState(0.25);
  const [vGap, setVGap] = useState(0.25);
  const [settings, setSettings] = useState({
    maxSizeReduction: 5, maxSizeIncrease: 3,
    minHGap: 0.20, maxHGap: 0.50, minVGap: 0.20, maxVGap: 0.50,
    allowRotation: true, maintainAspect: true, maxSuggestions: 5,
  });
  const [optimizationResult, setOptimizationResult] = useState(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const addArtwork = () => setArtworks(prev => [...prev, { id: Date.now(), width: 10.75, height: 10.75, qty: 1 }]);
  const removeArtwork = (id) => setArtworks(prev => prev.filter(a => a.id !== id));
  const updateArtwork = (id, field, value) => setArtworks(prev => prev.map(a => a.id === id ? { ...a, [field]: parseFloat(value) || 0 } : a));

  const runOptimization = useCallback(() => {
    setIsOptimizing(true);
    setTimeout(() => {
      const result = runOptimizer(artworks, hGap, vGap, settings);
      setOptimizationResult(result);
      setIsOptimizing(false);
    }, 100);
  }, [artworks, hGap, vGap, settings]);

  const applySuggestion = (suggestion) => {
    setHGap(suggestion.hGap);
    setVGap(suggestion.vGap);
    if (suggestion.sizePct !== 0) {
      const scale = 1 + suggestion.sizePct / 100;
      setArtworks(prev => prev.map(a => ({
        ...a,
        width: parseFloat((a.width * scale).toFixed(2)),
        height: settings.maintainAspect ? parseFloat((a.height * scale).toFixed(2)) : a.height,
      })));
    }
  };

  // Current calculation
  const currentResult = useMemo(() => {
    const items = [];
    for (const art of artworks) { for (let i = 0; i < (art.qty || 0); i++) items.push({ w: art.width, h: art.height }); }
    if (items.length === 0) return null;
    const r = packAndMeasure(items, SHEET_WIDTH, hGap, vGap, false);
    return { ...r, cost: (r.height / 12) * COST_PER_FOOT, linearFeet: r.height / 12, items: items.length };
  }, [artworks, hGap, vGap]);

  return (
    <div className="gso-page">
      <header className="gso-header">
        <div>
          <h1 className="gso-title">AI Gang Sheet Optimizer</h1>
          <p className="gso-subtitle">Find the most efficient layout configuration</p>
        </div>
        <button className="gso-btn gso-btn-primary gso-btn-lg" onClick={runOptimization} disabled={isOptimizing || !currentResult}>
          {isOptimizing ? '⏳ Optimizing...' : '✨ Optimize Efficiency'}
        </button>
      </header>

      <div className="gso-layout">
        {/* Input Section */}
        <div className="gso-input-section">
          <div className="gso-card">
            <div className="gso-card-header"><h3>Artwork Sizes</h3><button className="gso-btn gso-btn-sm" onClick={addArtwork}>+ Add</button></div>
            <table className="gso-table">
              <thead><tr><th>W (")</th><th>H (")</th><th>Qty</th><th></th></tr></thead>
              <tbody>
                {artworks.map(art => (
                  <tr key={art.id}>
                    <td><input type="number" step="0.1" min="0.5" value={art.width} onChange={e => updateArtwork(art.id, 'width', e.target.value)} /></td>
                    <td><input type="number" step="0.1" min="0.5" value={art.height} onChange={e => updateArtwork(art.id, 'height', e.target.value)} /></td>
                    <td><input type="number" step="1" min="1" value={art.qty} onChange={e => updateArtwork(art.id, 'qty', e.target.value)} /></td>
                    <td>{artworks.length > 1 && <button className="gso-btn-x" onClick={() => removeArtwork(art.id)}>×</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="gso-gap-row">
              <label>H Gap <input type="number" step="0.05" min="0" max="2" value={hGap} onChange={e => setHGap(parseFloat(e.target.value)||0)} />"</label>
              <label>V Gap <input type="number" step="0.05" min="0" max="2" value={vGap} onChange={e => setVGap(parseFloat(e.target.value)||0)} />"</label>
            </div>
          </div>

          {/* Current Stats */}
          {currentResult && (
            <div className="gso-card gso-current">
              <h3>Current Layout</h3>
              <div className="gso-stat-grid">
                <div className="gso-stat"><span>Height</span><strong>{currentResult.height.toFixed(1)}"</strong></div>
                <div className="gso-stat"><span>Feet</span><strong>{currentResult.linearFeet.toFixed(2)} ft</strong></div>
                <div className="gso-stat"><span>Efficiency</span><strong>{currentResult.efficiency.toFixed(1)}%</strong></div>
                <div className="gso-stat"><span>Cost</span><strong>${currentResult.cost.toFixed(2)}</strong></div>
              </div>
            </div>
          )}

          {/* Settings */}
          <div className="gso-card">
            <div className="gso-card-header"><h3>Optimization Settings</h3><button className="gso-btn gso-btn-sm" onClick={() => setShowSettings(!showSettings)}>{showSettings ? 'Hide' : 'Show'}</button></div>
            {showSettings && (
              <div className="gso-settings-grid">
                <label>Max Size Reduction <input type="number" min="0" max="10" value={settings.maxSizeReduction} onChange={e => setSettings(s => ({...s, maxSizeReduction: +e.target.value}))} />%</label>
                <label>Max Size Increase <input type="number" min="0" max="10" value={settings.maxSizeIncrease} onChange={e => setSettings(s => ({...s, maxSizeIncrease: +e.target.value}))} />%</label>
                <label>Min H Gap <input type="number" step="0.05" min="0.1" max="1" value={settings.minHGap} onChange={e => setSettings(s => ({...s, minHGap: +e.target.value}))} />"</label>
                <label>Max H Gap <input type="number" step="0.05" min="0.1" max="1" value={settings.maxHGap} onChange={e => setSettings(s => ({...s, maxHGap: +e.target.value}))} />"</label>
                <label><input type="checkbox" checked={settings.allowRotation} onChange={e => setSettings(s => ({...s, allowRotation: e.target.checked}))} /> Allow Rotation</label>
                <label><input type="checkbox" checked={settings.maintainAspect} onChange={e => setSettings(s => ({...s, maintainAspect: e.target.checked}))} /> Maintain Aspect Ratio</label>
                <label>Suggestions <input type="number" min="3" max="10" value={settings.maxSuggestions} onChange={e => setSettings(s => ({...s, maxSuggestions: +e.target.value}))} /></label>
              </div>
            )}
          </div>
        </div>

        {/* Results Section */}
        <div className="gso-results-section">
          {!optimizationResult && !isOptimizing && (
            <div className="gso-empty">
              <p>Click "Optimize Efficiency" to analyze your layout</p>
              <span>The optimizer tests hundreds of valid configurations and ranks the best options</span>
            </div>
          )}

          {isOptimizing && <div className="gso-loading">⏳ Testing combinations...</div>}

          {optimizationResult && optimizationResult.suggestions.length > 0 && (
            <div className="gso-suggestions">
              <h3>Top {optimizationResult.suggestions.length} Recommendations</h3>
              {optimizationResult.suggestions.map((sug, idx) => (
                <div key={idx} className={`gso-suggestion-card gso-risk-${sug.risk}`}>
                  <div className="gso-sug-header">
                    <span className="gso-sug-rank">#{idx + 1}</span>
                    <span className="gso-sug-title">{sug.title}</span>
                    <span className={`gso-sug-risk ${sug.risk}`}>{sug.risk} risk</span>
                  </div>

                  <div className="gso-sug-comparison">
                    <div className="gso-sug-col">
                      <span className="gso-sug-label">Current</span>
                      <div className="gso-sug-val">{artworks[0]?.width}" × {artworks[0]?.height}"</div>
                      <div className="gso-sug-val">Gap: {hGap}" / {vGap}"</div>
                      <div className="gso-sug-val">Height: {optimizationResult.baseline.height.toFixed(1)}"</div>
                      <div className="gso-sug-val">Cost: ${optimizationResult.baseline.cost.toFixed(2)}</div>
                    </div>
                    <div className="gso-sug-arrow">→</div>
                    <div className="gso-sug-col gso-sug-recommended">
                      <span className="gso-sug-label">Recommended</span>
                      <div className="gso-sug-val">{sug.width.toFixed(2)}" × {sug.height.toFixed(2)}" {sug.sizePct !== 0 && <small>({sug.sizePct > 0 ? '+' : ''}{sug.sizePct}%)</small>}</div>
                      <div className="gso-sug-val">Gap: {sug.hGap}" / {sug.vGap}"</div>
                      <div className="gso-sug-val">Height: {sug.packedHeight}"</div>
                      <div className="gso-sug-val gso-highlight">Cost: ${sug.cost} {sug.saving > 0 && <strong className="gso-saving">(-${sug.saving})</strong>}</div>
                    </div>
                  </div>

                  <div className="gso-sug-stats">
                    <span>Efficiency: {sug.efficiency}%</span>
                    <span>Feet: {sug.linearFeet} ft</span>
                    {sug.rotate && <span>🔄 Rotated</span>}
                  </div>

                  <p className="gso-sug-explanation">{generateExplanation(sug, artworks[0], hGap, vGap)}</p>

                  <div className="gso-sug-actions">
                    <button className="gso-btn gso-btn-primary" onClick={() => applySuggestion(sug)}>Apply This</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {optimizationResult && optimizationResult.suggestions.length === 0 && (
            <div className="gso-empty"><p>Current layout is already optimal. No improvements found within constraints.</p></div>
          )}
        </div>
      </div>
    </div>
  );
}

export default GangSheetOptimizer;
