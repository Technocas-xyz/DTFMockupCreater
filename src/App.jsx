import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Login from './components/Login';
import DesignCanvas from './components/DesignCanvas';
import ControlPanel from './components/ControlPanel';
import MockupPreview from './components/MockupPreview';
import MultiSizePreview from './components/MultiSizePreview';
import ContrastChecker from './components/ContrastChecker';
import QADefectAnalysis from './components/QADefectAnalysis';
import BGRemover from './components/BGRemover';
import GarmentManager from './components/GarmentManager';
import GangSheet from './components/GangSheet';
import AIArtworkLab from './components/AIArtworkLab';
import UserManagement from './components/UserManagement';
import { TSHIRT_SIZES, TSHIRT_COLORS, SIZE_ORDER } from './constants/tshirtSizes';
import { GARMENTS_API, SERVE_IMAGE_URL, detectApiBase, getGarmentsUrl, getServeImageUrl } from './utils/apiConfig';
import './App.css';

function App() {
  // ─── AUTH STATE ─────────────────────────────────────────────────────────────
  const [authUser, setAuthUser] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // ─── APP STATE (must be declared before any early returns — React hooks rule) ──
  const [currentPage, setCurrentPage] = useState('bgremover');
  const [sharedArtwork, setSharedArtwork] = useState(null);
  const [artwork, setArtwork] = useState(null);
  const [artworkFile, setArtworkFile] = useState(null);
  const [selectedSize, setSelectedSize] = useState('L');
  const [selectedColor, setSelectedColor] = useState(TSHIRT_COLORS[0]);
  const [artworkDimensions, setArtworkDimensions] = useState({ width: 10.75, height: 10.75 });
  const [lockProportion, setLockProportion] = useState(true);
  const [viewSide, setViewSide] = useState('front');
  const [artworkPosition, setArtworkPosition] = useState({ x: 0, y: 0 });
  const artworkScale = 1;
  const [artworkAreaSettings, setArtworkAreaSettings] = useState({ width: 18, height: 24, topOffset: 5 });
  const [selectedMockupSizes, setSelectedMockupSizes] = useState(
    SIZE_ORDER.reduce((acc, size) => ({ ...acc, [size]: false }), {})
  );
  const [showMockups, setShowMockups] = useState(false);
  const [customGarment, setCustomGarment] = useState(null);
  const [garmentLibrary, setGarmentLibrary] = useState([]);
  const [selectedGarmentId, setSelectedGarmentId] = useState(null);
  const [comparisonSizes, setComparisonSizes] = useState([]);
  const [scalingMode, setScalingMode] = useState('proportional');

  // Restore session on mount
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const user = localStorage.getItem('auth_user');
    if (token && user) {
      try {
        setAuthUser(JSON.parse(user));
        setAuthToken(token);
      } catch (e) { localStorage.removeItem('auth_token'); localStorage.removeItem('auth_user'); }
    }
    setAuthLoading(false);
  }, []);

  const handleLogin = (user, token) => {
    setAuthUser(user);
    setAuthToken(token);
  };

  const handleLogout = () => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      detectApiBase().then(base => {
        fetch(`${base}/auth.php?action=logout`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${token}` }
        }).catch(() => {});
      });
    }
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    setAuthUser(null);
    setAuthToken(null);
  };

  // Check page access
  const hasPageAccess = (page) => {
    if (!authUser) return false;
    if (authUser.role === 'superadmin') return true;
    const access = authUser.page_access || [];
    return access.includes(page);
  };

  // Load garment library from server API (shared for all users), fallback to localStorage
  const loadGarmentLibrary = async () => {
    const apiBase = await detectApiBase();
    const apiUrl = `${apiBase}/garments.php`;
    const imageUrl = `${apiBase}/serve-image.php`;

    fetch(apiUrl)
      .then(res => {
        if (!res.ok) throw new Error('Server error');
        return res.json();
      })
      .then(data => {
        if (!Array.isArray(data)) throw new Error('Invalid data');
        const withUrls = data.map(g => ({
          ...g,
          dataUrl: g.dataUrl || (g.imageFile ? `${imageUrl}?file=${g.imageFile}` : null),
        })).filter(g => g.dataUrl); // only include garments that have a valid image
        setGarmentLibrary(withUrls);
        // Keep localStorage in sync
        try { localStorage.setItem('garment-library', JSON.stringify(withUrls)); } catch(e) {}
      })
      .catch(() => {
        // Fallback to localStorage — don't clear existing library on failure
        try {
          const stored = localStorage.getItem('garment-library');
          if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setGarmentLibrary(parsed);
            }
          }
        } catch (e) {}
      });
  };

  useEffect(() => {
    loadGarmentLibrary();
  }, [currentPage]); // Reload when switching pages

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

  // Garment selection is handled by ControlPanel's useEffect (type+size matching)
  // handleGarmentChange is called from ControlPanel when type/size changes

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
          // If both dimensions are smaller than 10.75", scale up the larger one to 10.75"
          const MIN_SIZE = 10.75;
          if (actualW < MIN_SIZE && actualH < MIN_SIZE) {
            if (imgAspect >= 1) {
              // wider — set width to 10.75
              actualW = MIN_SIZE;
              actualH = parseFloat((MIN_SIZE / imgAspect).toFixed(2));
            } else {
              // taller — set height to 10.75
              actualH = MIN_SIZE;
              actualW = parseFloat((MIN_SIZE * imgAspect).toFixed(2));
            }
          }
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

    // Auto-set dimensions from image at 300 DPI (same as handleArtworkUpload)
    const img = new Image();
    img.onload = () => {
      const DPI = 300;
      let actualW = parseFloat((img.naturalWidth / DPI).toFixed(2));
      let actualH = parseFloat((img.naturalHeight / DPI).toFixed(2));
      const imgAspect = img.naturalWidth / img.naturalHeight;
      const maxW = artworkAreaSettings.width;
      const maxH = artworkAreaSettings.height;

      if (actualW <= maxW && actualH <= maxH) {
        // If both dimensions are smaller than 10.75", scale up the larger one to 10.75"
        const MIN_SIZE = 10.75;
        if (actualW < MIN_SIZE && actualH < MIN_SIZE) {
          if (imgAspect >= 1) {
            actualW = MIN_SIZE;
            actualH = parseFloat((MIN_SIZE / imgAspect).toFixed(2));
          } else {
            actualH = MIN_SIZE;
            actualW = parseFloat((MIN_SIZE * imgAspect).toFixed(2));
          }
        }
        setArtworkDimensions({ width: actualW, height: actualH });
      } else {
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
    img.src = imageDataUrl;

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

    if (currentPage === 'ailab') {
      return (
        <AIArtworkLab
          sharedArtwork={sharedArtwork}
          onSendToQA={sendToQA}
          onSendToMockup={sendToMockup}
        />
      );
    }

    if (currentPage === 'users') {
      return <UserManagement authUser={authUser} />;
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
            <div className={`canvas-with-comparison ${comparisonSizes.length > 0 ? 'has-comparison' : ''}`}>
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
              {comparisonSizes.length > 0 && (
                <MultiSizePreview
                  artwork={artwork}
                  selectedColor={selectedColor}
                  artworkDimensions={artworkDimensions}
                  artworkPosition={artworkPosition}
                  artworkScale={artworkScale}
                  artworkAreaSettings={artworkAreaSettings}
                  selectedSizes={comparisonSizes}
                  viewSide={viewSide}
                  garmentLibrary={garmentLibrary}
                  scalingMode={scalingMode}
                  baseSize={selectedSize}
                />
              )}
            </div>
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
              comparisonSizes={comparisonSizes}
              onComparisonSizeToggle={(size) =>
                setComparisonSizes((prev) =>
                  prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
                )
              }
              scalingMode={scalingMode}
              onScalingModeChange={setScalingMode}
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

  // ─── AUTH GATING (after all hooks) ──────────────────────────────────────────
  if (authLoading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh'}}>Loading...</div>;
  if (!authUser) return <Login onLogin={handleLogin} />;

  return (
    <div className="app-layout">
      <Sidebar currentPage={currentPage} onPageChange={(page) => { if (hasPageAccess(page)) setCurrentPage(page); }} authUser={authUser} onLogout={handleLogout} hasPageAccess={hasPageAccess} />
      <main className="main-content">
        {hasPageAccess(currentPage) ? renderPage() : (
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'#64748b'}}>
            <p>You don't have access to this page. Contact your administrator.</p>
          </div>
        )}
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
