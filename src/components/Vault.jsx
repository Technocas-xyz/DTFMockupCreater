import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { detectApiBase } from '../utils/apiConfig';
import './Vault.css';

// ── Artwork Vault ────────────────────────────────────────────────────────────
// The same central vault PrintShop shows, read straight from Nextcloud's index
// so a designer never has to move a file between the two apps. Pick a customer,
// pick a folder, open the file in whichever studio tool the job needs; saving
// writes a WRK file back into that customer's Artworks folder in Nextcloud.
//
// Freshness comes from a change cursor, not from refetching the list: the vault
// holds ~5 800 files, so the grid asks "has anything changed?" (a ~120 byte
// answer) every few seconds and only reloads a page when the answer moves.

const REVISION_POLL_MS = 3000;
const PAGE_SIZE = 60;

// Where a selected file can be sent. These mirror the studio's own pages.
const TARGETS = [
  { page: 'bgremover', label: 'Artwork Editor', primary: true },
  { page: 'mockupv2', label: 'Mockup' },
  { page: 'gangsheet', label: 'Gang Sheet' },
  { page: 'qa', label: 'QA Analysis' },
  { page: 'contrast', label: 'Contrast' },
];

const UPLOAD_LIFECYCLES = [
  { code: 'SRC', label: 'Source (Original)' },
  { code: 'WRK', label: 'Working File' },
  { code: 'FNL', label: 'Final' },
  { code: 'FNLA', label: 'Approved (Final)' },
];

// The shop's published file naming standard — AW-<CLIENT>-<NNNN>-<TYPE>.<ext>.
const LIFECYCLE = {
  SRC: { label: 'Source', tone: 'src' },
  REF: { label: 'Reference', tone: 'src' },
  WRK: { label: 'Working', tone: 'wrk' },
  FNL: { label: 'Final', tone: 'fnl' },
  FNLA: { label: 'Approved', tone: 'fnla' },
  GS: { label: 'Gang Sheet', tone: 'gs' },
  MU: { label: 'Mockup', tone: 'mu' },
  MOCK: { label: 'Mockup', tone: 'mu' },
  OUT: { label: 'Sent', tone: 'out' },
};

const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp|tiff?|svg|avif)$/i;

function isPreviewable(asset) {
  return /^image\//i.test(asset.mime_type || '') || IMAGE_RE.test(asset.file_name || '');
}

function fileSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('File could not be read'));
    reader.readAsDataURL(blob);
  });
}

// A searchable picker — 400+ customers is far too many for a row of tabs.
function CustomerPicker({ customers, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const selected = customers.find(c => c.key === value);
  // The list is already scoped to the selected source by the server, so every
  // entry here is reachable — it is never truncated.
  const matches = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter(c => (c.name || '').toLowerCase().includes(needle) || (c.reference || '').toLowerCase().includes(needle));
  }, [customers, term]);

  return (
    <div className="vault-picker" ref={boxRef}>
      <button type="button" className={`vault-picker-btn ${value ? 'is-set' : ''}`} onClick={() => { setOpen(o => !o); setTerm(''); }}>
        <span className="vault-picker-label">Customer</span>
        <span className="vault-picker-value">{selected ? selected.name : 'All customers'}</span>
        <span className="vault-picker-caret">▾</span>
      </button>
      {open && (
        <div className="vault-picker-panel">
          <input
            className="vault-picker-search"
            autoFocus
            placeholder={`Search ${customers.length} customers…`}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          <ul className="vault-picker-list">
            <li>
              <button type="button" className={!value ? 'active' : ''} onClick={() => { onChange(''); setOpen(false); }}>
                All customers
              </button>
            </li>
            {matches.map(customer => (
              <li key={customer.key}>
                <button type="button" className={value === customer.key ? 'active' : ''} onClick={() => { onChange(customer.key); setOpen(false); }}>
                  <span className="vault-picker-name">{customer.name}</span>
                  {customer.reference && <span className="vault-picker-ref">{customer.reference}</span>}
                  <span className="vault-picker-count">{customer.files}</span>
                </button>
              </li>
            ))}
            {!matches.length && <li className="vault-picker-none">No customer matches “{term}”</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

function VaultCard({ asset, apiBase, selected, onSelect }) {
  const [failed, setFailed] = useState(false);
  const life = LIFECYCLE[asset.lifecycle_code] || null;
  const previewable = isPreviewable(asset) && !failed;
  const src = `${apiBase}/central-artwork.php?action=thumb&id=${encodeURIComponent(asset.id)}&w=320&h=240&v=${encodeURIComponent(asset.preview_key || '')}`;

  return (
    <button type="button" className={`vault-card ${selected ? 'selected' : ''}`} onClick={() => onSelect(asset)}>
      <span className="vault-card-img">
        {previewable
          ? <img src={src} alt={asset.file_name} loading="lazy" decoding="async" onError={() => setFailed(true)} />
          : <span className="vault-card-ext">{(asset.file_name.split('.').pop() || 'FILE').toUpperCase()}</span>}
        {life && <span className={`vault-life vault-life-${life.tone}`}>{asset.lifecycle_code}</span>}
        {selected && <span className="vault-check">✓</span>}
      </span>
      <span className="vault-card-body">
        <span className="vault-card-name" title={asset.file_name}>{asset.file_name}</span>
        <span className="vault-card-meta">
          <span>{asset.folder}</span>
          <span>{fileSize(asset.file_size_bytes)}</span>
        </span>
      </span>
    </button>
  );
}

function Vault({ onOpenAsset }) {
  const [apiBase, setApiBase] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState({ roots: [], customers: [], folders: [], lifecycles: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [live, setLive] = useState(false);
  const [opening, setOpening] = useState('');

  const [root, setRoot] = useState('');
  const [customer, setCustomer] = useState('');
  const [folder, setFolder] = useState('');
  const [lifecycle, setLifecycle] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  // Upload state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [uploadLifecycle, setUploadLifecycle] = useState('WRK');
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const uploadInputRef = useRef(null);

  const revisionRef = useRef('');
  const inFlight = useRef(false);
  const pending = useRef(false);

  useEffect(() => { detectApiBase().then(setApiBase).catch(() => setApiBase('/api')); }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (root) params.set('root', root);
    if (customer) params.set('entity_key', customer);
    if (folder) params.set('folder', folder);
    if (lifecycle) params.set('lifecycle', lifecycle);
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
    return params;
  }, [root, customer, folder, lifecycle, debouncedSearch]);

  // Two things ask for a reload: a filter change and the live cursor. If one
  // arrives while the other is still fetching, remember it and run once more on
  // the way out — dropping it would leave the grid showing the wrong filter.
  const load = useCallback(async (showSpinner = false) => {
    if (!apiBase) return;
    if (inFlight.current) { pending.current = true; return; }
    inFlight.current = true;
    if (showSpinner) setLoading(true);
    try {
      const listParams = new URLSearchParams(query);
      listParams.set('page', String(page));
      listParams.set('limit', String(PAGE_SIZE));
      const [listRes, facetRes] = await Promise.all([
        fetch(`${apiBase}/central-artwork.php?action=vault&${listParams}`, { cache: 'no-store' }),
        fetch(`${apiBase}/central-artwork.php?action=facets&${query}`, { cache: 'no-store' }),
      ]);
      if (!listRes.ok) throw new Error(`Vault unavailable (${listRes.status})`);
      const listPayload = await listRes.json();
      const data = listPayload.data || {};
      // Hide "OUT" (Sent) files from the grid — these are finished files already
      // sent to production and just clutter the pre-order vault view.
      const allRows = data.rows || [];
      const visibleRows = allRows.filter(r => (r.lifecycle_code || '').toUpperCase() !== 'OUT');
      setRows(visibleRows);
      setTotal(data.total || 0);
      if (facetRes.ok) {
        const facetPayload = await facetRes.json();
        const next = facetPayload.data;
        if (next) setFacets({ roots: next.roots || [], customers: next.customers || [], folders: next.folders || [], lifecycles: next.lifecycles || [] });
      }
      setError('');
    } catch (err) {
      setError(err.message || 'The Artwork Vault could not be loaded.');
    } finally {
      inFlight.current = false;
      setLoading(false);
      if (pending.current) { pending.current = false; load(false); }
    }
  }, [apiBase, query, page]);

  useEffect(() => { load(true); }, [load]);

  // Change cursor. Deliberately unfiltered: a file that lands for another
  // customer still changes the folder counts on screen, so the whole view is
  // refreshed whenever anything in the vault moves.
  useEffect(() => {
    if (!apiBase) return undefined;
    let active = true;
    const tick = async () => {
      try {
        const res = await fetch(`${apiBase}/central-artwork.php?action=revision`, { cache: 'no-store' });
        if (!res.ok) throw new Error('offline');
        const payload = await res.json();
        const data = payload.data || {};
        if (!active) return;
        setLive(Boolean(data.watching));
        const stamp = `${data.revision}/${data.total}`;
        if (revisionRef.current && revisionRef.current !== stamp) load(false);
        revisionRef.current = stamp;
      } catch {
        if (active) setLive(false);
      }
    };
    tick();
    const timer = window.setInterval(tick, REVISION_POLL_MS);
    return () => { active = false; window.clearInterval(timer); };
  }, [apiBase, load]);

  // Fetch the selected file's bytes under a token scoped to that one asset, then
  // hand it to the requested studio tool. The token travels with it so the tool
  // can save the result straight back to Nextcloud.
  const openIn = async (target) => {
    if (!selected || !apiBase) return;
    setOpening(target.page);
    setStatus(`Opening ${selected.file_name} in ${target.label}…`);
    try {
      const handoffRes = await fetch(`${apiBase}/central-artwork.php?action=handoff&id=${encodeURIComponent(selected.id)}`);
      const handoff = await handoffRes.json();
      if (!handoffRes.ok || !handoff.data?.token) throw new Error(handoff.message || 'Could not check out this artwork');
      const contentRes = await fetch(`${apiBase}/central-artwork.php?action=content&token=${encodeURIComponent(handoff.data.token)}`);
      if (!contentRes.ok) throw new Error('Artwork content could not be downloaded');
      const dataUrl = await blobToDataUrl(await contentRes.blob());
      onOpenAsset(target.page, dataUrl, {
        ...selected,
        studio_token: handoff.data.token,
        file_name: handoff.data.file_name || selected.file_name,
      });
    } catch (err) {
      setError(err.message || 'This artwork could not be opened');
      setStatus('');
    } finally {
      setOpening('');
    }
  };

  const download = async (asset) => {
    if (!apiBase) return;
    try {
      const res = await fetch(`${apiBase}/central-artwork.php?action=content&id=${encodeURIComponent(asset.id)}`);
      if (!res.ok) throw new Error('Download failed');
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = asset.file_name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (err) {
      setError(err.message || 'Download failed');
    }
  };

  const selectRoot = (next) => {
    setRoot(next); setCustomer(''); setFolder(''); setSelected(null); setPage(1);
  };

  const resetFilters = () => {
    setRoot(''); setCustomer(''); setFolder(''); setLifecycle(''); setSearch(''); setDebouncedSearch(''); setPage(1);
  };

  // Upload handlers
  const handleUploadFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setUploadPreview(ev.target.result);
      reader.readAsDataURL(file);
    } else {
      setUploadPreview(null);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !apiBase) return;
    if (!customer) { setUploadMessage('Please select a customer first'); return; }
    setUploading(true);
    setUploadMessage('');
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('entity_key', customer);
      if (folder) formData.append('folder', folder);
      formData.append('lifecycle_code', uploadLifecycle);

      const res = await fetch(`${apiBase}/central-artwork.php?action=upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`,
        },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Upload failed');
      setUploadMessage('File uploaded successfully!');
      setUploadFile(null);
      setUploadPreview(null);
      // Refresh the vault
      setTimeout(() => { load(false); setShowUpload(false); setUploadMessage(''); }, 1500);
    } catch (err) {
      setUploadMessage(err.message || 'Upload failed');
    }
    setUploading(false);
  };

  const closeUploadModal = () => {
    setShowUpload(false);
    setUploadFile(null);
    setUploadPreview(null);
    setUploadMessage('');
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeFilters = Boolean(root || customer || folder || lifecycle || debouncedSearch.trim());
  const rootTotal = facets.roots.reduce((sum, item) => sum + item.files, 0);

  return (
    <div className="vault-page">
      <header className="vault-header">
        <div>
          <h1 className="vault-title">Artwork Vault</h1>
          <p className="vault-subtitle">
            Every customer file from Nextcloud, live — open one here, save it back as a WRK file.
          </p>
        </div>
        <div className="vault-header-actions">
          <button type="button" className="vault-btn vault-btn-primary" onClick={() => setShowUpload(true)}>
            ↑ Upload Artwork
          </button>
          <span className={`vault-live ${live ? 'is-live' : ''}`}>
            <i /> {live ? 'Live' : 'Reconnecting…'}
          </span>
        </div>
      </header>

      {/* Leads and purchase orders are separate worlds with their own folder
          conventions, so they are picked first and never shown mixed. */}
      <div className="vault-sources">
        {/* Switching source clears the customer too: the picker is scoped to the
            source, so a customer carried over from the other one would filter
            the grid down to nothing with no visible reason why. */}
        <button type="button" className={!root ? 'active' : ''} onClick={() => selectRoot('')}>
          All sources <span>{rootTotal.toLocaleString()}</span>
        </button>
        {facets.roots.map(item => (
          <button
            key={item.key}
            type="button"
            className={root === item.key ? 'active' : ''}
            onClick={() => selectRoot(item.key)}
          >
            {item.key} <span>{item.files.toLocaleString()}</span>
          </button>
        ))}
      </div>

      <div className="vault-filters">
        <CustomerPicker
          customers={facets.customers}
          value={customer}
          onChange={(value) => { setCustomer(value); setFolder(''); setPage(1); }}
        />
        <input
          className="vault-search"
          placeholder="Search file name, artwork code, lead or customer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="vault-select" value={lifecycle} onChange={(e) => { setLifecycle(e.target.value); setPage(1); }}>
          <option value="">All stages</option>
          {facets.lifecycles.filter(item => item.key !== '—' && item.key.toUpperCase() !== 'OUT').map(item => (
            <option key={item.key} value={item.key}>
              {(LIFECYCLE[item.key]?.label) || item.key} ({item.files})
            </option>
          ))}
        </select>
        {activeFilters && <button type="button" className="vault-btn vault-btn-ghost" onClick={resetFilters}>Clear</button>}
      </div>

      <div className="vault-tabs">
        <button type="button" className={!folder ? 'active' : ''} onClick={() => { setFolder(''); setPage(1); }}>
          All folders <span>{total}</span>
        </button>
        {/* Empty folders stay on the strip: a customer's Mockups folder exists
            in Nextcloud whether or not anything has been put in it yet. */}
        {facets.folders.map(item => (
          <button
            key={item.key}
            type="button"
            className={`${folder === item.key ? 'active' : ''} ${item.files ? '' : 'is-empty'}`}
            onClick={() => { setFolder(item.key); setPage(1); }}
          >
            {item.key} <span>{item.files}</span>
          </button>
        ))}
      </div>

      {error && <div className="vault-error">{error}</div>}

      {loading && !rows.length && <div className="vault-empty"><p>Loading the vault…</p></div>}

      {!loading && !rows.length && (
        <div className="vault-empty">
          <p>{folder ? `Nothing in ${folder} yet` : 'No artwork matches these filters'}</p>
          <span>
            {folder
              ? 'The folder exists in Nextcloud — anything dropped into it shows up here within seconds.'
              : activeFilters
                ? 'Clear the filters to see the whole vault.'
                : 'Files uploaded to Nextcloud appear here within seconds.'}
          </span>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="vault-grid">
            {rows.map(asset => (
              <VaultCard
                key={asset.id}
                asset={asset}
                apiBase={apiBase}
                selected={selected?.id === asset.id}
                onSelect={(next) => { setSelected(prev => (prev?.id === next.id ? null : next)); setStatus(''); }}
              />
            ))}
          </div>

          <div className="vault-pager">
            <button type="button" className="vault-btn vault-btn-ghost" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>← Previous</button>
            <span>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()} files
              {pages > 1 && ` · page ${page} of ${pages}`}
            </span>
            <button type="button" className="vault-btn vault-btn-ghost" disabled={page >= pages} onClick={() => setPage(p => Math.min(pages, p + 1))}>Next →</button>
          </div>
        </>
      )}

      {selected && (
        <div className="vault-actionbar">
          <div className="vault-actionbar-file">
            <strong title={selected.file_name}>{selected.file_name}</strong>
            <span>
              {selected.entity_name || 'Unlinked'} · {selected.folder}
              {selected.artwork_code ? ` · ${selected.artwork_code}` : ''}
              {` · ${formatDate(selected.source_modified_at)}`}
            </span>
          </div>
          <div className="vault-actionbar-actions">
            {TARGETS.map(target => (
              <button
                key={target.page}
                type="button"
                className={`vault-btn ${target.primary ? 'vault-btn-primary' : ''}`}
                disabled={Boolean(opening)}
                onClick={() => openIn(target)}
              >
                {opening === target.page ? 'Opening…' : target.label}
              </button>
            ))}
            <button type="button" className="vault-btn" onClick={() => download(selected)}>Download</button>
            <button type="button" className="vault-btn vault-btn-ghost" onClick={() => { setSelected(null); setStatus(''); }}>Close</button>
          </div>
          {status && <div className="vault-actionbar-status">{status}</div>}
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="vault-upload-overlay" onClick={closeUploadModal}>
          <div className="vault-upload-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vault-upload-header">
              <h2>Upload Artwork</h2>
              <button className="vault-upload-close" onClick={closeUploadModal}>×</button>
            </div>
            <div className="vault-upload-body">
              {/* Customer & Folder info */}
              <div className="vault-upload-context">
                <div className="vault-upload-field">
                  <label>Customer</label>
                  <span className={customer ? 'has-value' : 'no-value'}>
                    {customer ? (facets.customers.find(c => c.key === customer)?.name || customer) : 'Select a customer from the vault first'}
                  </span>
                </div>
                <div className="vault-upload-field">
                  <label>Folder</label>
                  <span className={folder ? 'has-value' : 'no-value'}>
                    {folder || 'Artworks (default)'}
                  </span>
                </div>
              </div>

              {/* Lifecycle Selection */}
              <div className="vault-upload-field">
                <label>File Type</label>
                <div className="vault-upload-lifecycle-grid">
                  {UPLOAD_LIFECYCLES.map(lc => (
                    <button
                      key={lc.code}
                      type="button"
                      className={`vault-upload-lc-btn ${uploadLifecycle === lc.code ? 'active' : ''}`}
                      onClick={() => setUploadLifecycle(lc.code)}
                    >
                      <span className={`vault-life vault-life-${LIFECYCLE[lc.code]?.tone || 'src'}`}>{lc.code}</span>
                      <span>{lc.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* File Drop Zone */}
              <div
                className={`vault-upload-dropzone ${uploadFile ? 'has-file' : ''}`}
                onClick={() => uploadInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setUploadFile(f); if (f.type.startsWith('image/')) { const r = new FileReader(); r.onload = (ev) => setUploadPreview(ev.target.result); r.readAsDataURL(f); } } }}
              >
                {uploadPreview ? (
                  <div className="vault-upload-preview">
                    <img src={uploadPreview} alt="Preview" />
                    <span>{uploadFile.name}</span>
                    <span className="vault-upload-size">{fileSize(uploadFile.size)}</span>
                  </div>
                ) : uploadFile ? (
                  <div className="vault-upload-preview">
                    <span className="vault-upload-file-icon">📄</span>
                    <span>{uploadFile.name}</span>
                    <span className="vault-upload-size">{fileSize(uploadFile.size)}</span>
                  </div>
                ) : (
                  <div className="vault-upload-placeholder">
                    <span className="vault-upload-icon">↑</span>
                    <span>Drop file here or click to browse</span>
                    <span className="vault-upload-hint">PNG, JPG, PDF, AI — any artwork file</span>
                  </div>
                )}
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="image/*,.pdf,.ai,.eps,.svg"
                  style={{ display: 'none' }}
                  onChange={handleUploadFileChange}
                />
              </div>

              {uploadMessage && (
                <div className={`vault-upload-message ${uploadMessage.includes('success') ? 'success' : 'error'}`}>
                  {uploadMessage}
                </div>
              )}
            </div>
            <div className="vault-upload-footer">
              <button className="vault-btn" onClick={closeUploadModal}>Cancel</button>
              <button
                className="vault-btn vault-btn-primary"
                onClick={handleUpload}
                disabled={!uploadFile || !customer || uploading}
              >
                {uploading ? 'Uploading...' : 'Upload to Vault'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Vault;
