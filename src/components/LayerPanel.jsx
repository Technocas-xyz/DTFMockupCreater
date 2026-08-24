import React, { useState } from 'react';
import './LayerPanel.css';

function LayerPanel({
  multiLayerEnabled,
  layers,
  activeLayerId,
  onEnableMultiLayer,
  onDisableMultiLayer,
  onAddLayer,
  onRemoveLayer,
  onSelectLayer,
  onToggleVisibility,
  onRenameLayer,
  onReorderLayers,
}) {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);

  const startRename = (layer) => {
    setEditingId(layer.id);
    setEditName(layer.name);
  };

  const commitRename = () => {
    if (editingId && editName.trim()) {
      onRenameLayer(editingId, editName.trim());
    }
    setEditingId(null);
    setEditName('');
  };

  const handleDragStart = (e, index) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (e, toIndex) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== toIndex) {
      onReorderLayers(dragIndex, toIndex);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  // Collapsed state: just show the enable button
  if (!multiLayerEnabled) {
    return (
      <div className="layer-panel layer-panel--collapsed">
        <button className="layer-panel__enable-btn" onClick={onEnableMultiLayer} title="Enable multi-layer mode to place multiple artworks on one garment">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <rect x="7" y="7" width="10" height="10" rx="1" opacity="0.5" />
            <rect x="5" y="5" width="10" height="10" rx="1" opacity="0.7" />
          </svg>
          <span>Enable Layers</span>
        </button>
      </div>
    );
  }

  return (
    <div className="layer-panel layer-panel--expanded">
      <div className="layer-panel__header">
        <h4 className="layer-panel__title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <rect x="7" y="7" width="10" height="10" rx="1" opacity="0.5" />
            <rect x="5" y="5" width="10" height="10" rx="1" opacity="0.7" />
          </svg>
          Layers ({layers.length})
        </h4>
        <div className="layer-panel__header-actions">
          <button className="layer-panel__add-btn" onClick={onAddLayer} title="Add new layer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button className="layer-panel__disable-btn" onClick={onDisableMultiLayer} title="Disable layers (revert to single artwork)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="layer-panel__list">
        {layers.map((layer, index) => (
          <div
            key={layer.id}
            className={`layer-panel__item ${layer.id === activeLayerId ? 'layer-panel__item--active' : ''} ${!layer.visible ? 'layer-panel__item--hidden' : ''} ${dragOverIndex === index ? 'layer-panel__item--drag-over' : ''}`}
            onClick={() => onSelectLayer(layer.id)}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
          >
            {/* Drag handle */}
            <span className="layer-panel__drag-handle" title="Drag to reorder">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="16" y2="6" />
                <line x1="8" y1="12" x2="16" y2="12" />
                <line x1="8" y1="18" x2="16" y2="18" />
              </svg>
            </span>

            {/* Thumbnail */}
            <span className="layer-panel__thumb">
              {layer.artwork ? (
                <img src={layer.artwork} alt={layer.name} />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 16l5-5 4 4 5-5 4 4" />
                </svg>
              )}
            </span>

            {/* Name */}
            {editingId === layer.id ? (
              <input
                className="layer-panel__name-input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null); }}
                onClick={(e) => e.stopPropagation()}
                autoFocus
              />
            ) : (
              <span
                className="layer-panel__name"
                onDoubleClick={(e) => { e.stopPropagation(); startRename(layer); }}
                title="Double-click to rename"
              >
                {layer.name}
              </span>
            )}

            {/* Actions */}
            <div className="layer-panel__item-actions" onClick={(e) => e.stopPropagation()}>
              <button
                className={`layer-panel__vis-btn ${layer.visible ? '' : 'layer-panel__vis-btn--off'}`}
                onClick={() => onToggleVisibility(layer.id, !layer.visible)}
                title={layer.visible ? 'Hide layer' : 'Show layer'}
              >
                {layer.visible ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                )}
              </button>
              {layers.length > 1 && (
                <button
                  className="layer-panel__delete-btn"
                  onClick={() => onRemoveLayer(layer.id)}
                  title="Remove layer"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="layer-panel__footer">
        <span className="layer-panel__hint">Drag to reorder. Double-click name to rename.</span>
      </div>
    </div>
  );
}

export default LayerPanel;
