import React, { useState, useEffect, useCallback } from 'react';
import { detectApiBase } from '../utils/apiConfig';
import './GarmentTypes.css';

const ALL_FITS = ['Men', 'Women', 'Unisex', 'Kids'];

function GarmentTypes() {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editFits, setEditFits] = useState([]);
  const [newName, setNewName] = useState('');
  const [newFits, setNewFits] = useState(['Men', 'Women', 'Unisex']);
  const [message, setMessage] = useState('');

  const loadTypes = useCallback(async () => {
    try {
      const base = await detectApiBase();
      const res = await fetch(`${base}/garment-types.php`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setTypes(Array.isArray(data) ? data : []);
    } catch (err) {
      setMessage('Failed to load garment types');
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadTypes(); }, [loadTypes]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    if (newFits.length === 0) { setMessage('Select at least one fit'); return; }
    try {
      const base = await detectApiBase();
      const res = await fetch(`${base}/garment-types.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), fits: newFits }),
      });
      const data = await res.json();
      if (!res.ok) { setMessage(data.error || 'Failed to add'); return; }
      setNewName('');
      setNewFits(['Men', 'Women', 'Unisex']);
      setMessage('Type added successfully');
      loadTypes();
    } catch { setMessage('Error adding type'); }
    setTimeout(() => setMessage(''), 3000);
  };

  const handleUpdate = async (id) => {
    if (!editName.trim()) return;
    try {
      const base = await detectApiBase();
      await fetch(`${base}/garment-types.php`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: editName.trim(), fits: editFits }),
      });
      setEditingId(null);
      setMessage('Type updated');
      loadTypes();
    } catch { setMessage('Error updating type'); }
    setTimeout(() => setMessage(''), 3000);
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      const base = await detectApiBase();
      await fetch(`${base}/garment-types.php`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setMessage('Type deleted');
      loadTypes();
    } catch { setMessage('Error deleting type'); }
    setTimeout(() => setMessage(''), 3000);
  };

  const startEdit = (type) => {
    setEditingId(type.id);
    setEditName(type.name);
    setEditFits([...type.fits]);
  };

  const toggleFit = (fit, isNew = false) => {
    if (isNew) {
      setNewFits(prev => prev.includes(fit) ? prev.filter(f => f !== fit) : [...prev, fit]);
    } else {
      setEditFits(prev => prev.includes(fit) ? prev.filter(f => f !== fit) : [...prev, fit]);
    }
  };

  if (loading) return <div className="gt-loading">Loading garment types...</div>;

  return (
    <div className="garment-types-page">
      <div className="gt-header">
        <div>
          <h1>Garment Types</h1>
          <p>Manage garment categories and their fit mappings</p>
        </div>
      </div>

      {message && <div className="gt-message">{message}</div>}

      {/* Add New Type */}
      <div className="gt-add-section">
        <h3>Add New Type</h3>
        <div className="gt-add-form">
          <input
            type="text"
            placeholder="Type name (e.g. Polo Shirt)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="gt-input"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <div className="gt-fits-row">
            {ALL_FITS.map(fit => (
              <label key={fit} className={`gt-fit-chip ${newFits.includes(fit) ? 'active' : ''}`}>
                <input type="checkbox" checked={newFits.includes(fit)} onChange={() => toggleFit(fit, true)} />
                {fit}
              </label>
            ))}
          </div>
          <button className="gt-btn-add" onClick={handleAdd} disabled={!newName.trim()}>
            + Add Type
          </button>
        </div>
      </div>

      {/* Types List */}
      <div className="gt-list">
        <h3>Current Types ({types.length})</h3>
        <div className="gt-table-wrap">
          <table className="gt-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Fits</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {types.map(type => (
                <tr key={type.id}>
                  <td>
                    {editingId === type.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="gt-input-sm"
                        onKeyDown={(e) => e.key === 'Enter' && handleUpdate(type.id)}
                      />
                    ) : (
                      <span className="gt-type-name">{type.name}</span>
                    )}
                  </td>
                  <td>
                    {editingId === type.id ? (
                      <div className="gt-fits-row">
                        {ALL_FITS.map(fit => (
                          <label key={fit} className={`gt-fit-chip sm ${editFits.includes(fit) ? 'active' : ''}`}>
                            <input type="checkbox" checked={editFits.includes(fit)} onChange={() => toggleFit(fit)} />
                            {fit}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="gt-fits-display">
                        {type.fits.map(fit => (
                          <span key={fit} className="gt-fit-badge">{fit}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="gt-actions">
                    {editingId === type.id ? (
                      <>
                        <button className="gt-btn-save" onClick={() => handleUpdate(type.id)}>Save</button>
                        <button className="gt-btn-cancel" onClick={() => setEditingId(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className="gt-btn-edit" onClick={() => startEdit(type)}>Edit</button>
                        <button className="gt-btn-delete" onClick={() => handleDelete(type.id, type.name)}>Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default GarmentTypes;
