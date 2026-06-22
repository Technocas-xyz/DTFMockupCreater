import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { TSHIRT_SIZES } from '../constants/tshirtSizes';
import { GARMENTS_API, SERVE_IMAGE_URL, detectApiBase } from '../utils/apiConfig';
import './GarmentManager.css';

const GARMENT_TYPES = ['T-Shirt', 'Hoodie', 'Long Sleeve', 'Tank Top', 'Other'];
const STORAGE_KEY = 'garment-library';
const MAX_GARMENTS = 500;
const SIZE_OPTIONS = ['2T','3T','4T','5T','YS','YM','YL','YXL','S','M','L','XL','2XL','3XL','4XL','5XL'];
const GENDER_OPTIONS = ['Unisex', 'Male', 'Female'];
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function trimTransparentPixels(imageDataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data, width, height } = imageData;

      let top = height, bottom = 0, left = width, right = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const alpha = data[(y * width + x) * 4 + 3];
          if (alpha > 0) {
            if (y < top) top = y;
            if (y > bottom) bottom = y;
            if (x < left) left = x;
            if (x > right) right = x;
          }
        }
      }

      if (top > bottom || left > right) {
        resolve({ dataUrl: imageDataUrl, width: img.width, height: img.height });
        return;
      }

      const trimW = right - left + 1;
      const trimH = bottom - top + 1;
      const trimCanvas = document.createElement('canvas');
      trimCanvas.width = trimW;
      trimCanvas.height = trimH;
      const trimCtx = trimCanvas.getContext('2d');
      trimCtx.drawImage(img, left, top, trimW, trimH, 0, 0, trimW, trimH);
      resolve({ dataUrl: trimCanvas.toDataURL('image/png'), width: trimW, height: trimH });
    };
    img.src = imageDataUrl;
  });
}

function GarmentManager({ onUseAsMockup }) {
  // View state
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'card'
  const [library, setLibrary] = useState([]);
  const [selectedGarment, setSelectedGarment] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPreviewPanel, setShowPreviewPanel] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterGender, setFilterGender] = useState('');
  const [filterSize, setFilterSize] = useState('');
  const [filterColor, setFilterColor] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Messages
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // API URLs
  const [API_URL, setApiUrl] = useState(GARMENTS_API);
  const [IMAGE_URL, setImageUrl] = useState(SERVE_IMAGE_URL);

  // Add Modal state
  const [modalImage, setModalImage] = useState(null);
  const [modalDragOver, setModalDragOver] = useState(false);
  const [modalFields, setModalFields] = useState({
    description: '',
    gender: 'Unisex',
    brand: '',
    styleNo: '',
    type: 'T-Shirt',
    size: 'XL',
    side: 'front',
    color: '',
    colorHex: '#000000',
    autoTrim: true,
  });
  const [modalBodyMapping, setModalBodyMapping] = useState({
    shirtWidthInches: 20,
    shirtHeightInches: 29,
    widthInches: 13,
    heightInches: 14.5,
    topOffsetInches: 3,
  });
  const [modalSaving, setModalSaving] = useState(false);

  const modalFileInputRef = useRef(null);
  const replaceFileInputRef = useRef(null);

  // Load library from server
  useEffect(() => {
    detectApiBase().then(base => {
      const apiUrl = `${base}/garments.php`;
      const imgUrl = `${base}/serve-image.php`;
      setApiUrl(apiUrl);
      setImageUrl(imgUrl);

      fetch(apiUrl)
        .then(res => {
          if (!res.ok) throw new Error('Server error');
          return res.json();
        })
        .then(data => {
          if (!Array.isArray(data)) throw new Error('Invalid data');
          const withUrls = data.map(g => ({
            ...g,
            dataUrl: g.dataUrl || (g.imageFile ? `${imgUrl}?file=${g.imageFile}` : null),
          })).filter(g => g.dataUrl);
          setLibrary(withUrls);
        })
        .catch(e => {
          console.warn('Failed to load from server, trying localStorage', e);
          try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) setLibrary(JSON.parse(stored));
          } catch (err) {}
        });
    });
  }, []);

  // Save library helper
  const saveLibrary = (newLibrary) => {
    setLibrary(newLibrary);
    try {
      const metaOnly = newLibrary.map(({ dataUrl, ...rest }) => rest);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(metaOnly));
    } catch (e) {}
  };

  // Filtered and paginated data
  const filteredLibrary = useMemo(() => {
    let results = [...library];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      results = results.filter(g =>
        (g.styleNo && g.styleNo.toLowerCase().includes(q)) ||
        (g.description && g.description.toLowerCase().includes(q)) ||
        (g.name && g.name.toLowerCase().includes(q)) ||
        (g.brand && g.brand.toLowerCase().includes(q))
      );
    }
    if (filterBrand) results = results.filter(g => g.brand === filterBrand);
    if (filterType) results = results.filter(g => g.type === filterType);
    if (filterGender) results = results.filter(g => g.gender === filterGender);
    if (filterSize) results = results.filter(g => g.size === filterSize);
    if (filterColor) results = results.filter(g => g.color && g.color.toLowerCase() === filterColor.toLowerCase());
    return results;
  }, [library, searchQuery, filterBrand, filterType, filterGender, filterSize, filterColor]);

  const totalPages = Math.max(1, Math.ceil(filteredLibrary.length / pageSize));
  const paginatedLibrary = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLibrary.slice(start, start + pageSize);
  }, [filteredLibrary, currentPage, pageSize]);

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1); }, [searchQuery, filterBrand, filterType, filterGender, filterSize, filterColor, pageSize]);

  // Unique values for filter dropdowns
  const uniqueBrands = useMemo(() => [...new Set(library.map(g => g.brand).filter(Boolean))], [library]);
  const uniqueColors = useMemo(() => [...new Set(library.map(g => g.color).filter(Boolean))], [library]);

  // Reset filters
  const resetFilters = () => {
    setSearchQuery('');
    setFilterBrand('');
    setFilterType('');
    setFilterGender('');
    setFilterSize('');
    setFilterColor('');
  };

  // Handle modal file upload
  const handleModalFile = useCallback(async (file) => {
    if (!file || !file.type.includes('png')) {
      setErrorMsg('Only PNG files are accepted.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      const img = new Image();
      img.onload = async () => {
        let finalDataUrl = dataUrl;
        let finalW = img.width, finalH = img.height;
        if (modalFields.autoTrim) {
          const trimmed = await trimTransparentPixels(dataUrl);
          finalDataUrl = trimmed.dataUrl;
          finalW = trimmed.width;
          finalH = trimmed.height;
        }
        const DPI = 300;
        const autoW = parseFloat((finalW / DPI).toFixed(2));
        const autoH = parseFloat((finalH / DPI).toFixed(2));
        setModalImage({ dataUrl: finalDataUrl, width: finalW, height: finalH, fileName: file.name });
        setModalBodyMapping(prev => ({ ...prev, shirtWidthInches: autoW, shirtHeightInches: autoH }));
        if (!modalFields.description) {
          setModalFields(prev => ({ ...prev, description: file.name.replace('.png', '').replace(/[-_]/g, ' ') }));
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, [modalFields.autoTrim, modalFields.description]);

  // Save garment (from modal)
  const saveGarment = () => {
    if (!modalImage) { setErrorMsg('Please upload an image first.'); return; }
    if (library.length >= MAX_GARMENTS) {
      setErrorMsg(`Maximum ${MAX_GARMENTS} garments allowed. Delete one first.`);
      return;
    }

    setModalSaving(true);
    const img = new Image();
    img.onload = () => {
      const maxSize = 800;
      let w = img.width, h = img.height;
      if (w > maxSize || h > maxSize) {
        if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
        else { w = Math.round(w * maxSize / h); h = maxSize; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const compressedUrl = canvas.toDataURL('image/png');

      const newGarment = {
        name: modalFields.description || 'Untitled',
        description: modalFields.description || '',
        gender: modalFields.gender,
        brand: modalFields.brand,
        styleNo: modalFields.styleNo,
        type: modalFields.type,
        size: modalFields.size,
        side: modalFields.side,
        color: modalFields.color,
        colorHex: modalFields.colorHex,
        dataUrl: compressedUrl,
        width: modalImage.width,
        height: modalImage.height,
        fileName: modalImage.fileName,
        bodyMapping: { ...modalBodyMapping },
        createdAt: new Date().toISOString(),
      };

      fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newGarment),
      })
        .then(res => {
          if (!res.ok) throw new Error(`Server error: ${res.status}`);
          return res.json();
        })
        .then(saved => {
          if (saved.error) throw new Error(saved.error);
          saved.dataUrl = compressedUrl;
          const newLibrary = [...library, saved];
          saveLibrary(newLibrary);
          setSuccessMsg('Garment saved successfully!');
          setTimeout(() => setSuccessMsg(''), 3000);
          closeModal();
        })
        .catch(e => {
          console.error('Server save failed:', e);
          newGarment.id = Date.now().toString();
          newGarment.imageFile = null;
          const newLibrary = [...library, newGarment];
          saveLibrary(newLibrary);
          setSuccessMsg('Saved locally (server unavailable).');
          setTimeout(() => setSuccessMsg(''), 3000);
          closeModal();
        })
        .finally(() => setModalSaving(false));
    };
    img.src = modalImage.dataUrl;
  };

  // Delete garment
  const deleteFromLibrary = (id) => {
    const newLibrary = library.filter((g) => g.id !== id);
    saveLibrary(newLibrary);
    if (selectedGarment && selectedGarment.id === id) {
      setSelectedGarment(null);
      setShowPreviewPanel(false);
    }
    fetch(API_URL, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  };

  // Select garment for preview
  const selectGarment = (garment) => {
    setSelectedGarment(garment);
    setShowPreviewPanel(true);
  };

  // Use as mockup
  const handleUseAsMockup = (garment) => {
    const g = garment || selectedGarment;
    if (!g) return;
    onUseAsMockup({
      dataUrl: g.dataUrl,
      bodyMapping: g.bodyMapping || { shirtWidthInches: 20, shirtHeightInches: 29, widthInches: 13, heightInches: 14.5, topOffsetInches: 3 },
      name: g.name || g.description || 'Custom Garment',
      type: g.type,
      side: g.side || 'front',
    });
  };

  // Close modal and reset
  const closeModal = () => {
    setShowAddModal(false);
    setModalImage(null);
    setModalFields({
      description: '', gender: 'Unisex', brand: '', styleNo: '',
      type: 'T-Shirt', size: 'XL', side: 'front', color: '', colorHex: '#000000', autoTrim: true,
    });
    setModalBodyMapping({ shirtWidthInches: 20, shirtHeightInches: 29, widthInches: 13, heightInches: 14.5, topOffsetInches: 3 });
    setErrorMsg('');
  };

  // Replace image for selected garment
  const handleReplaceImage = async (file) => {
    if (!file || !selectedGarment) return;
    if (!file.type.includes('png')) { setErrorMsg('Only PNG files accepted.'); return; }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      const trimmed = await trimTransparentPixels(dataUrl);
      const updatedGarment = { ...selectedGarment, dataUrl: trimmed.dataUrl, width: trimmed.width, height: trimmed.height };
      const newLibrary = library.map(g => g.id === selectedGarment.id ? updatedGarment : g);
      saveLibrary(newLibrary);
      setSelectedGarment(updatedGarment);
      // Also update on server
      fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedGarment),
      }).catch(() => {});
    };
    reader.readAsDataURL(file);
  };

  // Pagination helpers
  const getPageNumbers = () => {
    const pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  const getTypeBadgeClass = (type) => (type || '').toLowerCase().replace(/\s+/g, '-');

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch { return 'N/A'; }
  };

  return (
    <div className="garment-manager">
      {/* Header */}
      <div className="gm-header">
        <div className="gm-header-left">
          <h1>Garment Manager</h1>
          <p>Upload and manage blank garments</p>
        </div>
        <div className="gm-header-actions">
          <div className="gm-view-toggle">
            <button className={`gm-view-btn ${viewMode === 'card' ? 'active' : ''}`} onClick={() => setViewMode('card')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              Card View
            </button>
            <button className={`gm-view-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              List View
            </button>
          </div>
          <button className="gm-btn-primary" onClick={() => setShowAddModal(true)}>+ Add Garment</button>
          <button className="gm-btn-secondary">Bulk Upload</button>
          <button className="gm-btn-secondary">Export</button>
          <div className="gm-total-count">Total Items: <strong>{library.length}</strong></div>
        </div>
      </div>

      {/* Success/Error messages */}
      {successMsg && <div className="gm-toast gm-toast-success">{successMsg}</div>}
      {errorMsg && !showAddModal && <div className="gm-toast gm-toast-error">{errorMsg}</div>}

      {/* Filters Row */}
      <div className="gm-filters-row">
        <div className="gm-search-box">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="text"
            placeholder="Search by style no, item, brand..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <select value={filterBrand} onChange={(e) => setFilterBrand(e.target.value)}>
          <option value="">All Brands</option>
          {uniqueBrands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          {GARMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterGender} onChange={(e) => setFilterGender(e.target.value)}>
          <option value="">All Genders</option>
          {GENDER_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={filterSize} onChange={(e) => setFilterSize(e.target.value)}>
          <option value="">All Sizes</option>
          {SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterColor} onChange={(e) => setFilterColor(e.target.value)}>
          <option value="">All Colors</option>
          {uniqueColors.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="gm-btn-reset" onClick={resetFilters}>Reset</button>
      </div>

      {/* Main Content Area */}
      <div className="gm-content-area">
        <div className={`gm-main-content ${showPreviewPanel ? 'with-panel' : ''}`}>
          {viewMode === 'list' ? (
            /* List View Table */
            <div className="gm-table-wrapper">
              <table className="gm-table">
                <thead>
                  <tr>
                    <th>S.No</th>
                    <th>Thumbnail</th>
                    <th>View</th>
                    <th>Item Description</th>
                    <th>Gender</th>
                    <th>Brand</th>
                    <th>Style No</th>
                    <th>Size</th>
                    <th>Color</th>
                    <th colSpan="2">Size Specs</th>
                    <th>Actions</th>
                  </tr>
                  <tr className="gm-table-subhead">
                    <th></th><th></th><th></th><th></th><th></th><th></th><th></th><th></th><th></th>
                    <th>Length</th>
                    <th>Width</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLibrary.length === 0 ? (
                    <tr><td colSpan="12" className="gm-table-empty">No garments found. Click "+ Add Garment" to get started.</td></tr>
                  ) : (
                    paginatedLibrary.map((g, idx) => (
                      <tr
                        key={g.id}
                        className={`gm-table-row ${selectedGarment?.id === g.id ? 'selected' : ''}`}
                        onClick={() => selectGarment(g)}
                      >
                        <td>{(currentPage - 1) * pageSize + idx + 1}</td>
                        <td><img className="gm-table-thumb" src={g.dataUrl} alt={g.name} /></td>
                        <td><span className={`gm-side-badge ${g.side || 'front'}`}>{(g.side || 'front').charAt(0).toUpperCase() + (g.side || 'front').slice(1)}</span></td>
                        <td className="gm-td-desc">{g.description || g.name}</td>
                        <td>{g.gender || '—'}</td>
                        <td>{g.brand || '—'}</td>
                        <td>{g.styleNo || '—'}</td>
                        <td><span className="gm-size-pill">{g.size || '—'}</span></td>
                        <td>
                          <span className="gm-color-cell">
                            <span className="gm-color-dot" style={{ background: g.colorHex || '#333' }}></span>
                            {g.color || '—'}
                          </span>
                        </td>
                        <td>{g.bodyMapping?.shirtHeightInches || '—'}"</td>
                        <td>{g.bodyMapping?.shirtWidthInches || '—'}"</td>
                        <td className="gm-td-actions" onClick={(e) => e.stopPropagation()}>
                          <button className="gm-action-btn" title="Use as Mockup" onClick={() => handleUseAsMockup(g)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          </button>
                          <button className="gm-action-btn" title="Edit" onClick={() => selectGarment(g)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          <button className="gm-action-btn gm-action-delete" title="Delete" onClick={() => deleteFromLibrary(g.id)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

          ) : (
            /* Card View */
            <div className="gm-card-grid">
              {paginatedLibrary.length === 0 ? (
                <div className="gm-card-empty">No garments found. Click "+ Add Garment" to get started.</div>
              ) : (
                paginatedLibrary.map((g) => (
                  <div
                    key={g.id}
                    className={`gm-card ${selectedGarment?.id === g.id ? 'selected' : ''}`}
                    onClick={() => selectGarment(g)}
                  >
                    <div className="gm-card-image">
                      <img src={g.dataUrl} alt={g.name} />
                      <span className={`gm-side-badge ${g.side || 'front'}`}>{(g.side || 'front').charAt(0).toUpperCase() + (g.side || 'front').slice(1)}</span>
                    </div>
                    <div className="gm-card-body">
                      <div className="gm-card-title">{g.description || g.name}</div>
                      <div className="gm-card-meta">
                        <span className={`gm-type-badge ${getTypeBadgeClass(g.type)}`}>{g.type}</span>
                        {g.size && <span className="gm-size-pill">{g.size}</span>}
                      </div>
                      <div className="gm-card-details">
                        {g.brand && <span>{g.brand}</span>}
                        {g.styleNo && <span>#{g.styleNo}</span>}
                        {g.color && (
                          <span className="gm-color-cell">
                            <span className="gm-color-dot" style={{ background: g.colorHex || '#333' }}></span>
                            {g.color}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="gm-card-actions">
                      <button className="gm-action-btn" title="Use as Mockup" onClick={(e) => { e.stopPropagation(); handleUseAsMockup(g); }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      </button>
                      <button className="gm-action-btn gm-action-delete" title="Delete" onClick={(e) => { e.stopPropagation(); deleteFromLibrary(g.id); }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Pagination */}
          <div className="gm-pagination">
            <div className="gm-pagination-info">
              Showing {filteredLibrary.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredLibrary.length)} of {filteredLibrary.length}
            </div>
            <div className="gm-pagination-controls">
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>&lt;</button>
              {getPageNumbers().map((p, i) =>
                p === '...' ? <span key={`dot-${i}`} className="gm-page-dots">...</span> :
                <button key={p} className={currentPage === p ? 'active' : ''} onClick={() => setCurrentPage(p)}>{p}</button>
              )}
              <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>&gt;</button>
            </div>
            <div className="gm-page-size">
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                {PAGE_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s} / page</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Right Preview Panel */}
        {showPreviewPanel && selectedGarment && (
          <div className="gm-preview-panel">
            <div className="gm-preview-panel-header">
              <h3>Garment Preview</h3>
              <button className="gm-preview-close" onClick={() => { setShowPreviewPanel(false); setSelectedGarment(null); }}>×</button>
            </div>
            <div className="gm-preview-image">
              <img src={selectedGarment.dataUrl} alt={selectedGarment.name} />
            </div>
            <div className="gm-preview-details">
              <div className="gm-detail-row"><span className="gm-detail-label">Item Description</span><span className="gm-detail-value">{selectedGarment.description || selectedGarment.name}</span></div>
              <div className="gm-detail-row"><span className="gm-detail-label">Gender</span><span className="gm-detail-value">{selectedGarment.gender || '—'}</span></div>
              <div className="gm-detail-row"><span className="gm-detail-label">Brand</span><span className="gm-detail-value">{selectedGarment.brand || '—'}</span></div>
              <div className="gm-detail-row"><span className="gm-detail-label">Style No</span><span className="gm-detail-value">{selectedGarment.styleNo || '—'}</span></div>
              <div className="gm-detail-row"><span className="gm-detail-label">Size</span><span className="gm-detail-value">{selectedGarment.size || '—'}</span></div>
              <div className="gm-detail-row">
                <span className="gm-detail-label">Color</span>
                <span className="gm-detail-value gm-color-cell">
                  <span className="gm-color-dot" style={{ background: selectedGarment.colorHex || '#333' }}></span>
                  {selectedGarment.color || '—'}
                </span>
              </div>
              <div className="gm-detail-row"><span className="gm-detail-label">Garment Type</span><span className="gm-detail-value">{selectedGarment.type}</span></div>
              <div className="gm-detail-row"><span className="gm-detail-label">Size Specs</span><span className="gm-detail-value">{selectedGarment.bodyMapping?.shirtHeightInches || '—'}" × {selectedGarment.bodyMapping?.shirtWidthInches || '—'}"</span></div>
              <div className="gm-detail-row"><span className="gm-detail-label">File Name</span><span className="gm-detail-value">{selectedGarment.fileName || selectedGarment.name}</span></div>
              <div className="gm-detail-row"><span className="gm-detail-label">Image Dimensions</span><span className="gm-detail-value">{selectedGarment.width} × {selectedGarment.height} px</span></div>
              <div className="gm-detail-row"><span className="gm-detail-label">Uploaded On</span><span className="gm-detail-value">{formatDate(selectedGarment.createdAt)}</span></div>
              <div className="gm-detail-row"><span className="gm-detail-label">Uploaded By</span><span className="gm-detail-value">Admin</span></div>
            </div>
            <div className="gm-preview-actions">
              <button className="gm-btn-secondary" onClick={() => replaceFileInputRef.current?.click()}>Replace Image</button>
              <button className="gm-btn-danger" onClick={() => deleteFromLibrary(selectedGarment.id)}>Delete Garment</button>
              <input ref={replaceFileInputRef} type="file" accept=".png,image/png" style={{ display: 'none' }} onChange={(e) => handleReplaceImage(e.target.files[0])} />
            </div>
          </div>
        )}
      </div>

      {/* Add Garment Modal */}
      {showAddModal && (
        <div className="gm-modal-overlay" onClick={closeModal}>
          <div className="gm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gm-modal-header">
              <h2>Add New Garment</h2>
              <button className="gm-modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="gm-modal-body">
              <div className="gm-modal-left">
                {/* Upload area */}
                <div
                  className={`gm-modal-upload ${modalDragOver ? 'drag-over' : ''} ${modalImage ? 'has-image' : ''}`}
                  onClick={() => modalFileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setModalDragOver(true); }}
                  onDragLeave={() => setModalDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setModalDragOver(false); handleModalFile(e.dataTransfer.files[0]); }}
                >
                  {modalImage ? (
                    <img src={modalImage.dataUrl} alt="Preview" className="gm-modal-preview-img" />
                  ) : (
                    <>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      <p>Drag & drop PNG here</p>
                      <p className="gm-upload-hint">or click to browse</p>
                    </>
                  )}
                </div>
                <input ref={modalFileInputRef} type="file" accept=".png,image/png" style={{ display: 'none' }} onChange={(e) => handleModalFile(e.target.files[0])} />
                {modalImage && (
                  <div className="gm-modal-img-info">
                    {modalImage.fileName} — {modalImage.width}×{modalImage.height}px
                  </div>
                )}
              </div>

              <div className="gm-modal-right">
                <div className="gm-modal-form">
                  <div className="gm-form-row">
                    <label>Item Description</label>
                    <input type="text" value={modalFields.description} onChange={(e) => setModalFields({ ...modalFields, description: e.target.value })} placeholder="e.g. Heavy Cotton T-Shirt" />
                  </div>
                  <div className="gm-form-row-2col">
                    <div className="gm-form-row">
                      <label>Gender</label>
                      <select value={modalFields.gender} onChange={(e) => setModalFields({ ...modalFields, gender: e.target.value })}>
                        {GENDER_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                    <div className="gm-form-row">
                      <label>Brand</label>
                      <input type="text" value={modalFields.brand} onChange={(e) => setModalFields({ ...modalFields, brand: e.target.value })} placeholder="e.g. Gildan" />
                    </div>
                  </div>
                  <div className="gm-form-row-2col">
                    <div className="gm-form-row">
                      <label>Style No</label>
                      <input type="text" value={modalFields.styleNo} onChange={(e) => setModalFields({ ...modalFields, styleNo: e.target.value })} placeholder="e.g. 5000" />
                    </div>
                    <div className="gm-form-row">
                      <label>Garment Type</label>
                      <select value={modalFields.type} onChange={(e) => setModalFields({ ...modalFields, type: e.target.value })}>
                        {GARMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="gm-form-row-2col">
                    <div className="gm-form-row">
                      <label>Size</label>
                      <select value={modalFields.size} onChange={(e) => setModalFields({ ...modalFields, size: e.target.value })}>
                        {SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="gm-form-row">
                      <label>Side</label>
                      <div className="gm-modal-side-toggle">
                        <button className={modalFields.side === 'front' ? 'active' : ''} onClick={() => setModalFields({ ...modalFields, side: 'front' })}>Front</button>
                        <button className={modalFields.side === 'back' ? 'active' : ''} onClick={() => setModalFields({ ...modalFields, side: 'back' })}>Back</button>
                      </div>
                    </div>
                  </div>
                  <div className="gm-form-row">
                    <label>Color</label>
                    <div className="gm-color-input-row">
                      <input type="text" value={modalFields.color} onChange={(e) => setModalFields({ ...modalFields, color: e.target.value })} placeholder="e.g. Black" />
                      <input type="color" value={modalFields.colorHex} onChange={(e) => setModalFields({ ...modalFields, colorHex: e.target.value })} className="gm-color-picker" />
                    </div>
                  </div>

                  <div className="gm-form-section-title">Shirt Dimensions (from image at 300 DPI)</div>
                  <div className="gm-form-row-2col">
                    <div className="gm-form-row">
                      <label>Width (in)</label>
                      <input type="number" min="1" max="50" step="0.5" value={modalBodyMapping.shirtWidthInches} onChange={(e) => setModalBodyMapping({ ...modalBodyMapping, shirtWidthInches: parseFloat(e.target.value) || 20 })} />
                    </div>
                    <div className="gm-form-row">
                      <label>Height (in)</label>
                      <input type="number" min="1" max="50" step="0.5" value={modalBodyMapping.shirtHeightInches} onChange={(e) => setModalBodyMapping({ ...modalBodyMapping, shirtHeightInches: parseFloat(e.target.value) || 29 })} />
                    </div>
                  </div>
                  <div className="gm-form-section-title">Print Area</div>
                  <div className="gm-form-row-3col">
                    <div className="gm-form-row">
                      <label>Width (in)</label>
                      <input type="number" min="1" max="30" step="0.5" value={modalBodyMapping.widthInches} onChange={(e) => setModalBodyMapping({ ...modalBodyMapping, widthInches: Number(e.target.value) || 13 })} />
                    </div>
                    <div className="gm-form-row">
                      <label>Height (in)</label>
                      <input type="number" min="1" max="30" step="0.5" value={modalBodyMapping.heightInches} onChange={(e) => setModalBodyMapping({ ...modalBodyMapping, heightInches: Number(e.target.value) || 14.5 })} />
                    </div>
                    <div className="gm-form-row">
                      <label>Top Offset (in)</label>
                      <input type="number" min="0" max="15" step="0.5" value={modalBodyMapping.topOffsetInches} onChange={(e) => setModalBodyMapping({ ...modalBodyMapping, topOffsetInches: Number(e.target.value) || 0 })} />
                    </div>
                  </div>
                  <div className="gm-form-row gm-toggle-row">
                    <span>Auto Trim</span>
                    <div className={`gm-toggle ${modalFields.autoTrim ? 'active' : ''}`} onClick={() => setModalFields({ ...modalFields, autoTrim: !modalFields.autoTrim })} />
                  </div>
                </div>
                {errorMsg && showAddModal && <div className="gm-modal-error">{errorMsg}</div>}
              </div>
            </div>
            <div className="gm-modal-footer">
              <button className="gm-btn-secondary" onClick={closeModal}>Cancel</button>
              <button className="gm-btn-primary" onClick={saveGarment} disabled={modalSaving}>
                {modalSaving ? 'Saving...' : 'Save Garment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GarmentManager;
