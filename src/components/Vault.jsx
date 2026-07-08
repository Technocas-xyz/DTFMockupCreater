import React, { useState, useCallback } from 'react';
import { detectApiBase } from '../utils/apiConfig';
import './Vault.css';

function Vault({ onSendToEditor, onSendToMockup }) {
  const [sharedLink, setSharedLink] = useState('');
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedImages, setSelectedImages] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [serviceInfo, setServiceInfo] = useState(null);

  const fetchFromLink = async () => {
    if (!sharedLink.trim()) { setError('Please enter a shared link'); return; }
    setLoading(true);
    setError('');
    setImages([]);
    setServiceInfo(null);

    try {
      // Use PHP proxy to bypass CORS and parse cloud service links
      const apiBase = await detectApiBase();
      const res = await fetch(`${apiBase}/vault-proxy.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sharedLink.trim() }),
      });
      const data = await res.json();

      if (data.error) { setError(data.error); setLoading(false); return; }

      setServiceInfo({ service: data.service, type: data.type });
      const imgList = (data.images || []).map((img, idx) => ({
        id: idx + 1,
        name: img.name || `image-${idx+1}.png`,
        url: img.url,
        thumbnail: img.thumbnail || img.url,
      }));
      setImages(imgList);
      if (imgList.length === 0) setError('No images found at this link');
    } catch (err) {
      setError('Failed to fetch. Check the link and try again.');
    }
    setLoading(false);
  };

  // Filtered images by search
  const filteredImages = searchQuery.trim()
    ? images.filter(img => img.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : images;

  const toggleSelect = (id) => {
    setSelectedImages(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedImages(new Set(images.map(i => i.id)));
  const deselectAll = () => setSelectedImages(new Set());

  const sendSelected = async (target) => {
    const selected = images.filter(i => selectedImages.has(i.id));
    if (selected.length === 0) { setError('Select at least one image'); return; }
    const img = selected[0];
    try {
      let dataUrl;
      if (img.blob) {
        dataUrl = await blobToDataUrl(img.blob);
      } else {
        // Use proxy to fetch (bypass CORS)
        const apiBase = await detectApiBase();
        const res = await fetch(`${apiBase}/vault-proxy.php?url=${encodeURIComponent(img.url)}`);
        const data = await res.json();
        if (data.images && data.images[0]) {
          // It's a redirect/meta — try direct fetch
          const imgRes = await fetch(img.url);
          const blob = await imgRes.blob();
          dataUrl = await blobToDataUrl(blob);
        } else {
          const imgRes = await fetch(img.url);
          const blob = await imgRes.blob();
          dataUrl = await blobToDataUrl(blob);
        }
      }
      if (target === 'editor' && onSendToEditor) onSendToEditor(dataUrl);
      if (target === 'mockup' && onSendToMockup) onSendToMockup(dataUrl);
    } catch (err) {
      setError('Failed to load image. Try downloading it first.');
    }
  };

  const downloadImage = async (img) => {
    try {
      let blob;
      if (img.blob) { blob = img.blob; }
      else { const res = await fetch(img.url); blob = await res.blob(); }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = img.name;
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      // Fallback: open in new tab
      window.open(img.url, '_blank');
    }
  };

  return (
    <div className="vault-page">
      <header className="vault-header">
        <h1 className="vault-title">Vault</h1>
        <p className="vault-subtitle">Fetch artwork from shared links</p>
      </header>

      <div className="vault-content">
        {/* Fetch Section */}
        <div className="vault-fetch-section">
          <div className="vault-input-row">
            <input type="text" className="vault-link-input" placeholder="Paste shared link (Google Drive, Dropbox, URL...)"
              value={sharedLink} onChange={(e) => setSharedLink(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') fetchFromLink(); }} />
            <button className="vault-btn vault-btn-primary" onClick={fetchFromLink} disabled={loading}>
              {loading ? 'Fetching...' : 'Fetch Images'}
            </button>
          </div>
          {error && <div className="vault-error">{error}</div>}
        </div>

        {/* Results */}
        {images.length > 0 && (
          <>
            {serviceInfo && (
              <div className="vault-service-badge">
                {serviceInfo.service === 'google-drive' && '📁 Google Drive'}
                {serviceInfo.service === 'dropbox' && '📦 Dropbox'}
                {serviceInfo.service === 'onedrive' && '☁️ OneDrive'}
                {serviceInfo.service === 'nextcloud' && '🌐 Nextcloud'}
                {serviceInfo.service === 'generic' && '🔗 Web URL'}
                {serviceInfo.service === 'direct' && '🖼️ Direct Image'}
                {serviceInfo.type === 'folder' && ' (Folder)'}
              </div>
            )}

            <div className="vault-toolbar">
              <div className="vault-search-row">
                <input type="text" className="vault-search-input" placeholder="Search by filename..."
                  value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                <span className="vault-count">{filteredImages.length} of {images.length} · {selectedImages.size} selected</span>
              </div>
              <div className="vault-toolbar-actions">
                <button className="vault-btn vault-btn-sm" onClick={selectAll}>Select All</button>
                <button className="vault-btn vault-btn-sm" onClick={deselectAll}>Deselect</button>
                <button className="vault-btn vault-btn-primary vault-btn-sm" onClick={() => sendSelected('editor')} disabled={selectedImages.size === 0}>
                  → Artwork Editor
                </button>
                <button className="vault-btn vault-btn-sm" onClick={() => sendSelected('mockup')} disabled={selectedImages.size === 0}>
                  → Mockup
                </button>
              </div>
            </div>

            <div className="vault-grid">
              {filteredImages.map(img => (
                <div key={img.id} className={`vault-card ${selectedImages.has(img.id) ? 'selected' : ''}`} onClick={() => toggleSelect(img.id)}>
                  <div className="vault-card-img">
                    <img src={img.url} alt={img.name} crossOrigin="anonymous" onError={(e) => { e.target.style.display='none'; }} />
                    {selectedImages.has(img.id) && <div className="vault-check">✓</div>}
                  </div>
                  <div className="vault-card-footer">
                    <span className="vault-card-name" title={img.name}>{img.name}</span>
                    <button className="vault-btn vault-btn-xs" onClick={(e) => { e.stopPropagation(); downloadImage(img); }}>⬇</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {!loading && images.length === 0 && (
          <div className="vault-empty">
            <p>Paste a shared link above to fetch images</p>
            <span>Supports: Direct image URLs, web pages with images, file hosting links</span>
          </div>
        )}
      </div>
    </div>
  );
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

export default Vault;
