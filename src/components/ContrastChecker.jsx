import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  hexToRgb,
  rgbToHex,
  rgbToCmyk,
  getContrastRatio,
  getContrastScore,
  getRating,
  extractColorsFromImage,
  suggestBetterColors,
  getColorName,
  DEFAULT_TSHIRT_COLORS,
  DEFAULT_RANKINGS,
} from '../utils/contrastUtils';
import ContrastSettings from './ContrastSettings';
import './ContrastChecker.css';

function ContrastChecker() {
  const [artwork, setArtwork] = useState(null);
  const [artworkFile, setArtworkFile] = useState(null);
  const [artworkDimensions, setArtworkDimensions] = useState({ width: 0, height: 0 });
  const [extractedColors, setExtractedColors] = useState([]);
  const [backgroundColor, setBackgroundColor] = useState('#000000');
  const [bgOpacity, setBgOpacity] = useState(100);
  const [viewSide, setViewSide] = useState('front');
  const [showSimulator, setShowSimulator] = useState(true);
  const [showMockupView, setShowMockupView] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [rankings, setRankings] = useState(DEFAULT_RANKINGS);
  const [tshirtColors, setTshirtColors] = useState(DEFAULT_TSHIRT_COLORS);
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);

  // Calculate scores for extracted colors
  const bgRgb = hexToRgb(backgroundColor) || { r: 0, g: 0, b: 0 };
  const effectiveBgRgb = {
    r: Math.round(bgRgb.r * (bgOpacity / 100) + 255 * (1 - bgOpacity / 100)),
    g: Math.round(bgRgb.g * (bgOpacity / 100) + 255 * (1 - bgOpacity / 100)),
    b: Math.round(bgRgb.b * (bgOpacity / 100) + 255 * (1 - bgOpacity / 100)),
  };

  const colorElements = extractedColors.map((color, idx) => {
    const ratio = getContrastRatio(color, effectiveBgRgb);
    const score = getContrastScore(ratio);
    const rating = getRating(score, rankings);
    return {
      ...color,
      id: idx,
      ratio,
      score,
      rating,
      type: color.percentage > 20 ? 'Img' : color.percentage > 5 ? 'T' : '#',
    };
  });

  // Summary scores
  const scoreCounts = {
    excellent: colorElements.filter((e) => e.score >= 80).length,
    good: colorElements.filter((e) => e.score >= 60 && e.score < 80).length,
    fair: colorElements.filter((e) => e.score >= 40 && e.score < 60).length,
    poor: colorElements.filter((e) => e.score > 0 && e.score < 40).length,
    avoid: colorElements.filter((e) => e.score === 0).length,
  };

  const overallScore = colorElements.length > 0
    ? Math.round(colorElements.reduce((sum, e) => sum + e.score, 0) / colorElements.length)
    : 0;
  const overallRating = getRating(overallScore, rankings);

  // T-shirt color simulator scores
  const simulatorColors = tshirtColors.map((tc) => {
    const tcRgb = hexToRgb(tc.hex);
    const cmyk = rgbToCmyk(tcRgb.r, tcRgb.g, tcRgb.b);
    // Average score across all artwork colors
    let avgScore = 0;
    if (colorElements.length > 0) {
      avgScore = Math.round(
        colorElements.reduce((sum, el) => {
          const ratio = getContrastRatio(el, tcRgb);
          return sum + getContrastScore(ratio);
        }, 0) / colorElements.length
      );
    }
    const rating = getRating(avgScore, rankings);
    return { ...tc, cmyk, score: avgScore, rating, rgb: tcRgb };
  });

  // Find elements that need replacement (Fair/Poor)
  const needsReplacement = colorElements.filter((e) => e.score < 60);

  const handleFileUpload = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setArtwork(e.target.result);
      setArtworkFile(file);

      // Extract colors using canvas
      const img = new Image();
      img.onload = () => {
        setArtworkDimensions({ width: img.width, height: img.height });
        const canvas = canvasRef.current || document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const colors = extractColorsFromImage(imageData);
        setExtractedColors(colors);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) handleFileUpload(file);
  };

  // Recalculate when background changes
  useEffect(() => {
    // Colors are recalculated via colorElements derived state
  }, [backgroundColor, bgOpacity]);

  return (
    <div className="contrast-checker">
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Top Summary Bar */}
      <div className="cc-summary-bar">
        <div className="cc-summary-left">
          <div className="cc-score-badges">
            <span className="cc-badge cc-badge-excellent">
              <span className="cc-badge-count">{scoreCounts.excellent}</span> Excellent
            </span>
            <span className="cc-badge cc-badge-good">
              <span className="cc-badge-count">{scoreCounts.good}</span> Good
            </span>
            <span className="cc-badge cc-badge-fair">
              <span className="cc-badge-count">{scoreCounts.fair}</span> Fair
            </span>
            <span className="cc-badge cc-badge-poor">
              <span className="cc-badge-count">{scoreCounts.poor}</span> Poor
            </span>
            <span className="cc-badge cc-badge-avoid">
              <span className="cc-badge-count">{scoreCounts.avoid}</span> Avoid
            </span>
          </div>
        </div>
        <div className="cc-summary-right">
          <div className="cc-overall-score">
            <div className="cc-score-circle" style={{ '--score-color': overallRating.color }}>
              <svg viewBox="0 0 100 100" className="cc-score-ring">
                <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="42"
                  fill="none"
                  stroke={overallRating.color}
                  strokeWidth="8"
                  strokeDasharray={`${(overallScore / 100) * 264} 264`}
                  strokeLinecap="round"
                  transform="rotate(-90 50 50)"
                />
              </svg>
              <div className="cc-score-value">
                <span className="cc-score-number">{overallScore}</span>
              </div>
            </div>
            <div className="cc-score-label">
              <span className="cc-score-title">Overall Contrast Score</span>
              <span className="cc-score-rating" style={{ color: overallRating.color }}>
                {overallRating.label.toUpperCase()}
              </span>
            </div>
          </div>
          <button className="cc-settings-btn" onClick={() => setShowSettings(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
            Settings
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="cc-main-panels">
        {/* Left Panel */}
        <div className="cc-left-panel">
          <div className="cc-panel-card">
            <h3 className="cc-panel-title">Upload Artwork</h3>
            <div
              className="cc-upload-zone"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              {artwork ? (
                <div className="cc-upload-preview">
                  <img src={artwork} alt="Artwork preview" />
                  <span className="cc-change-text">Click to change</span>
                </div>
              ) : (
                <>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="17,8 12,3 7,8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <p className="cc-upload-text">Drag & drop or click to upload</p>
                  <span className="cc-upload-hint">PNG, JPG, SVG, PDF</span>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,application/pdf"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </div>

          {/* Current Project Info */}
          {artworkFile && (
            <div className="cc-panel-card">
              <h3 className="cc-panel-title">Current Project</h3>
              <div className="cc-project-info">
                <div className="cc-info-row">
                  <span className="cc-info-label">File:</span>
                  <span className="cc-info-value">{artworkFile.name}</span>
                </div>
                <div className="cc-info-row">
                  <span className="cc-info-label">Dimensions:</span>
                  <span className="cc-info-value">{artworkDimensions.width} × {artworkDimensions.height}px</span>
                </div>
              </div>
            </div>
          )}

          {/* Artwork Preview */}
          {artwork && (
            <div className="cc-panel-card">
              <h3 className="cc-panel-title">Artwork Preview</h3>
              <div className="cc-view-toggle">
                <button
                  className={`cc-view-btn ${viewSide === 'front' ? 'active' : ''}`}
                  onClick={() => setViewSide('front')}
                >
                  Front View
                </button>
                <button
                  className={`cc-view-btn ${viewSide === 'back' ? 'active' : ''}`}
                  onClick={() => setViewSide('back')}
                >
                  Back View
                </button>
              </div>
              <div
                className="cc-artwork-preview"
                style={{ backgroundColor: `rgba(${bgRgb.r},${bgRgb.g},${bgRgb.b},${bgOpacity / 100})` }}
              >
                <img src={artwork} alt="Artwork" />
              </div>
            </div>
          )}

          {/* Background Color */}
          <div className="cc-panel-card">
            <h3 className="cc-panel-title">Background Color</h3>
            <div className="cc-bg-color-picker">
              <div className="cc-color-input-row">
                <input
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="cc-color-picker"
                />
                <input
                  type="text"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="cc-hex-input"
                />
              </div>
              <div className="cc-opacity-slider">
                <label>Opacity: {bgOpacity}%</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={bgOpacity}
                  onChange={(e) => setBgOpacity(Number(e.target.value))}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Middle Panel - Element Analysis */}
        <div className="cc-middle-panel">
          <div className="cc-panel-card">
            <h3 className="cc-panel-title">Element Analysis</h3>
            {colorElements.length > 0 ? (
              <>
                <div className="cc-elements-table">
                  <div className="cc-table-header">
                    <span className="cc-th-element">Element</span>
                    <span className="cc-th-type">Type</span>
                    <span className="cc-th-color">Color</span>
                    <span className="cc-th-score">Score</span>
                    <span className="cc-th-status">Status</span>
                  </div>
                  {colorElements.map((el) => (
                    <div key={el.id} className="cc-table-row">
                      <span className="cc-td-element">
                        {el.name} {el.percentage}%
                      </span>
                      <span className="cc-td-type">
                        <span className="cc-type-badge">{el.type}</span>
                      </span>
                      <span className="cc-td-color">
                        <span className="cc-color-swatch" style={{ backgroundColor: el.hex }} />
                        <span className="cc-color-hex">{el.hex}</span>
                      </span>
                      <span className="cc-td-score">{el.score.toFixed(1)}</span>
                      <span className="cc-td-status">
                        <span
                          className="cc-status-badge"
                          style={{ backgroundColor: el.rating.color + '20', color: el.rating.color }}
                        >
                          {el.rating.label}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
                <a href="#" className="cc-view-all-link" onClick={(e) => e.preventDefault()}>
                  View All Elements →
                </a>
              </>
            ) : (
              <div className="cc-empty-state">
                <p>Upload artwork to analyze color elements</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Color Replacement */}
        <div className="cc-right-panel">
          <div className="cc-panel-card">
            <h3 className="cc-panel-title">Color Replacement</h3>
            {needsReplacement.length > 0 ? (
              <div className="cc-replacements">
                {needsReplacement.slice(0, 3).map((el) => {
                  const suggestions = suggestBetterColors(el, effectiveBgRgb, 60);
                  return (
                    <div key={el.id} className="cc-replacement-item">
                      <div className="cc-current-color">
                        <span className="cc-color-swatch-lg" style={{ backgroundColor: el.hex }} />
                        <div className="cc-current-info">
                          <span className="cc-current-label">Current: {el.name}</span>
                          <span className="cc-current-score" style={{ color: el.rating.color }}>
                            Score: {el.score.toFixed(1)} - {el.rating.label}
                          </span>
                        </div>
                      </div>
                      {suggestions.length > 0 && (
                        <div className="cc-better-options">
                          <span className="cc-options-label">Better Options:</span>
                          {suggestions.slice(0, 3).map((sug, i) => {
                            const sugRating = getRating(sug.score, rankings);
                            return (
                              <div key={i} className="cc-suggestion-row">
                                <span className="cc-color-swatch-sm" style={{ backgroundColor: sug.hex }} />
                                <span className="cc-sug-hex">{sug.hex}</span>
                                <span className="cc-sug-score">{sug.score.toFixed(1)}</span>
                                <span
                                  className="cc-sug-rating"
                                  style={{ color: sugRating.color }}
                                >
                                  {sugRating.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                <a href="#" className="cc-view-all-link" onClick={(e) => e.preventDefault()}>
                  View all replacements →
                </a>
              </div>
            ) : (
              <div className="cc-empty-state">
                {colorElements.length > 0 ? (
                  <p>All elements have good contrast scores!</p>
                ) : (
                  <p>Upload artwork to see suggestions</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom - Color Simulator */}
      <div className="cc-simulator-section">
        <div className="cc-simulator-header">
          <div className="cc-simulator-toggle-row">
            <label className="cc-toggle-label">
              <span>Preview artwork on different background colors</span>
              <input
                type="checkbox"
                checked={showSimulator}
                onChange={(e) => setShowSimulator(e.target.checked)}
                className="cc-toggle-input"
              />
              <span className="cc-toggle-switch" />
            </label>
            <label className="cc-toggle-label">
              <span>Mockup View</span>
              <input
                type="checkbox"
                checked={showMockupView}
                onChange={(e) => setShowMockupView(e.target.checked)}
                className="cc-toggle-input"
              />
              <span className="cc-toggle-switch" />
            </label>
          </div>
        </div>

        {showSimulator && (
          <div className="cc-simulator-grid">
            {simulatorColors.map((tc) => (
              <div key={tc.name} className="cc-simulator-card">
                <div
                  className="cc-simulator-mockup"
                  style={{ backgroundColor: tc.hex }}
                >
                  {artwork && showMockupView ? (
                    <div className="cc-mockup-tshirt">
                      <svg viewBox="0 0 100 120" className="cc-tshirt-svg">
                        <path
                          d="M30 20 L20 25 L10 40 L20 45 L25 35 L25 110 L75 110 L75 35 L80 45 L90 40 L80 25 L70 20 L60 25 L40 25 Z"
                          fill={tc.hex}
                          stroke={tc.hex === '#ffffff' ? '#e2e8f0' : 'none'}
                          strokeWidth="1"
                        />
                      </svg>
                      <img src={artwork} alt="" className="cc-mockup-artwork" />
                    </div>
                  ) : (
                    <div className="cc-simulator-preview">
                      {artwork && <img src={artwork} alt="" />}
                    </div>
                  )}
                </div>
                <div className="cc-simulator-info">
                  <span className="cc-simulator-name">{tc.name}</span>
                  <span className="cc-simulator-cmyk">
                    C{tc.cmyk.c} M{tc.cmyk.m} Y{tc.cmyk.y} K{tc.cmyk.k}
                  </span>
                  <div className="cc-simulator-score-row">
                    <span className="cc-simulator-score">{tc.score}</span>
                    <span
                      className="cc-simulator-rating"
                      style={{ backgroundColor: tc.rating.color + '20', color: tc.rating.color }}
                    >
                      {tc.rating.label}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <ContrastSettings
          rankings={rankings}
          onRankingsChange={setRankings}
          tshirtColors={tshirtColors}
          onTshirtColorsChange={setTshirtColors}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

export default ContrastChecker;
