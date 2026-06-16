import React, { useState } from 'react';
import { DEFAULT_RANKINGS, DEFAULT_TSHIRT_COLORS } from '../utils/contrastUtils';
import './ContrastSettings.css';

function ContrastSettings({ rankings, onRankingsChange, tshirtColors, onTshirtColorsChange, onClose }) {
  const [localRankings, setLocalRankings] = useState([...rankings]);
  const [localTshirtColors, setLocalTshirtColors] = useState([...tshirtColors]);

  // Appearance settings
  const [defaultColor, setDefaultColor] = useState('#000000');
  const [defaultStyle, setDefaultStyle] = useState('front');
  const [simMaxColors, setSimMaxColors] = useState(15);
  const [simOrder, setSimOrder] = useState('top10');

  // Analysis settings
  const [scoringMethod, setScoringMethod] = useState('wcag21');
  const [minScore, setMinScore] = useState(60);
  const [includeSmall, setIncludeSmall] = useState(true);
  const [colorBlindness, setColorBlindness] = useState(false);

  // Display settings
  const [showCmyk, setShowCmyk] = useState(true);
  const [showHex, setShowHex] = useState(true);
  const [showContrastScore, setShowContrastScore] = useState(true);
  const [decimalPrecision, setDecimalPrecision] = useState(2);
  const [zoomDefault, setZoomDefault] = useState('fit');

  // File settings
  const [exportFormat, setExportFormat] = useState('png');
  const [exportResolution, setExportResolution] = useState('300');
  const [saveLocation, setSaveLocation] = useState('');
  const [autoSave, setAutoSave] = useState(true);
  const [autoSaveInterval, setAutoSaveInterval] = useState('5');
  const [recentProjects, setRecentProjects] = useState('10');

  // Other settings
  const [confirmReset, setConfirmReset] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [checkUpdates, setCheckUpdates] = useState(true);
  const [language, setLanguage] = useState('en');

  const handleSave = () => {
    onRankingsChange(localRankings);
    onTshirtColorsChange(localTshirtColors);
    onClose();
  };

  const handleReset = () => {
    setLocalRankings([...DEFAULT_RANKINGS]);
    setLocalTshirtColors([...DEFAULT_TSHIRT_COLORS]);
    setDefaultColor('#000000');
    setDefaultStyle('front');
    setSimMaxColors(15);
    setSimOrder('top10');
    setScoringMethod('wcag21');
    setMinScore(60);
    setIncludeSmall(true);
    setColorBlindness(false);
    setShowCmyk(true);
    setShowHex(true);
    setShowContrastScore(true);
    setDecimalPrecision(2);
    setZoomDefault('fit');
    setExportFormat('png');
    setExportResolution('300');
    setSaveLocation('');
    setAutoSave(true);
    setAutoSaveInterval('5');
    setRecentProjects('10');
    setConfirmReset(true);
    setNotifications(true);
    setCheckUpdates(true);
    setLanguage('en');
  };

  const addRankingLevel = () => {
    setLocalRankings([
      ...localRankings,
      { label: 'New Level', min: 0, max: 0, color: '#6b7280' },
    ]);
  };

  const updateRanking = (index, field, value) => {
    const updated = [...localRankings];
    updated[index] = { ...updated[index], [field]: value };
    setLocalRankings(updated);
  };

  const deleteRanking = (index) => {
    setLocalRankings(localRankings.filter((_, i) => i !== index));
  };

  return (
    <div className="cs-overlay" onClick={onClose}>
      <div className="cs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cs-header">
          <h2 className="cs-title">Contrast Checker Settings</h2>
          <button className="cs-close-btn" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="cs-body">
          {/* Appearance Section */}
          <section className="cs-section">
            <h3 className="cs-section-title">Appearance</h3>

            <div className="cs-field">
              <label className="cs-label">Default Color (Background)</label>
              <div className="cs-color-field">
                <input
                  type="color"
                  value={defaultColor}
                  onChange={(e) => setDefaultColor(e.target.value)}
                  className="cs-color-input"
                />
                <input
                  type="text"
                  value={defaultColor}
                  onChange={(e) => setDefaultColor(e.target.value)}
                  className="cs-text-input cs-hex-field"
                />
              </div>
            </div>

            <div className="cs-field">
              <label className="cs-label">Default Style (Mockup View)</label>
              <div className="cs-toggle-group">
                <button
                  className={`cs-toggle-btn ${defaultStyle === 'front' ? 'active' : ''}`}
                  onClick={() => setDefaultStyle('front')}
                >
                  Front View
                </button>
                <button
                  className={`cs-toggle-btn ${defaultStyle === 'back' ? 'active' : ''}`}
                  onClick={() => setDefaultStyle('back')}
                >
                  Back View
                </button>
              </div>
            </div>

            <div className="cs-field">
              <label className="cs-label">Color Simulator Selector (Maximum)</label>
              <select
                value={simMaxColors}
                onChange={(e) => setSimMaxColors(Number(e.target.value))}
                className="cs-select"
              >
                {[5, 10, 15, 20, 25].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            <div className="cs-field">
              <label className="cs-label">Color Simulator Order</label>
              <select
                value={simOrder}
                onChange={(e) => setSimOrder(e.target.value)}
                className="cs-select"
              >
                <option value="top10">Top 10 By Score</option>
                <option value="alphabetical">Alphabetical</option>
                <option value="custom">Custom Order</option>
              </select>
            </div>

            <div className="cs-field">
              <label className="cs-label">Default Colors in Simulator</label>
              <div className="cs-color-swatches">
                {localTshirtColors.slice(0, simMaxColors).map((tc, i) => (
                  <span
                    key={i}
                    className="cs-swatch"
                    style={{ backgroundColor: tc.hex }}
                    title={tc.name}
                  />
                ))}
              </div>
              <button className="cs-manage-btn">Manage Colors</button>
            </div>
          </section>

          {/* Score Ranking Section */}
          <section className="cs-section">
            <h3 className="cs-section-title">Score Ranking</h3>
            <div className="cs-ranking-table">
              <div className="cs-ranking-header">
                <span>Rating</span>
                <span>Min</span>
                <span>Max</span>
                <span>Color</span>
                <span>Label</span>
                <span></span>
              </div>
              {localRankings.map((rank, idx) => (
                <div key={idx} className="cs-ranking-row">
                  <span className="cs-ranking-badge" style={{ backgroundColor: rank.color + '20', color: rank.color }}>
                    {rank.label}
                  </span>
                  <input
                    type="number"
                    value={rank.min}
                    onChange={(e) => updateRanking(idx, 'min', Number(e.target.value))}
                    className="cs-num-input"
                    min="0"
                    max="100"
                  />
                  <input
                    type="number"
                    value={rank.max}
                    onChange={(e) => updateRanking(idx, 'max', Number(e.target.value))}
                    className="cs-num-input"
                    min="0"
                    max="100"
                  />
                  <input
                    type="color"
                    value={rank.color}
                    onChange={(e) => updateRanking(idx, 'color', e.target.value)}
                    className="cs-color-input-sm"
                  />
                  <input
                    type="text"
                    value={rank.label}
                    onChange={(e) => updateRanking(idx, 'label', e.target.value)}
                    className="cs-text-input cs-label-input"
                  />
                  <button className="cs-delete-btn" onClick={() => deleteRanking(idx)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3,6 5,6 21,6" />
                      <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            <button className="cs-add-level-btn" onClick={addRankingLevel}>
              + Add Rating Level
            </button>
          </section>

          {/* Analysis Settings Section */}
          <section className="cs-section">
            <h3 className="cs-section-title">Analysis Settings</h3>

            <div className="cs-field">
              <label className="cs-label">Contrast Scoring Method</label>
              <select
                value={scoringMethod}
                onChange={(e) => setScoringMethod(e.target.value)}
                className="cs-select"
              >
                <option value="wcag21">WCAG 2.1 Relative Luminance</option>
                <option value="apca">APCA (Advanced)</option>
              </select>
            </div>

            <div className="cs-field">
              <label className="cs-label">Minimum Score to Pass</label>
              <input
                type="number"
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                className="cs-text-input cs-num-field"
                min="0"
                max="100"
              />
            </div>

            <div className="cs-field">
              <label className="cs-label">Rating Scale</label>
              <div className="cs-rating-badges">
                {localRankings.map((rank, idx) => (
                  <span
                    key={idx}
                    className="cs-rating-preview"
                    style={{ backgroundColor: rank.color + '20', color: rank.color }}
                  >
                    {rank.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="cs-field cs-field-inline">
              <label className="cs-label">Include Small Elements</label>
              <label className="cs-switch">
                <input
                  type="checkbox"
                  checked={includeSmall}
                  onChange={(e) => setIncludeSmall(e.target.checked)}
                />
                <span className="cs-switch-slider" />
              </label>
            </div>

            <div className="cs-field cs-field-inline">
              <label className="cs-label">Element Weighting</label>
              <button className="cs-configure-btn">Configure Weights</button>
            </div>

            <div className="cs-field cs-field-inline">
              <label className="cs-label">Simulate Color Blindness</label>
              <label className="cs-switch">
                <input
                  type="checkbox"
                  checked={colorBlindness}
                  onChange={(e) => setColorBlindness(e.target.checked)}
                />
                <span className="cs-switch-slider" />
              </label>
            </div>
          </section>

          {/* Display & View Section */}
          <section className="cs-section">
            <h3 className="cs-section-title">Display & View</h3>

            <div className="cs-field cs-field-inline">
              <label className="cs-label">Show CMYK Values</label>
              <label className="cs-switch">
                <input
                  type="checkbox"
                  checked={showCmyk}
                  onChange={(e) => setShowCmyk(e.target.checked)}
                />
                <span className="cs-switch-slider" />
              </label>
            </div>

            <div className="cs-field cs-field-inline">
              <label className="cs-label">Show HEX Values</label>
              <label className="cs-switch">
                <input
                  type="checkbox"
                  checked={showHex}
                  onChange={(e) => setShowHex(e.target.checked)}
                />
                <span className="cs-switch-slider" />
              </label>
            </div>

            <div className="cs-field cs-field-inline">
              <label className="cs-label">Contrast Score Display</label>
              <label className="cs-switch">
                <input
                  type="checkbox"
                  checked={showContrastScore}
                  onChange={(e) => setShowContrastScore(e.target.checked)}
                />
                <span className="cs-switch-slider" />
              </label>
            </div>

            <div className="cs-field">
              <label className="cs-label">Decimal Precision</label>
              <select
                value={decimalPrecision}
                onChange={(e) => setDecimalPrecision(Number(e.target.value))}
                className="cs-select"
              >
                {[0, 1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            <div className="cs-field">
              <label className="cs-label">Zoom Default</label>
              <select
                value={zoomDefault}
                onChange={(e) => setZoomDefault(e.target.value)}
                className="cs-select"
              >
                <option value="fit">Fit to Screen</option>
                <option value="100">100%</option>
                <option value="75">75%</option>
                <option value="50">50%</option>
              </select>
            </div>
          </section>

          {/* File & Project Section */}
          <section className="cs-section">
            <h3 className="cs-section-title">File & Project</h3>

            <div className="cs-field">
              <label className="cs-label">Export Image Format</label>
              <select
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value)}
                className="cs-select"
              >
                <option value="png">PNG</option>
                <option value="jpg">JPG</option>
                <option value="svg">SVG</option>
                <option value="pdf">PDF</option>
              </select>
            </div>

            <div className="cs-field">
              <label className="cs-label">Export Resolution</label>
              <select
                value={exportResolution}
                onChange={(e) => setExportResolution(e.target.value)}
                className="cs-select"
              >
                <option value="72">72 DPI</option>
                <option value="150">150 DPI</option>
                <option value="300">300 DPI</option>
                <option value="600">600 DPI</option>
              </select>
            </div>

            <div className="cs-field">
              <label className="cs-label">Save Project Location</label>
              <div className="cs-browse-field">
                <input
                  type="text"
                  value={saveLocation}
                  onChange={(e) => setSaveLocation(e.target.value)}
                  className="cs-text-input"
                  placeholder="/path/to/projects"
                />
                <button className="cs-browse-btn">Browse</button>
              </div>
            </div>

            <div className="cs-field cs-field-inline">
              <label className="cs-label">Auto Save</label>
              <label className="cs-switch">
                <input
                  type="checkbox"
                  checked={autoSave}
                  onChange={(e) => setAutoSave(e.target.checked)}
                />
                <span className="cs-switch-slider" />
              </label>
            </div>

            <div className="cs-field">
              <label className="cs-label">Auto Save Interval</label>
              <select
                value={autoSaveInterval}
                onChange={(e) => setAutoSaveInterval(e.target.value)}
                className="cs-select"
              >
                <option value="1">1 minute</option>
                <option value="2">2 minutes</option>
                <option value="5">5 minutes</option>
                <option value="10">10 minutes</option>
              </select>
            </div>

            <div className="cs-field">
              <label className="cs-label">Recent Projects</label>
              <select
                value={recentProjects}
                onChange={(e) => setRecentProjects(e.target.value)}
                className="cs-select"
              >
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="15">15</option>
                <option value="20">20</option>
              </select>
            </div>
          </section>

          {/* Other Settings Section */}
          <section className="cs-section">
            <h3 className="cs-section-title">Other Settings</h3>

            <div className="cs-field cs-field-inline">
              <label className="cs-label">Confirm Before Reset</label>
              <label className="cs-switch">
                <input
                  type="checkbox"
                  checked={confirmReset}
                  onChange={(e) => setConfirmReset(e.target.checked)}
                />
                <span className="cs-switch-slider" />
              </label>
            </div>

            <div className="cs-field cs-field-inline">
              <label className="cs-label">Notifications</label>
              <label className="cs-switch">
                <input
                  type="checkbox"
                  checked={notifications}
                  onChange={(e) => setNotifications(e.target.checked)}
                />
                <span className="cs-switch-slider" />
              </label>
            </div>

            <div className="cs-field cs-field-inline">
              <label className="cs-label">Check for Updates</label>
              <label className="cs-switch">
                <input
                  type="checkbox"
                  checked={checkUpdates}
                  onChange={(e) => setCheckUpdates(e.target.checked)}
                />
                <span className="cs-switch-slider" />
              </label>
            </div>

            <div className="cs-field">
              <label className="cs-label">Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="cs-select"
              >
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
              </select>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="cs-footer">
          <button className="cs-reset-btn" onClick={handleReset}>
            Reset to Defaults
          </button>
          <div className="cs-footer-right">
            <button className="cs-cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button className="cs-save-btn" onClick={handleSave}>
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ContrastSettings;
