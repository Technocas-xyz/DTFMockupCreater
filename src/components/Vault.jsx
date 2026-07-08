import React, { useState, useCallback } from 'react';
import './Vault.css';

function Vault({ onSendToEditor, onSendToMockup }) {
  const [sharedLink, setSharedLink] = useState('');
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedImages, setSelectedImages] = useState(new Set());

  const fetchFromLink = async () => {
    if (!sharedLink.trim()) { setError('Please enter a shared link'); return; }
    setLoading(true);
    setError('');
    setImages([]);

    try {
      // Try to fetch the link and parse images from it
      const res = await fetch(sharedLink, { mode: 'cors' });
      if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
      const contentType = res.headers.get('content-type') || '';

      if (contentType.startsWith('image/')) {
        // Direct image link
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setImages([{ id: 1, url, name: sharedLink.split('/').pop() || 'image.png', blob }]);
      } else {
        // HTML page — try to extract image URLs
        const html = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const imgElements = doc.querySelectorAll('img[src]');
        const found = [];
        let id = 1;
        imgElements.forEach(img => {
          let src = img.getAttribute('src');
          if (!src) return;
          // Make absolute URL
          if (src.startsWith('//')) src = 'https:' + src;
          else if (src.startsWith('/')) {
            try { const u = new URL(sharedLink); src = u.origin + src; } catch(e) {}
          } else if (!src.startsWith('http')) {
            try { src = new URL(src, sharedLink).href; } catch(e) {}
          }
          // Filter: only real images (not tiny icons)
          const width = parseInt(img.getAttribute('width') || '0');
          const height = parseInt(img.getAttribute('height') || '0');
          if (width > 0 && width < 50 && height > 0 && height < 50) return;
          if (src.includes('favicon') || src.includes('logo') || src.includes('icon')) return;
          found.push({ id: id++, url: src, name: src.split('/').pop().split('?')[0] || `image-${id}.png` });
        });

        // Also look for links to image files
        const links = doc.querySelectorAll('a[href]');
        links.forEach(a => {
          const href = a.getAttribute('href');
          if (!href) return;
          if (/\.(png|jpg|jpeg|webp|tiff|bmp|gif)(\?|$)/i.test(href)) {
            let src = href;
            if (src.startsWith('//')) src = 'https:' + src;
            else if (src.startsWith('/')) { try { src = new URL(sharedLink).origin + src; } catch(e) {} }
            else if (!src.startsWith('http')) { try { src = new URL(src, sharedLink).href; } catch(e) {} }
            found.push({ id: id++, url: src, name: src.split('/').pop().split('?')[0] || `image-${id}.png` });
          }
        });

        if (found.length === 0) throw new Error('No images found at this link');
        setImages(found);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch images. The link may not support CORS.');
    }
    setLoading(false);
  };

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
    // Send the first selected image as data URL
    const img = selected[0];
    try {
      let dataUrl;
      if (img.blob) {
        dataUrl = await blobToDataUrl(img.blob);
      } else {
        const res = await fetch(img.url);
        const blob = await res.blob();
        dataUrl = await blobToDataUrl(blob);
      }
      if (target === 'editor' && onSendToEditor) onSendToEditor(dataUrl);
      if (target === 'mockup' && onSendToMockup) onSendToMockup(dataUrl);
    } catch (err) {
      setError('Failed to load image. Try downloading it manually.');
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
            <div className="vault-toolbar">
              <span className="vault-count">{images.length} image{images.length !== 1 ? 's' : ''} found · {selectedImages.size} selected</span>
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
              {images.map(img => (
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
