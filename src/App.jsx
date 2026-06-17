import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import DesignCanvas from './components/DesignCanvas';
import ControlPanel from './components/ControlPanel';
import MockupPreview from './components/MockupPreview';
import ContrastChecker from './components/ContrastChecker';
import QADefectAnalysis from './components/QADefectAnalysis';
import BGRemover from './components/BGRemover';
import GarmentManager from './components/GarmentManager';
import GangSheet from './components/GangSheet';
import { TSHIRT_SIZES, TSHIRT_COLORS, SIZE_ORDER } from './constants/tshirtSizes';
import './App.css';

function App() {
  const [currentPage, setCurrentPage] = useState('bgremover');
  const [sharedArtwork, setSharedArtwork] = useState(null);
  const [artwork, setArtwork] = useState(null);
  const [artworkFile, setArtworkFile] = useState(null);
  const [selectedSize, setSelectedSize] = useState('XL');
  const [selectedColor, setSelectedColor] = useState(TSHIRT_COLORS[0]);
  const [artworkDimensions, setArtworkDimensions] = useState({ width: 9, height: 12 });
  const [lockProportion, setLockProportion] = useState(true);
  const [viewSide, setViewSide] = useState('front');
  const [artworkPosition, setArtworkPosition] = useState({ x: 0, y: 0 });
  const artworkScale = 1; // Fixed at 1 — size controlled by width/height inputs only
  // Artwork area placement settings — fixed default 13x16
  const [artworkAreaSettings, setArtworkAreaSettings] = useState({
    width: 13,
    height: 16,
    topOffset: 3,
  });
  const [selectedMockupSizes, setSelectedMockupSizes] = useState(
    SIZE_ORDER.reduce((acc, size) => ({ ...acc, [size]: true }), {})
  );
  const [showMockups, setShowMockups] = useState(false);
  const [customGarment, setCustomGarment] = useState(null);
  const [garmentLibrary, setGarmentLibrary] = useState([]);
  const [selectedGarmentId, setSelectedGarmentId] = useState(null);

  // Load garment library from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('garment-library');
      if (stored) setGarmentLibrary(JSON.parse(stored));
    } catch (e) {}
  }, [currentPage]); // Reload when switching pages (in case garments were added)

  // Handle garment selection change
  const handleGarmentChange = (garmentId) => {
    setSelectedGarmentId(garmentId);
    if (garmentId) {
      const garment = garmentLibrary.find(g => g.id === garmentId);
      if (garment) setCustomGarment(garment);
    } else {
      setCustomGarment(null);
    }
  };

  // Auto-load tagged garment when size changes (don't change artwork area)
  useEffect(() => {
    // Only load garment if one is specifically tagged for this exact size
    const taggedGarment = garmentLibrary.find(g => g.size === selectedSize);
    if (taggedGarment) {
      setCustomGarment(taggedGarment);
      setSelectedGarmentId(taggedGarment.id);
    } else {
      setCustomGarment(null);
      setSelectedGarmentId(null);
    }
  }, [selectedSize, garmentLibrary]);

  const handleArtworkUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setArtwork(e.target.result);
      setArtworkFile(file);

      // Auto-set artwork dimensions based on actual image DPI size
      const img = new Image();
      img.onload = () => {
        const DPI = 300;
        // Calculate actual physical size at 300 DPI
        let actualW = parseFloat((img.naturalWidth / DPI).toFixed(2));
        let actualH = parseFloat((img.naturalHeight / DPI).toFixed(2));
        const imgAspect = img.naturalWidth / img.naturalHeight;
        const maxW = artworkAreaSettings.width;
        const maxH = artworkAreaSettings.height;

        // Only scale down if the actual size exceeds the print area
        if (actualW <= maxW && actualH <= maxH) {
          // Fits within print area — use actual DPI-based dimensions
          setArtworkDimensions({ width: actualW, height: actualH });
        } else {
          // Too large — scale down to fit within print area maintaining aspect ratio
          let newW, newH;
          if (imgAspect > maxW / maxH) {
            newW = maxW;
            newH = parseFloat((maxW / imgAspect).toFixed(2));
          } else {
            newH = maxH;
            newW = parseFloat((maxH * imgAspect).toFixed(2));
          }
          setArtworkDimensions({ width: newW, height: newH });
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handlePositionChange = (pos) => {
    setArtworkPosition(pos);
  };

  const resetPosition = () => {
    setArtworkPosition({ x: 0, y: 0 });
  };

  // Cross-page navigation with shared artwork
  const sendToQA = (imageDataUrl) => {
    setSharedArtwork({ dataUrl: imageDataUrl, filename: 'processed-artwork.png' });
    setCurrentPage('qa');
  };

  const sendToMockup = (imageDataUrl) => {
    setSharedArtwork({ dataUrl: imageDataUrl, filename: 'processed-artwork.png' });
    // Also load into the design canvas artwork
    setArtwork(imageDataUrl);
    setCurrentPage('orders');
  };

  const sendToBGRemover = (imageDataUrl) => {
    setSharedArtwork({ dataUrl: imageDataUrl, filename: 'artwork.png' });
    setCurrentPage('bgremover');
  };

  const renderPage = () => {
    if (currentPage === 'bgremover') {
      return (
        <BGRemover
          sharedArtwork={sharedArtwork}
          onSendToQA={sendToQA}
          onSendToMockup={sendToMockup}
        />
      );
    }

    if (currentPage === 'contrast') {
      return <ContrastChecker />;
    }

    if (currentPage === 'qa') {
      return (
        <QADefectAnalysis
          sharedArtwork={sharedArtwork}
          onSendToBGRemover={sendToBGRemover}
          onSendToMockup={sendToMockup}
        />
      );
    }

    if (currentPage === 'garments') {
      return (
        <GarmentManager
          onUseAsMockup={(garment) => {
            setCustomGarment(garment);
            setCurrentPage('orders');
          }}
        />
      );
    }

    if (currentPage === 'gangsheet') {
      return <GangSheet sharedArtwork={sharedArtwork} />;
    }

    // Default: Design Preview page (orders)
    return (
      <>
        <header className="top-bar">
          <div className="breadcrumb">
            <span>Orders</span>
            <span className="separator">›</span>
            <span>PS-{new Date().toISOString().slice(2, 10).replace(/-/g, '')}-001</span>
            <span className="separator">›</span>
            <span className="active">Design Preview</span>
          </div>
          <div className="top-actions">
            <button className="btn-secondary">Save as Template</button>
            <button className="btn-primary">Share / Send</button>
          </div>
        </header>

        <div className="designer-layout">
          <div className="canvas-section">
            <div className="view-controls">
              {['front', 'back'].map((side) => (
                <button
                  key={side}
                  className={`view-btn ${viewSide === side ? 'active' : ''}`}
                  onClick={() => setViewSide(side)}
                >
                  <ViewIcon side={side} />
                  <span>{side.charAt(0).toUpperCase() + side.slice(1)}</span>
                </button>
              ))}
            </div>
            <DesignCanvas
              artwork={artwork}
              selectedSize={selectedSize}
              selectedColor={selectedColor}
              artworkDimensions={artworkDimensions}
              viewSide={viewSide}
              artworkPosition={artworkPosition}
              artworkScale={artworkScale}
              artworkAreaSettings={artworkAreaSettings}
              onPositionChange={handlePositionChange}
              customGarment={customGarment}
            />
          </div>

          <div className="controls-section">
            <ControlPanel
              selectedSize={selectedSize}
              onSizeChange={setSelectedSize}
              selectedColor={selectedColor}
              onColorChange={setSelectedColor}
              artworkDimensions={artworkDimensions}
              onDimensionsChange={setArtworkDimensions}
              lockProportion={lockProportion}
              onLockProportionChange={setLockProportion}
              artwork={artwork}
              onArtworkUpload={handleArtworkUpload}
              artworkScale={artworkScale}
              artworkPosition={artworkPosition}
              onPositionChange={handlePositionChange}
              onReset={resetPosition}
              artworkAreaSettings={artworkAreaSettings}
              onArtworkAreaSettingsChange={setArtworkAreaSettings}
              selectedMockupSizes={selectedMockupSizes}
              onMockupSizeToggle={(size) =>
                setSelectedMockupSizes((prev) => ({ ...prev, [size]: !prev[size] }))
              }
              onGenerateMockups={() => setShowMockups(true)}
              garmentLibrary={garmentLibrary}
              selectedGarmentId={selectedGarmentId}
              onGarmentChange={handleGarmentChange}
            />
          </div>
        </div>

        {showMockups && (
          <MockupPreview
            artwork={artwork}
            selectedColor={selectedColor}
            artworkDimensions={artworkDimensions}
            artworkPosition={artworkPosition}
            artworkScale={artworkScale}
            artworkAreaSettings={artworkAreaSettings}
            selectedMockupSizes={selectedMockupSizes}
            viewSide={viewSide}
            garmentLibrary={garmentLibrary}
          />
        )}
      </>
    );
  };

  return (
    <div className="app-layout">
      <Sidebar currentPage={currentPage} onPageChange={setCurrentPage} />
      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  );
}

function ViewIcon({ side }) {
  if (side === 'front') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2L8 6H4v14h16V6h-4L12 2z" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2L8 6H4v14h16V6h-4L12 2z" />
      <line x1="12" y1="6" x2="12" y2="10" />
    </svg>
  );
}

export default App;
