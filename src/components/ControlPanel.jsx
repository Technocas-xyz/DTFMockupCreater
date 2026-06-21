import React, { useRef } from 'react';
import { TSHIRT_COLORS, ARTWORK_SIZES, SIZE_ORDER, TSHIRT_SIZES } from '../constants/tshirtSizes';
import './ControlPanel.css';

function ControlPanel({
  selectedSize,
  onSizeChange,
  selectedColor,
  onColorChange,
  artworkDimensions,
  onDimensionsChange,
  lockProportion,
  onLockProportionChange,
  artwork,
  onArtworkUpload,
  artworkScale,
  onScaleChange,
  artworkPosition,
  onPositionChange,
  onReset,
  artworkAreaSettings,
  onArtworkAreaSettingsChange,
  selectedMockupSizes,
  onMockupSizeToggle,
  onGenerateMockups,
  garmentLibrary,
  selectedGarmentId,
  onGarmentChange,
}) {
  const fileInputRef = useRef(null);
  const aspectRatio = artworkDimensions.width / artworkDimensions.height;

  const handleWidthChange = (newWidth) => {
    const w = parseFloat(newWidth) || 0;
    if (lockProportion && w > 0) {
      const h = parseFloat((w / aspectRatio).toFixed(2));
      onDimensionsChange({ width: w, height: h });
    } else {
      onDimensionsChange({ ...artworkDimensions, width: w });
    }
  };

  const handleHeightChange = (newHeight) => {
    const h = parseFloat(newHeight) || 0;
    if (lockProportion && h > 0) {
      const w = parseFloat((h * aspectRatio).toFixed(2));
      onDimensionsChange({ width: w, height: h });
    } else {
      onDimensionsChange({ ...artworkDimensions, height: h });
    }
  };

  // Auto-fit artwork to fill available print area proportionally
  const handleAutoFit = () => {
    const availableW = artworkAreaSettings.width;
    const availableH = artworkAreaSettings.height;

    if (lockProportion) {
      // Fit within available area maintaining current aspect ratio
      const fitByWidth = { width: availableW, height: availableW / aspectRatio };
      const fitByHeight = { width: availableH * aspectRatio, height: availableH };

      if (fitByWidth.height <= availableH) {
        onDimensionsChange({ width: parseFloat(fitByWidth.width.toFixed(2)), height: parseFloat(fitByWidth.height.toFixed(2)) });
      } else {
        onDimensionsChange({ width: parseFloat(fitByHeight.width.toFixed(2)), height: parseFloat(fitByHeight.height.toFixed(2)) });
      }
    } else {
      onDimensionsChange({ width: parseFloat(availableW.toFixed(2)), height: parseFloat(availableH.toFixed(2)) });
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      onArtworkUpload(file);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      onArtworkUpload(file);
    }
  };

  return (
    <div className="control-panel">
      {/* Upload Section */}
      <section className="panel-section">
        <h3 className="section-title">
          <span className="step-number">1</span>
          Upload Artwork
        </h3>
        <div
          className="upload-zone"
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          {artwork ? (
            <div className="upload-preview">
              <img src={artwork} alt="Artwork" />
              <span className="change-text">Click to change</span>
            </div>
          ) : (
            <>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17,8 12,3 7,8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p>Drop artwork here or click to upload</p>
              <span className="upload-hint">PNG, JPG, SVG — Max 50MB</span>
            </>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </section>

      {/* Size Selection */}
      <section className="panel-section">
        <h3 className="section-title">
          <span className="step-number">2</span>
          Select Size ({selectedSize})
        </h3>
        <div className="size-grid">
          {SIZE_ORDER.map((size) => (
            <button
              key={size}
              className={`size-btn ${selectedSize === size ? 'active' : ''}`}
              onClick={() => onSizeChange(size)}
            >
              {size}
            </button>
          ))}
        </div>
        {/* Size Chart for selected size */}
        <div className="size-chart-info">
          <table className="size-chart-table">
            <tbody>
              <tr>
                <td>Body Width</td>
                <td><strong>{TSHIRT_SIZES[selectedSize].bodyWidth}"</strong></td>
              </tr>
              <tr>
                <td>Body Length</td>
                <td><strong>{TSHIRT_SIZES[selectedSize].bodyLength}"</strong></td>
              </tr>
              <tr>
                <td>Print Area (Max)</td>
                <td><strong>{TSHIRT_SIZES[selectedSize].maxPrintWidth}" × {TSHIRT_SIZES[selectedSize].maxPrintHeight}"</strong></td>
              </tr>
              <tr>
                <td>Top Offset</td>
                <td><strong>{artworkAreaSettings.topOffset}"</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Artwork Size */}
      <section className="panel-section">
        <h3 className="section-title">
          <span className="step-number">3</span>
          Artwork Size
        </h3>
        <div className="artwork-size-grid">
          <div className="artwork-size-heading">W (set width, auto height)</div>
          {ARTWORK_SIZES.filter(s => s.lockBy === 'width').map((size) => (
            <button
              key={size.label}
              className={`artwork-size-btn ${
                artworkDimensions.width === size.width && size.lockBy === 'width' ? 'active' : ''
              }`}
              onClick={() => {
                const newW = size.width;
                const newH = parseFloat((newW / aspectRatio).toFixed(2));
                onDimensionsChange({ width: newW, height: newH });
              }}
            >
              {size.label}
            </button>
          ))}
          <div className="artwork-size-heading">H (set height, auto width)</div>
          {ARTWORK_SIZES.filter(s => s.lockBy === 'height').map((size) => (
            <button
              key={size.label}
              className={`artwork-size-btn ${
                artworkDimensions.height === size.height && size.lockBy === 'height' ? 'active' : ''
              }`}
              onClick={() => {
                const newH = size.height;
                const newW = parseFloat((newH * aspectRatio).toFixed(2));
                onDimensionsChange({ width: newW, height: newH });
              }}
            >
              {size.label}
            </button>
          ))}
          <button
            className={`artwork-size-btn`}
            onClick={() => {}}
            style={{ opacity: 0.6 }}
          >
            Custom
          </button>
        </div>

        {/* Width & Height inputs with lock proportion */}
        <div className="dimension-inputs">
          <div className="dimension-field">
            <label>Width</label>
            <div className="input-with-unit">
              <input
                type="number"
                min="1"
                max="30"
                step="0.5"
                value={artworkDimensions.width}
                onChange={(e) => handleWidthChange(e.target.value)}
              />
              <span className="unit">in</span>
            </div>
          </div>

          <button
            className={`lock-btn ${lockProportion ? 'locked' : ''}`}
            onClick={() => onLockProportionChange(!lockProportion)}
            title={lockProportion ? 'Unlock proportions' : 'Lock proportions'}
          >
            {lockProportion ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 019.9-1" />
              </svg>
            )}
          </button>

          <div className="dimension-field">
            <label>Height</label>
            <div className="input-with-unit">
              <input
                type="number"
                min="1"
                max="30"
                step="0.5"
                value={artworkDimensions.height}
                onChange={(e) => handleHeightChange(e.target.value)}
              />
              <span className="unit">in</span>
            </div>
          </div>
        </div>

        <button className="btn-auto-fit" onClick={handleAutoFit}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
          Auto Fit to Print Area
        </button>

        <div className="info-tip">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>For XL and above, we recommend 12x14" or larger for best visual balance.</span>
        </div>
      </section>

      {/* Artwork Area Placement */}
      <section className="panel-section">
        <h3 className="section-title">
          <span className="step-number">4</span>
          Artwork Area
        </h3>
        <div className="area-settings-grid">
          <div className="area-setting-field">
            <label>Width</label>
            <div className="input-with-unit">
              <input
                type="number"
                min="1"
                max="30"
                step="0.5"
                value={artworkAreaSettings.width}
                onChange={(e) => onArtworkAreaSettingsChange({
                  ...artworkAreaSettings,
                  width: parseFloat(e.target.value) || 0
                })}
              />
              <span className="unit">in</span>
            </div>
          </div>
          <div className="area-setting-field">
            <label>Height</label>
            <div className="input-with-unit">
              <input
                type="number"
                min="1"
                max="30"
                step="0.5"
                value={artworkAreaSettings.height}
                onChange={(e) => onArtworkAreaSettingsChange({
                  ...artworkAreaSettings,
                  height: parseFloat(e.target.value) || 0
                })}
              />
              <span className="unit">in</span>
            </div>
          </div>
          <div className="area-setting-field">
            <label>Top Offset</label>
            <div className="input-with-unit">
              <input
                type="number"
                min="0"
                max="15"
                step="0.25"
                value={artworkAreaSettings.topOffset}
                onChange={(e) => onArtworkAreaSettingsChange({
                  ...artworkAreaSettings,
                  topOffset: parseFloat(e.target.value) || 0
                })}
              />
              <span className="unit">in</span>
            </div>
          </div>
        </div>
        <p className="area-info">Fixed print area: {artworkAreaSettings.width}" × {artworkAreaSettings.height}" starting {artworkAreaSettings.topOffset}" from top</p>
      </section>

      {/* Garment Selector */}
      {garmentLibrary && garmentLibrary.length > 0 && (
        <section className="panel-section">
          <h3 className="section-title">
            <span className="step-number">5</span>
            Select Garment
          </h3>
          <select
            className="garment-select"
            value={selectedGarmentId || 'default'}
            onChange={(e) => onGarmentChange(e.target.value === 'default' ? null : e.target.value)}
          >
            <option value="default">Default T-Shirt</option>
            {garmentLibrary.map((g) => (
              <option key={g.id} value={g.id}>{g.name} ({g.type})</option>
            ))}
          </select>
        </section>
      )}

      {/* Color Selection */}
      <section className="panel-section">
        <h3 className="section-title">
          <span className="step-number">{garmentLibrary && garmentLibrary.length > 0 ? '6' : '5'}</span>
          Select Color
        </h3>
        <div className="color-grid">
          {TSHIRT_COLORS.map((color) => (
            <button
              key={color.name}
              className={`color-btn ${selectedColor.name === color.name ? 'active' : ''}`}
              style={{ backgroundColor: color.hex }}
              onClick={() => onColorChange(color)}
              title={color.name}
            >
              {selectedColor.name === color.name && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color.hex === '#ffffff' ? '#333' : 'white'} strokeWidth="3">
                  <polyline points="20,6 9,17 4,12" />
                </svg>
              )}
            </button>
          ))}
          {/* Custom color picker */}
          <label
            className={`color-btn color-btn-custom ${selectedColor.name === 'Custom' ? 'active' : ''}`}
            title="Pick custom color"
          >
            <input
              type="color"
              value={selectedColor.name === 'Custom' ? selectedColor.hex : '#888888'}
              onChange={(e) => onColorChange({ name: 'Custom', hex: e.target.value })}
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
            />
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={selectedColor.name === 'Custom' ? 'white' : '#666'} strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a10 10 0 0 1 0 20 10 10 0 0 1 0-20" />
              <path d="M2 12h4M18 12h4M12 2v4M12 18v4" />
            </svg>
          </label>
        </div>
        {selectedColor.name === 'Custom' && (
          <div className="custom-color-display">
            Custom: <span style={{ color: selectedColor.hex, fontWeight: 700 }}>{selectedColor.hex}</span>
          </div>
        )}
      </section>

      {/* Position Controls */}
      {artwork && (
        <section className="panel-section">
          <h3 className="section-title">
            <span className="step-number">6</span>
            Adjust Position
          </h3>
          <div className="adjustment-controls">
            <div className="control-row">
              <label>X Offset</label>
              <div className="slider-group">
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={Math.round(artworkPosition.x)}
                  onChange={(e) => onPositionChange({ ...artworkPosition, x: Number(e.target.value) })}
                />
                <span className="slider-value">{Math.round(artworkPosition.x)}px</span>
              </div>
            </div>
            <div className="control-row">
              <label>Y Offset</label>
              <div className="slider-group">
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={Math.round(artworkPosition.y)}
                  onChange={(e) => onPositionChange({ ...artworkPosition, y: Number(e.target.value) })}
                />
                <span className="slider-value">{Math.round(artworkPosition.y)}px</span>
              </div>
            </div>
            <button className="btn-reset" onClick={onReset}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              Reset Position
            </button>
          </div>
        </section>
      )}

      {/* Mockup Preview Sizes */}
      <section className="panel-section">
        <h3 className="section-title">
          <span className="step-number">7</span>
          Generate Mockups
        </h3>
        <div className="mockup-size-selection">
          {SIZE_ORDER.map((size) => (
            <label key={size} className="mockup-checkbox">
              <input
                type="checkbox"
                checked={selectedMockupSizes[size]}
                onChange={() => onMockupSizeToggle(size)}
              />
              <span className="checkmark"></span>
              <span>{size}</span>
            </label>
          ))}
        </div>
        <button
          className="btn-generate"
          onClick={onGenerateMockups}
          disabled={!artwork}
        >
          Generate All Mockups
        </button>
      </section>
    </div>
  );
}

export default ControlPanel;
