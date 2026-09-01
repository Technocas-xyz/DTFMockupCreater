import React, { useState, useMemo } from 'react';
import './GangSheetCalculator.css';
import { packSheets } from '../utils/packingStrategies';

const SHEET_WIDTH = 22;
const MAX_SHEET_HEIGHT = 108;
const COST_PER_FOOT = 5;

// Uses the SAME shared packing engine as the Gang Sheet page, so the height
// and cost the calculator quotes always match what production actually gets.
// Returns the total packed height across all sheets (in inches).
function calculateOptimalHeight(items, sheetWidth, hGap, vGap) {
  if (items.length === 0) return 0;
  const margins = { top: 0, bottom: 0, left: 0, right: 0 };
  const result = packSheets(items, sheetWidth, hGap, vGap, margins, MAX_SHEET_HEIGHT);
  // Total height = sum of every sheet's height (same as the Gang Sheet page)
  return result.sheets.reduce((sum, s) => sum + s.totalHeight, 0);
}

function GangSheetCalculator() {
  const [artworks, setArtworks] = useState([{ id: 1, width: 10.75, height: 10.75, qty: 1 }]);
  const [hGap, setHGap] = useState(0.5);
  const [vGap, setVGap] = useState(0.5);
  const nextId = useState(2);

  const addArtwork = () => {
    setArtworks(prev => [...prev, { id: Date.now(), width: 10.75, height: 10.75, qty: 1 }]);
  };

  const removeArtwork = (id) => {
    setArtworks(prev => prev.filter(a => a.id !== id));
  };

  const updateArtwork = (id, field, value) => {
    // Keep the raw string while typing so the field can be cleared and retyped
    // (coercing to a number here would snap an empty field back to 0). Values
    // are parsed to numbers in the calculation below.
    setArtworks(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a));
  };

  // Calculate using same packing algorithm
  const result = useMemo(() => {
    // Expand artworks into items — parse the (possibly string) inputs to numbers.
    const items = [];
    for (const art of artworks) {
      const w = parseFloat(art.width) || 0;
      const h = parseFloat(art.height) || 0;
      const qty = parseInt(art.qty, 10) || 0;
      if (w <= 0 || h <= 0 || qty <= 0) continue;
      for (let i = 0; i < qty; i++) {
        items.push({ w, h });
      }
    }
    if (items.length === 0) return null;

    // Sort by area (largest first) — same as GangSheet
    const totalHeight = calculateOptimalHeight(items, SHEET_WIDTH, hGap, vGap);
    const sheets = Math.ceil(totalHeight / MAX_SHEET_HEIGHT);
    const totalFeet = totalHeight / 12;
    // Billing is per whole foot, rounded UP: 0.9 ft → 1 ft → $5, 1.1 ft → 2 ft → $10.
    const billedFeet = Math.ceil(totalFeet);
    const cost = billedFeet * COST_PER_FOOT;
    const totalArea = SHEET_WIDTH * totalHeight;
    const artworkArea = items.reduce((s, i) => s + i.w * i.h, 0);
    const utilization = totalArea > 0 ? (artworkArea / totalArea * 100) : 0;

    return {
      totalItems: items.length,
      totalHeight: totalHeight.toFixed(1),
      totalFeet: totalFeet.toFixed(2),
      billedFeet,
      sheets,
      cost: cost.toFixed(2),
      utilization: utilization.toFixed(1),
      perItem: items.length > 0 ? (cost / items.length).toFixed(2) : '0',
    };
  }, [artworks, hGap, vGap]);

  const totalQty = artworks.reduce((s, a) => s + (parseInt(a.qty, 10) || 0), 0);

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
                  <td><input type="number" step="1" min="1" value={art.qty} onChange={e => updateArtwork(art.id, 'qty', e.target.value)} /></td>
                  <td className="gsc-area">{((parseFloat(art.width) || 0) * (parseFloat(art.height) || 0)).toFixed(1)} sq"</td>
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
