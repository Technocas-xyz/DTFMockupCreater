import React, { useState, useMemo } from 'react';
import './GangSheetCalculator.css';

const SHEET_WIDTH = 22;
const MAX_SHEET_HEIGHT = 108;
const COST_PER_FOOT = 5;

// Same packing algorithm as GangSheet (MaxRects-BSSF)
function calculatePackedHeight(items, sheetWidth, hGap, vGap) {
  if (items.length === 0) return 0;

  let freeRects = [{ x: 0, y: 0, w: sheetWidth, h: 99999 }];
  let usedMaxY = 0;

  for (const item of items) {
    let bestScore1 = Infinity, bestScore2 = Infinity;
    let bestRect = null, bestRotated = false;

    for (const rect of freeRects) {
      // Normal — only rotate if it makes item narrower
      if (item.w <= rect.w + 0.01 && item.h <= rect.h + 0.01) {
        const leftover_h = Math.abs(rect.w - item.w);
        const leftover_v = Math.abs(rect.h - item.h);
        const score1 = Math.min(leftover_h, leftover_v);
        const score2 = Math.max(leftover_h, leftover_v);
        const yScore = rect.y * 10000 + score1;
        if (yScore < bestScore1 || (yScore === bestScore1 && score2 < bestScore2)) {
          bestScore1 = yScore; bestScore2 = score2; bestRect = rect; bestRotated = false;
        }
      }
      // Rotated — only if height < width (makes narrower)
      if (item.h < item.w && item.h <= rect.w + 0.01 && item.w <= rect.h + 0.01) {
        const leftover_h = Math.abs(rect.w - item.h);
        const leftover_v = Math.abs(rect.h - item.w);
        const score1 = Math.min(leftover_h, leftover_v);
        const score2 = Math.max(leftover_h, leftover_v);
        const yScore = rect.y * 10000 + score1;
        if (yScore < bestScore1 || (yScore === bestScore1 && score2 < bestScore2)) {
          bestScore1 = yScore; bestScore2 = score2; bestRect = rect; bestRotated = true;
        }
      }
    }

    if (!bestRect) break;

    const pw = bestRotated ? item.h : item.w;
    const ph = bestRotated ? item.w : item.h;
    usedMaxY = Math.max(usedMaxY, bestRect.y + ph);

    const occX = bestRect.x, occY = bestRect.y;
    const occW = pw + hGap, occH = ph + vGap;

    const newFree = [];
    for (const fr of freeRects) {
      if (occX >= fr.x + fr.w || occX + occW <= fr.x || occY >= fr.y + fr.h || occY + occH <= fr.y) {
        newFree.push(fr); continue;
      }
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

  return usedMaxY;
}

function GangSheetCalculator() {
  const [artworks, setArtworks] = useState([{ id: 1, width: 10.75, height: 10.75, qty: 1 }]);
  const [hGap, setHGap] = useState(0.25);
  const [vGap, setVGap] = useState(0.25);
  const nextId = useState(2);

  const addArtwork = () => {
    setArtworks(prev => [...prev, { id: Date.now(), width: 10.75, height: 10.75, qty: 1 }]);
  };

  const removeArtwork = (id) => {
    setArtworks(prev => prev.filter(a => a.id !== id));
  };

  const updateArtwork = (id, field, value) => {
    setArtworks(prev => prev.map(a => a.id === id ? { ...a, [field]: parseFloat(value) || 0 } : a));
  };

  // Calculate using same packing algorithm
  const result = useMemo(() => {
    // Expand artworks into items
    const items = [];
    for (const art of artworks) {
      if (art.width <= 0 || art.height <= 0 || art.qty <= 0) continue;
      for (let i = 0; i < art.qty; i++) {
        items.push({ w: art.width, h: art.height });
      }
    }
    if (items.length === 0) return null;

    // Sort by area (largest first) — same as GangSheet
    items.sort((a, b) => (b.w * b.h) - (a.w * a.h));

    const totalHeight = calculatePackedHeight(items, SHEET_WIDTH, hGap, vGap);
    const sheets = Math.ceil(totalHeight / MAX_SHEET_HEIGHT);
    const totalFeet = totalHeight / 12;
    const cost = totalFeet * COST_PER_FOOT;
    const totalArea = SHEET_WIDTH * totalHeight;
    const artworkArea = items.reduce((s, i) => s + i.w * i.h, 0);
    const utilization = totalArea > 0 ? (artworkArea / totalArea * 100) : 0;

    return {
      totalItems: items.length,
      totalHeight: totalHeight.toFixed(1),
      totalFeet: totalFeet.toFixed(2),
      sheets,
      cost: cost.toFixed(2),
      utilization: utilization.toFixed(1),
      perItem: items.length > 0 ? (cost / items.length).toFixed(2) : '0',
    };
  }, [artworks, hGap, vGap]);

  const totalQty = artworks.reduce((s, a) => s + (a.qty || 0), 0);

  return (
    <div className="gsc-page">
      <header className="gsc-header">
        <h1 className="gsc-title">Gang Sheet Price Calculator</h1>
        <p className="gsc-subtitle">22" wide roll · ${COST_PER_FOOT}/ft · MaxRects packing</p>
      </header>

      <div className="gsc-layout">
        {/* Artwork Entries */}
        <div className="gsc-entries">
          <div className="gsc-entries-header">
            <h3>Artwork Sizes</h3>
            <button className="gsc-btn gsc-btn-primary" onClick={addArtwork}>+ Add Size</button>
          </div>

          <table className="gsc-table">
            <thead>
              <tr><th>#</th><th>Width (")</th><th>Height (")</th><th>Qty</th><th>Area</th><th></th></tr>
            </thead>
            <tbody>
              {artworks.map((art, idx) => (
                <tr key={art.id}>
                  <td>{idx + 1}</td>
                  <td><input type="number" step="0.1" min="0.5" max="21" value={art.width} onChange={e => updateArtwork(art.id, 'width', e.target.value)} /></td>
                  <td><input type="number" step="0.1" min="0.5" max="108" value={art.height} onChange={e => updateArtwork(art.id, 'height', e.target.value)} /></td>
                  <td><input type="number" step="1" min="1" max="500" value={art.qty} onChange={e => updateArtwork(art.id, 'qty', e.target.value)} /></td>
                  <td className="gsc-area">{(art.width * art.height).toFixed(1)} sq"</td>
                  <td>{artworks.length > 1 && <button className="gsc-btn-remove" onClick={() => removeArtwork(art.id)}>×</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="gsc-gap-settings">
            <div className="gsc-gap-field">
              <label>H Gap</label>
              <input type="number" step="0.05" min="0" max="2" value={hGap} onChange={e => setHGap(parseFloat(e.target.value) || 0)} />
              <span>"</span>
            </div>
            <div className="gsc-gap-field">
              <label>V Gap</label>
              <input type="number" step="0.05" min="0" max="2" value={vGap} onChange={e => setVGap(parseFloat(e.target.value) || 0)} />
              <span>"</span>
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="gsc-results">
          {result ? (
            <>
              <div className="gsc-result-card gsc-result-price">
                <span className="gsc-result-label">Total Cost</span>
                <span className="gsc-result-value">${result.cost}</span>
                <span className="gsc-result-sub">USD</span>
              </div>

              <div className="gsc-result-grid">
                <div className="gsc-result-item">
                  <span className="gsc-result-label">Total Items</span>
                  <span className="gsc-result-value">{result.totalItems}</span>
                </div>
                <div className="gsc-result-item">
                  <span className="gsc-result-label">Sheet Height</span>
                  <span className="gsc-result-value">{result.totalHeight}"</span>
                </div>
                <div className="gsc-result-item">
                  <span className="gsc-result-label">Linear Feet</span>
                  <span className="gsc-result-value">{result.totalFeet} ft</span>
                </div>
                <div className="gsc-result-item">
                  <span className="gsc-result-label">Sheets (108" max)</span>
                  <span className="gsc-result-value">{result.sheets}</span>
                </div>
                <div className="gsc-result-item">
                  <span className="gsc-result-label">Utilization</span>
                  <span className="gsc-result-value">{result.utilization}%</span>
                </div>
                <div className="gsc-result-item">
                  <span className="gsc-result-label">Cost per Item</span>
                  <span className="gsc-result-value">${result.perItem}</span>
                </div>
              </div>

              <div className="gsc-breakdown">
                <h4>Breakdown</h4>
                <div className="gsc-breakdown-row"><span>Sheet Width</span><span>{SHEET_WIDTH}"</span></div>
                <div className="gsc-breakdown-row"><span>Packed Height</span><span>{result.totalHeight}"</span></div>
                <div className="gsc-breakdown-row"><span>Linear Feet</span><span>{result.totalFeet} ft</span></div>
                <div className="gsc-breakdown-row"><span>Rate</span><span>${COST_PER_FOOT}.00 / ft</span></div>
                <div className="gsc-breakdown-row gsc-total"><span>Total</span><span>${result.cost}</span></div>
              </div>
            </>
          ) : (
            <div className="gsc-empty">Enter artwork sizes to calculate pricing</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default GangSheetCalculator;
