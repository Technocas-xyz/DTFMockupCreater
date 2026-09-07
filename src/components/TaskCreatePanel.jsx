// New Task — the Task Management create form, opened inside Design Studio so a
// job can be handed to a designer without leaving the vault. Everything it
// submits goes to the task API; the only thing this app adds is the artwork
// section, which carries the files picked in the vault (their own names, their
// own thumbnails) along with the task.
import React, { useEffect, useRef, useState } from 'react';
import { taskApi, initials } from '../utils/taskApi';
import TaskVoiceRecorder from './TaskVoiceRecorder';
import { ArtworkThumb } from './TaskDetail';

const TASK_TYPES = [
  'Background Removal', 'Mockup Creation', 'Production Artwork', 'Artwork Extraction',
  'QA Review', 'Gangsheet Preparation', 'Follow-up', 'Bug Fix', 'Hardware', 'Access Request',
];
const ENTITY_TYPES = ['Artwork', 'Sales Order', 'Lead', 'System'];
const PRIORITIES = ['Urgent', 'High', 'Medium', 'Low'];
const MAX_VOICE_NOTES = 5;

const baseName = (name = '') => name.replace(/\.[^.]+$/, '');

function Section({ n, title, optional, children }) {
  return (
    <section className="tm-card tm-form-section">
      <div className="tm-section-head">
        <span className="tm-step">{n}</span>
        <h3>{title}</h3>
        {optional && <span className="tm-optional">(Optional)</span>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="tm-field">
      <span className="tm-field-label">{label}{required && <em> *</em>}</span>
      {children}
    </label>
  );
}

function TaskCreatePanel({ open, onClose, onCreated, artworks = [], onRemoveArtwork, thumbUrlFor }) {
  const [assignees, setAssignees] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    title: '', taskType: TASK_TYPES[0], priority: 'High',
    entityType: 'Artwork', entityId: '', assignedUserId: '',
    dueAt: '', estimatedMinutes: '', description: '',
  });
  const [checklist, setChecklist] = useState([{ item: '', isRequired: true }]);
  const [voiceNotes, setVoiceNotes] = useState([]); // [{ audio, transcript }]
  const [activeNote, setActiveNote] = useState(null); // recorded but not yet added to the list
  const voiceNotesRef = useRef(voiceNotes);
  useEffect(() => { voiceNotesRef.current = voiceNotes; }, [voiceNotes]);

  // Handles both the first emit and the late transcript upgrade — if the audio has
  // already moved into the list, update it there instead of in the slot.
  const onVoice = (audio, transcript) => {
    if (!audio) return setActiveNote(null);
    if (voiceNotesRef.current.some((n) => n.audio === audio)) {
      setVoiceNotes((list) => list.map((n) => (n.audio === audio ? { ...n, transcript } : n)));
    } else {
      setActiveNote({ audio, transcript });
    }
  };

  const addAnotherNote = () => {
    if (!activeNote) return;
    setVoiceNotes((list) => [...list, activeNote]);
    setActiveNote(null);
  };

  useEffect(() => {
    if (!open) return;
    setError(null);
    setVoiceNotes([]);
    setActiveNote(null);
    taskApi.assignableUsers()
      .then((d) => {
        setAssignees(d.users || []);
        setForm((f) => ({ ...f, assignedUserId: f.assignedUserId || d.users?.[0]?.id || '' }));
      })
      .catch((e) => setError(e.message));
  }, [open]);

  // Opening the panel from the vault fills in what the selection already tells us:
  // the artwork's own code (or its name) as the related record, and a title the
  // person can accept or type over.
  useEffect(() => {
    if (!open || !artworks.length) return;
    const first = artworks[0];
    setForm((f) => ({
      ...f,
      entityType: 'Artwork',
      entityId: f.entityId || first.artworkCode || first.fileName,
      title: f.title || (artworks.length === 1
        ? baseName(first.fileName)
        : `${artworks.length} artworks — ${first.customerName || 'vault selection'}`),
    }));
  }, [open, artworks]);

  if (!open) return null;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const selectedAssignee = assignees.find((a) => a.id === form.assignedUserId);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { task } = await taskApi.createTask({
        title: form.title,
        taskType: form.taskType,
        priority: form.priority,
        entityType: form.entityType,
        entityId: form.entityId || 'GENERAL',
        assignedUserId: form.assignedUserId,
        description: form.description || undefined,
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : undefined,
        estimatedMinutes: form.estimatedMinutes ? Number(form.estimatedMinutes) : undefined,
        voiceNotes: [...voiceNotes, ...(activeNote ? [activeNote] : [])].map((n) => ({
          audioData: n.audio,
          transcript: n.transcript || undefined,
        })),
        checklist: checklist.filter((c) => c.item.trim()),
        artworks,
      });
      onCreated?.(task);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tm-overlay" onClick={onClose}>
      <div className="tm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="tm-panel-head">
          <div>
            <h2>Create New Task</h2>
            <p>Assign the work to someone in the organization — it appears in Task Management straight away.</p>
          </div>
          <div className="tm-panel-actions">
            <button type="button" className="tm-btn" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="tm-btn tm-btn-primary"
              onClick={submit}
              disabled={busy || !form.title || !form.assignedUserId}
            >
              {busy ? 'Creating…' : 'Create Task'}
            </button>
          </div>
        </div>

        {error && <div className="tm-alert tm-alert-error">{error}</div>}

        <div className="tm-panel-body">
          <div className="tm-col">
            <Section n={1} title="Task Information">
              <div className="tm-grid-2">
                <div className="tm-span-2">
                  <Field label="Task Title" required>
                    <input className="tm-input" value={form.title} onChange={set('title')} placeholder="e.g. Background Removal" />
                  </Field>
                </div>
                <Field label="Task Type" required>
                  <select className="tm-input" value={form.taskType} onChange={set('taskType')}>
                    {TASK_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Priority" required>
                  <select className="tm-input" value={form.priority} onChange={set('priority')}>
                    {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </Field>
                <Field label="Related Module" required>
                  <select className="tm-input" value={form.entityType} onChange={set('entityType')}>
                    {ENTITY_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Related Record" required>
                  <input className="tm-input" value={form.entityId} onChange={set('entityId')} placeholder="AW-2026-000125" />
                </Field>
              </div>
            </Section>

            <Section n={2} title="Assignment">
              <Field label="Assign To" required>
                <select className="tm-input" value={form.assignedUserId} onChange={set('assignedUserId')}>
                  {assignees.length === 0 && <option value="">No assignable users</option>}
                  {assignees.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role.toLowerCase()}) · {u.openTasks} open · {u.dueToday} due today
                    </option>
                  ))}
                </select>
              </Field>
              {selectedAssignee && (
                <div className="tm-assignee">
                  <span className="tm-avatar" style={{ background: selectedAssignee.color }}>{initials(selectedAssignee.name)}</span>
                  <div>
                    <div className="tm-assignee-name">{selectedAssignee.name}</div>
                    <div className="tm-assignee-meta">
                      {selectedAssignee.title} · {selectedAssignee.openTasks} open · {selectedAssignee.overdue} overdue
                    </div>
                  </div>
                </div>
              )}
            </Section>

            <Section n={3} title="Schedule & SLA">
              <div className="tm-grid-2">
                <Field label="Due Date & Time">
                  <input className="tm-input" type="datetime-local" value={form.dueAt} onChange={set('dueAt')} />
                </Field>
                <Field label="Estimated (min)">
                  <input className="tm-input" type="number" value={form.estimatedMinutes} onChange={set('estimatedMinutes')} placeholder="45" />
                </Field>
              </div>
            </Section>
          </div>

          <div className="tm-col">
            {/* The reason this form lives in Design Studio: the files the designer
                needs are already selected, with the names the vault gave them. */}
            <Section n={4} title="Artwork from the Vault" optional={!artworks.length}>
              {artworks.length === 0 ? (
                <p className="tm-muted">
                  Nothing selected. Pick files in the Vault and choose <strong>Send to Task Management</strong> —
                  they arrive here with their own names and previews.
                </p>
              ) : (
                <>
                  <div className="tm-art-grid">
                    {artworks.map((a) => (
                      <figure key={a.assetId} className="tm-art">
                        <span className="tm-art-img">
                          <ArtworkThumb artwork={a} thumbUrlFor={thumbUrlFor} />
                        </span>
                        <figcaption title={a.fileName}>{a.fileName}</figcaption>
                        <span className="tm-art-sub">{a.customerName || 'Unlinked'}{a.folder ? ` · ${a.folder}` : ''}</span>
                        {onRemoveArtwork && (
                          <button type="button" className="tm-art-remove" title="Remove" onClick={() => onRemoveArtwork(a.assetId)}>×</button>
                        )}
                      </figure>
                    ))}
                  </div>
                  <p className="tm-muted tm-art-note">
                    {artworks.length} file{artworks.length > 1 ? 's' : ''} — the originals stay in the vault; the designer opens them from the task.
                  </p>
                </>
              )}
            </Section>

            <Section n={5} title="Checklist" optional>
              <div className="tm-checklist-edit">
                {checklist.map((c, i) => (
                  <div key={i} className="tm-check-row">
                    <input
                      className="tm-input"
                      value={c.item}
                      placeholder={`Checklist item ${i + 1}`}
                      onChange={(e) => setChecklist((l) => l.map((x, j) => (j === i ? { ...x, item: e.target.value } : x)))}
                    />
                    <button type="button" className="tm-icon-btn tm-danger-hover" onClick={() => setChecklist((l) => l.filter((_, j) => j !== i))}>🗑</button>
                  </div>
                ))}
              </div>
              <button type="button" className="tm-link-btn" onClick={() => setChecklist((l) => [...l, { item: '', isRequired: true }])}>
                + Add Item
              </button>
            </Section>

            <Section n={6} title="Instructions">
              <textarea
                className="tm-input tm-textarea"
                value={form.description}
                onChange={set('description')}
                placeholder="Remove the white background from the artwork. Clean the edges. Save as transparent PNG."
              />
              <div className="tm-voice-list">
                {voiceNotes.map((n, i) => (
                  <div key={i} className="tm-voice-note">
                    <div className="tm-voice-row">
                      <span className="tm-voice-no">#{i + 1}</span>
                      <audio controls src={n.audio} className="tm-audio" />
                      <button type="button" className="tm-icon-btn tm-danger-hover" title="Delete voice note" onClick={() => setVoiceNotes((list) => list.filter((_, j) => j !== i))}>🗑</button>
                    </div>
                    {n.transcript && <p className="tm-transcript">“{n.transcript}”</p>}
                  </div>
                ))}
                {voiceNotes.length + (activeNote ? 1 : 0) < MAX_VOICE_NOTES && (
                  <>
                    <TaskVoiceRecorder value={activeNote?.audio || null} onChange={onVoice} />
                    {activeNote?.transcript && <p className="tm-transcript">“{activeNote.transcript}”</p>}
                    {activeNote && (
                      <button type="button" className="tm-link-btn" onClick={addAnotherNote}>+ Record another voice note</button>
                    )}
                  </>
                )}
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TaskCreatePanel;
