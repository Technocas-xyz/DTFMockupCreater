// ── Task Manager ─────────────────────────────────────────────────────────────
// Task Management, inside Design Studio. There is no second database and no
// second set of rules: this screen signs the person in to the task app with
// their suite identity and then shows what that app returns for them.
//
// Which view someone gets is decided by their *task app* role, not by their
// studio role — an ADMIN sees every task, the scope tabs and the stat cards; a
// DESIGNER (or anyone else) sees only My Tasks, exactly as they do on
// tasks.decoinkssuite.com.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { detectApiBase } from '../utils/apiConfig';
import { taskApi, taskSignIn } from '../utils/taskApi';
import { toTaskArtworks } from '../utils/vaultArtwork';
import TaskCreatePanel from './TaskCreatePanel';
import TaskDetail, { ArtworkThumb, StatusBadge, PriorityFlag, isOverdue } from './TaskDetail';
import { initials } from '../utils/taskApi';
import './TaskManager.css';

const SCOPES = [
  { key: 'all', label: 'All Tasks' },
  { key: 'team', label: 'Team Tasks' },
  { key: 'mine', label: 'My Tasks' },
];
const STATUSES = ['All', 'Assigned', 'In Progress', 'Submitted', 'Completed', 'Overdue'];

const STAT_CARDS = [
  { key: 'assigned', label: 'Assigned' },
  { key: 'inProgress', label: 'In Progress' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'completedToday', label: 'Completed today' },
  { key: 'overdue', label: 'Overdue', tone: 'danger' },
];

// This page is for work a person does: an admin or manager assigns it, a designer
// opens it here, works it in the studio and completes it. The task app also holds
// machine work (actionType 'A' — the Artwork Extraction queue, ~180 unassigned
// rows), which would bury that flow, so the whole page is scoped to 'H'. Nothing
// is hidden from Task Management itself; it is a filter, not a deletion.
const HUMAN_ONLY = 'H';

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—');
const fmtTime = (v) => (v ? new Date(v).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '');

function TaskManager({ pendingArtworks, onPendingArtworksHandled, onOpenArtwork, openingArtwork }) {
  const [apiBase, setApiBase] = useState(null);
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState(null);

  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);

  const [scope, setScope] = useState('mine');
  const [status, setStatus] = useState('All');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  const [openTaskId, setOpenTaskId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [draftArtworks, setDraftArtworks] = useState([]);
  const [preparing, setPreparing] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => { detectApiBase().then(setApiBase).catch(() => setApiBase('/api')); }, []);

  useEffect(() => {
    let alive = true;
    taskSignIn()
      .then((u) => {
        if (!alive) return;
        setUser(u);
        setScope(u.role === 'ADMIN' ? 'all' : 'mine');
      })
      .catch((e) => alive && setBootError(e.message))
      .finally(() => alive && setBooting(false));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q), 300);
    return () => window.clearTimeout(timer);
  }, [q]);

  // Two things must agree before the admin portal appears: Authentik must have the
  // person in the suite admin group (`user.suiteAdmin`, asserted per sign-in — the
  // same group the suite's Access Manager checks), and Task Management must have
  // them as ADMIN. A designer therefore only ever sees My Tasks, and an account
  // whose task role was raised without the Authentik group does not quietly gain a
  // portal. The API enforces the role half again on every call.
  const isAdmin = user?.role === 'ADMIN' && user?.suiteAdmin === true;
  // A task-app ADMIN that Authentik does not vouch for: say so rather than showing
  // a stripped-down page with no explanation.
  const adminWithoutGroup = user?.role === 'ADMIN' && user?.suiteAdmin !== true;
  // Handing work to someone else is what a SALES account is for, so that role keeps
  // the button whatever Authentik says. An ADMIN gets it through the same gate as the
  // rest of the portal — otherwise the page would deny someone the admin view and
  // still invite them to assign work. The task API enforces the role half again.
  const canCreate = user?.role === 'SALES' || isAdmin;
  const effectiveScope = isAdmin ? scope : 'mine';

  const loadList = useCallback(async () => {
    if (!user) return;
    setListLoading(true);
    try {
      const [list, statPayload] = await Promise.all([
        taskApi.tasks({
          scope: effectiveScope,
          actionType: HUMAN_ONLY,
          ...(status !== 'All' ? { status } : {}),
          ...(debouncedQ.trim() ? { q: debouncedQ.trim() } : {}),
        }),
        taskApi.stats({ actionType: HUMAN_ONLY }).catch(() => null),
      ]);
      setTasks(list.tasks || []);
      if (statPayload) setStats(statPayload.stats);
      setListError(null);
    } catch (e) {
      setListError(e.message);
    } finally {
      setListLoading(false);
    }
  }, [user, effectiveScope, status, debouncedQ]);

  useEffect(() => { loadList(); }, [loadList]);

  // A vault selection sent over with "Send to Task Management": fetch a preview
  // for each file, then open the New Task form with them already attached.
  useEffect(() => {
    if (!pendingArtworks?.length || !apiBase || !user) return;
    let alive = true;
    setPreparing(true);
    toTaskArtworks(pendingArtworks, apiBase)
      .then((payloads) => {
        if (!alive) return;
        setDraftArtworks(payloads);
        setCreateOpen(true);
        setOpenTaskId(null);
      })
      .catch((e) => alive && setNotice(e.message || 'Artwork could not be prepared'))
      .finally(() => {
        if (!alive) return;
        setPreparing(false);
        onPendingArtworksHandled?.();
      });
    return () => { alive = false; };
  }, [pendingArtworks, apiBase, user, onPendingArtworksHandled]);

  const thumbUrlFor = useCallback((artwork) => {
    // Inside the studio the vault itself is reachable, so the preview is drawn
    // live and stays right even after a file is re-saved. The stored thumbnail
    // is the fallback (and what Task Management shows on its own domain).
    if (!apiBase || !artwork?.assetId) return artwork?.thumbData || null;
    return `${apiBase}/central-artwork.php?action=thumb&id=${encodeURIComponent(artwork.assetId)}&w=320&h=240`;
  }, [apiBase]);

  const visibleStats = useMemo(() => {
    if (!stats) return [];
    return STAT_CARDS.map((c) => ({ ...c, value: stats[c.key] ?? 0 }));
  }, [stats]);

  if (booting) {
    return (
      <div className="tm-page">
        <div className="tm-empty">Signing in to Task Management…</div>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="tm-page">
        <header className="tm-header">
          <div>
            <h1>Task Manager</h1>
            <p>Assign and track work without leaving Design Studio.</p>
          </div>
        </header>
        <div className="tm-card tm-blocked">
          <h2>Task Management could not sign you in</h2>
          <p>{bootError}</p>
          <p className="tm-muted">
            Accounts are not created automatically — an administrator adds you under <strong>Users</strong> in
            Task Management (or through Task Management Access in the suite portal), then this page works
            with no further setup.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="tm-page">
      <header className="tm-header">
        <div>
          <h1>Task Manager</h1>
          <p>
            {isAdmin
              ? 'Every task across the organization — assign, review, approve and delete.'
              : 'The tasks assigned to you. Start one, work it in the studio, submit it for review.'}
          </p>
        </div>
        <div className="tm-header-actions">
          <span className="tm-scope-note" title="Automatic (AI) tasks are not shown on this page">Human tasks only</span>
          <span className="tm-whoami">
            <span className="tm-avatar tm-avatar-sm" style={{ background: user.color }}>{initials(user.name)}</span>
            {user.name} <em>· {user.role}</em>
          </span>
          <button type="button" className="tm-btn" onClick={() => { setOpenTaskId(null); loadList(); }}>↻ Refresh</button>
          {canCreate && (
            <button type="button" className="tm-btn tm-btn-primary" onClick={() => { setDraftArtworks([]); setCreateOpen(true); }}>
              + New Task
            </button>
          )}
        </div>
      </header>

      {adminWithoutGroup && (
        <div className="tm-alert">
          You are an administrator in Task Management, but Authentik does not list you under
          <strong> Decoinks Suite Admins</strong> — so this page shows your own tasks only. Ask a suite
          administrator to add you to that group.
        </div>
      )}
      {preparing && <div className="tm-alert">Preparing artwork previews…</div>}
      {notice && <div className="tm-alert tm-alert-error">{notice}</div>}

      {openTaskId ? (
        <TaskDetail
          taskId={openTaskId}
          currentUser={user}
          onBack={() => { setOpenTaskId(null); loadList(); }}
          onOpenArtwork={onOpenArtwork}
          openingArtwork={openingArtwork}
          thumbUrlFor={thumbUrlFor}
          canDelete={isAdmin}
          onDeleted={(taskNo) => {
            setOpenTaskId(null);
            setNotice(`${taskNo} deleted.`);
            window.setTimeout(() => setNotice(''), 6000);
            loadList();
          }}
        />
      ) : (
        <>
          {visibleStats.length > 0 && (
            <div className="tm-stats">
              {visibleStats.map((c) => (
                <div key={c.key} className={`tm-stat ${c.tone === 'danger' && c.value > 0 ? 'tm-stat-danger' : ''}`}>
                  <span className="tm-stat-value">{c.value}</span>
                  <span className="tm-stat-label">{c.label}</span>
                </div>
              ))}
            </div>
          )}

          <div className="tm-card">
            {isAdmin && (
              <div className="tm-scopes">
                {SCOPES.map((s) => (
                  <button key={s.key} type="button" className={scope === s.key ? 'active' : ''} onClick={() => setScope(s.key)}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            <div className="tm-filters">
              <input
                className="tm-input tm-search"
                placeholder="Search by title, task no, artwork or order…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <div className="tm-chips">
                {STATUSES.map((s) => (
                  <button key={s} type="button" className={status === s ? 'active' : ''} onClick={() => setStatus(s)}>{s}</button>
                ))}
              </div>
            </div>

            {listError && <div className="tm-alert tm-alert-error">{listError}</div>}

            {listLoading ? (
              <div className="tm-empty">Loading tasks…</div>
            ) : !tasks.length ? (
              <div className="tm-empty">
                <p>{effectiveScope === 'mine' ? 'No tasks assigned to you' : 'No human tasks match these filters'}</p>
                {effectiveScope === 'mine' && <span className="tm-muted">New work shows up here as soon as someone assigns it.</span>}
              </div>
            ) : (
              <div className="tm-table-wrap">
                <table className="tm-table">
                  <thead>
                    <tr>
                      <th>Task No</th>
                      <th>Task</th>
                      <th>Artwork</th>
                      <th>Related</th>
                      {effectiveScope !== 'mine' && <th>Assigned To</th>}
                      <th>Assigned By</th>
                      <th>Priority</th>
                      <th>Due</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((t) => {
                      const late = isOverdue(t);
                      return (
                        <tr key={t.id} onClick={() => setOpenTaskId(t.id)}>
                          <td className="tm-td-no">{t.taskNo}</td>
                          <td>
                            <div className="tm-td-title">{t.title}</div>
                            <div className="tm-muted">{t.taskType}</div>
                          </td>
                          <td>
                            {t.artworks?.length ? (
                              <span className="tm-thumb-strip">
                                {t.artworks.slice(0, 3).map((a) => (
                                  <ArtworkThumb key={a.id} artwork={a} thumbUrlFor={thumbUrlFor} />
                                ))}
                                {t.artworks.length > 3 && <em>+{t.artworks.length - 3}</em>}
                              </span>
                            ) : <span className="tm-muted">—</span>}
                          </td>
                          <td>
                            <span className="tm-chip">{t.entityType}</span>
                            <div className="tm-muted">{t.entityId}</div>
                          </td>
                          {effectiveScope !== 'mine' && (
                            <td>
                              {t.assignedUser ? (
                                <span className="tm-person">
                                  <span className="tm-avatar tm-avatar-xs" style={{ background: t.assignedUser.color }}>{initials(t.assignedUser.name)}</span>
                                  {t.assignedUser.name}
                                </span>
                              ) : <span className="tm-muted">Unassigned</span>}
                            </td>
                          )}
                          <td>
                            <span className="tm-person">
                              <span className="tm-avatar tm-avatar-xs" style={{ background: t.createdBy?.color || '#605E5C' }}>{initials(t.createdBy?.name || '?')}</span>
                              {t.createdBy?.name || '—'}
                            </span>
                          </td>
                          <td><PriorityFlag priority={t.priority} /></td>
                          <td className={late ? 'tm-due-late' : ''}>
                            <div>{fmtDate(t.dueAt)}</div>
                            <div className="tm-muted">{fmtTime(t.dueAt)}</div>
                          </td>
                          <td><StatusBadge status={late ? 'Overdue' : t.status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <TaskCreatePanel
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(task) => {
          setDraftArtworks([]);
          setNotice(`${task.taskNo} created and assigned to ${task.assignedUser?.name || 'the assignee'}.`);
          window.setTimeout(() => setNotice(''), 6000);
          loadList();
        }}
        artworks={draftArtworks}
        onRemoveArtwork={(assetId) => setDraftArtworks((list) => list.filter((a) => a.assetId !== assetId))}
        thumbUrlFor={thumbUrlFor}
      />
    </div>
  );
}

export default TaskManager;
