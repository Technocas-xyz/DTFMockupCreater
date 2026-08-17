import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import GarmentTypes from './components/GarmentTypes';
import BatchProcessor from './components/BatchProcessor';
import MockupEngineV2 from './components/MockupEngineV2';
import Vault from './components/Vault';
import GangSheetCalculator from './components/GangSheetCalculator';
import GangSheetOptimizer from './components/GangSheetOptimizer';
import { TSHIRT_SIZES, TSHIRT_COLORS, SIZE_ORDER } from './constants/tshirtSizes';
import { GARMENTS_API, SERVE_IMAGE_URL, detectApiBase, getGarmentsUrl, getServeImageUrl } from './utils/apiConfig';
import './App.css';

function App() {
  // ─── AUTH STATE ─────────────────────────────────────────────────────────────
  const [authUser, setAuthUser] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // ─── APP STATE (must be declared before any early returns — React hooks rule) ──
  // The vault is where a job starts — pick the customer's file first, then take
  // it to a tool. Opening on an empty editor made that the second step.
  const [currentPage, setCurrentPage] = useState('vault');
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
  const [artworkAreaSettings, setArtworkAreaSettings] = useState({ width: 18, height: 24, topOffset: 7 });
  const [selectedMockupSizes, setSelectedMockupSizes] = useState(
    SIZE_ORDER.reduce((acc, size) => ({ ...acc, [size]: false }), {})
  );
  const [showMockups, setShowMockups] = useState(false);
  const [customGarment, setCustomGarment] = useState(null);
  const [garmentLibrary, setGarmentLibrary] = useState([]);
  const [selectedGarmentId, setSelectedGarmentId] = useState(null);
  const [comparisonSizes, setComparisonSizes] = useState(['L']);
  const [scalingMode, setScalingMode] = useState('proportional');
  const [studioToken, setStudioToken] = useState(null);
  const [studioFileName, setStudioFileName] = useState('artwork.png');
  const [studioSaving, setStudioSaving] = useState(false);
  const [studioMessage, setStudioMessage] = useState('');

  useEffect(() => {
    const handoff = new URLSearchParams(window.location.search).get('artwork');
    if (!handoff) return;
    let active = true;
    detectApiBase().then(async (apiBase) => {
      const meta = await fetch(`${apiBase}/central-artwork.php?action=asset&token=${encodeURIComponent(handoff)}`).then(r => r.json());
      const content = await fetch(`${apiBase}/central-artwork.php?action=content&token=${encodeURIComponent(handoff)}`).then(r => r.blob());
      const dataUrl = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(content); });
      if (!active) return;
      setStudioToken(handoff);
      setStudioFileName(meta.data?.file_name || 'artwork.png');
      setArtwork(dataUrl);
      setArtworkFile(new File([content], meta.data?.file_name || 'artwork.png', { type: content.type || 'image/png' }));
      setCurrentPage('bgremover');
    }).catch(() => { if (active) setStudioMessage('Artwork handoff could not be loaded'); });
    return () => { active = false; };
  }, []);

  // ─── SAVING BACK TO NEXTCLOUD ───────────────────────────────────────────────
  // Each tool saves its own stage of the same design, into that customer's own
  // folder: the editor writes WRK, the mockup writes MU, the gang sheet writes
  // GS. Every save is a new numbered version — nothing is ever overwritten.
  const SAVE_STAGES = {
    bgremover: { kind: 'WRK', label: 'Save WRK', folder: 'Artworks' },
    mockupv2: { kind: 'MU', label: 'Save MU', folder: 'Mockups' },
    gangsheet: { kind: 'GS', label: 'Save GS', folder: 'Gangsheets' },
  };

  // The mockup and gang sheet pages register how to produce their output, so
  // Save asks for the finished render at the moment it is clicked rather than
  // re-rendering on every slider move.
  // Two ways to produce a mockup. The multi-size panel renders at print
  // resolution and is preferred when the designer has generated it; otherwise
  // Save MU uses the design canvas they are actually looking at, so the button
  // never refuses to save a mockup that is plainly on screen.
  const mockupHiResExportRef = useRef(null);
  const mockupCanvasExportRef = useRef(null);
  const gangsheetExportRef = useRef(null);
  const registerMockupHiResExport = useCallback((fn) => { mockupHiResExportRef.current = fn; }, []);
  const registerMockupCanvasExport = useCallback((fn) => { mockupCanvasExportRef.current = fn; }, []);
  const registerGangsheetExport = useCallback((fn) => { gangsheetExportRef.current = fn; }, []);

  // The upload's extension decides the saved file's extension, so a PNG export
  // taken from a .ai source must not be named ".ai".
  const uploadName = (blob) => {
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[blob.type] || 'png';
    return `studio-output.${ext}`;
  };

  const postSave = async (apiBase, kind, blob) => {
    const form = new FormData();
    form.append('token', studioToken);
    form.append('kind', kind);
    form.append('file', new File([blob], uploadName(blob), { type: blob.type || 'image/png' }));
    const response = await fetch(`${apiBase}/central-artwork.php?action=save`, { method: 'POST', body: form });
    const payload = await response.json();
    if (!response.ok || !payload.data?.studio_token) throw new Error(payload.message || 'Save failed');
    return payload.data;
  };

  const saveStudioOutput = async () => {
    const stage = SAVE_STAGES[currentPage];
    if (!stage || !studioToken || studioSaving) return;
    setStudioSaving(true);
    setStudioMessage(`Saving ${stage.kind} to ${stage.folder}…`);
    try {
      const apiBase = await detectApiBase();

      // A gang sheet can be several sheets; each is saved as its own version.
      if (stage.kind === 'GS') {
        const sheets = gangsheetExportRef.current ? await gangsheetExportRef.current() : [];
        if (!sheets.length) throw new Error('Add artwork to the gang sheet first');
        const names = [];
        for (const blob of sheets) {
          const saved = await postSave(apiBase, 'GS', blob);
          setStudioToken(saved.studio_token);
          setStudioFileName(saved.file_name);
          names.push(saved.file_name);
        }
        setStudioMessage(`Saved: ${names.join(', ')}`);
        return;
      }

      let source = artwork;
      if (stage.kind === 'MU') {
        const exporter = mockupHiResExportRef.current || mockupCanvasExportRef.current;
        source = exporter ? await exporter() : null;
      }
      if (!source) {
        throw new Error(stage.kind === 'MU'
          ? 'Place an artwork on the garment first'
          : 'Open an artwork from the Vault first');
      }
      const blob = source instanceof Blob ? source : await fetch(source).then(r => r.blob());
      const saved = await postSave(apiBase, stage.kind, blob);
      setStudioToken(saved.studio_token);
      setStudioFileName(saved.file_name);
      setStudioMessage(`Saved: ${saved.file_name}`);
    } catch (error) {
      setStudioMessage(error.message || 'Save failed');
    } finally { setStudioSaving(false); }
  };

  // Restore session on mount
  useEffect(() => {
    let active = true;
    async function initializeAuth() {
      const token = localStorage.getItem('auth_token');
      const user = localStorage.getItem('auth_user');
      if (token && user) {
        try {
          if (active) { setAuthUser(JSON.parse(user)); setAuthToken(token); setAuthLoading(false); }
          return;
        } catch (e) { localStorage.removeItem('auth_token'); localStorage.removeItem('auth_user'); }
      }
      try {
        const apiBase = await detectApiBase();
        const res = await fetch(`${apiBase}/auth.php?action=sso`, { method: 'POST' });
        if (!res.ok) {
          if (window.location.hostname.endsWith('.decoinkssuite.com')) {
            const rd = `${window.location.origin}${window.location.pathname}${window.location.search}`;
            window.location.replace(`${window.location.origin}/outpost.goauthentik.io/start?rd=${encodeURIComponent(rd)}`);
          }
          return;
        }
        const data = await res.json();
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('auth_user', JSON.stringify(data.user));
        if (active) { setAuthUser(data.user); setAuthToken(data.token); }
      } catch {
        if (window.location.hostname.endsWith('.decoinkssuite.com')) {
          const rd = `${window.location.origin}${window.location.pathname}${window.location.search}`;
          window.location.replace(`${window.location.origin}/outpost.goauthentik.io/start?rd=${encodeURIComponent(rd)}`);
        }
      }
      finally { if (active) setAuthLoading(false); }
    }
    initializeAuth();
    return () => { active = false; };
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

    setCurrentPage('mockupv2');
  };

  // A file checked out of the Artwork Vault. It carries an asset-scoped token,
  // so whatever the designer does next can be saved straight back to that file's
  // customer folder in Nextcloud as a WRK version — no manual re-upload, and no
  // copying artwork between PrintShop and the studio.
  const openVaultAsset = (target, dataUrl, asset) => {
    if (asset?.studio_token) {
      setStudioToken(asset.studio_token);
      setStudioFileName(asset.file_name || 'artwork.png');
    }
    if (target === 'mockupv2') { sendToMockup(dataUrl); return; }
    setSharedArtwork({ dataUrl, filename: asset?.file_name || 'vault-artwork.png' });
    setArtwork(dataUrl);
    setCurrentPage(target);
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
          onArtworkChange={setArtwork}
        />
      );
    }

    if (currentPage === 'vault') {
      return <Vault onOpenAsset={openVaultAsset} />;
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
            setCurrentPage('mockupv2');
          }}
        />
      );
    }

    if (currentPage === 'gangsheet') {
      return <GangSheet sharedArtwork={sharedArtwork} onRegisterExport={registerGangsheetExport} />;
    }

    if (currentPage === 'gscalc') {
      return <GangSheetCalculator />;
    }

    if (currentPage === 'gsoptimize') {
      return <GangSheetOptimizer />;
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

    if (currentPage === 'garment-types') {
      return <GarmentTypes />;
    }

    if (currentPage === 'batch') {
      return <BatchProcessor />;
    }

    if (currentPage === 'mockupv2') {
      return (
        <>
          <header className="top-bar">
            <div className="breadcrumb">
              <span>Mockup Engine V2</span>
              <span className="separator">›</span>
              <span className="active">Design Preview (Beta)</span>
            </div>
            <div className="top-actions">
              <span style={{fontSize:'11px',background:'#f59e0b',color:'white',padding:'3px 8px',borderRadius:'4px'}}>V2 Engine</span>
              <button className="btn-primary">Share / Send</button>
            </div>
          </header>
          <div className="designer-layout">
            <div className="canvas-section">
              <div className="view-controls">
                {['front', 'back'].map((side) => (
                  <button key={side} className={`view-btn ${viewSide === side ? 'active' : ''}`} onClick={() => setViewSide(side)}>
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
                  onRegisterExport={registerMockupCanvasExport}
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
                    customGarment={customGarment}
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
                onMockupSizeToggle={(size) => setSelectedMockupSizes((prev) => ({ ...prev, [size]: !prev[size] }))}
                onGenerateMockups={() => setShowMockups(true)}
                garmentLibrary={garmentLibrary}
                selectedGarmentId={selectedGarmentId}
                onGarmentChange={handleGarmentChange}
                comparisonSizes={comparisonSizes}
                onComparisonSizeToggle={(size) => setComparisonSizes((prev) => prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size])}
                scalingMode={scalingMode}
                onScalingModeChange={setScalingMode}
                viewSide={viewSide}
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
              onRegisterExport={registerMockupHiResExport}
            />
          )}
        </>
      );
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
                onRegisterExport={registerMockupCanvasExport}
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
                  customGarment={customGarment}
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
              viewSide={viewSide}
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
            onRegisterExport={registerMockupHiResExport}
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
        {/* The save bar belongs to the tool that produces the file — it used to
            follow the user onto every page, including User Management. */}
        {studioToken && SAVE_STAGES[currentPage] && (
          <div style={{position:'fixed',right:24,bottom:24,zIndex:50,display:'flex',alignItems:'center',gap:10,background:'#fff',padding:'10px 12px',borderRadius:10,boxShadow:'0 8px 30px rgba(15,23,42,.18)'}}>
            {studioMessage && <span style={{fontSize:12,color:'#475569',maxWidth:360}}>{studioMessage}</span>}
            <button onClick={saveStudioOutput} disabled={studioSaving} className="btn-primary">
              {studioSaving ? 'Saving…' : SAVE_STAGES[currentPage].label}
            </button>
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
